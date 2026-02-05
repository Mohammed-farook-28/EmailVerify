import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { apiKey, type ApiKey, type NewApiKey } from '../db/schema.js';
import { eq, and, count, gte, isNull, or } from 'drizzle-orm';
import { redis } from '../config/redis.js';
import { logger as pinoLogger } from '../config/logger.js';

const logger = pinoLogger.child({ module: 'api-key-service' });

// Maximum API keys per user
const MAX_KEYS_PER_USER = 10;

// Expiration options mapping
const EXPIRATION_MAP: Record<string, number | null> = {
  '1m': 30 * 24 * 60 * 60 * 1000,      // 1 month in ms
  '3m': 90 * 24 * 60 * 60 * 1000,      // 3 months
  '6m': 180 * 24 * 60 * 60 * 1000,     // 6 months
  '1y': 365 * 24 * 60 * 60 * 1000,     // 1 year
  'never': null,                         // Never expires
};

export interface CreateApiKeyParams {
  userId: string;
  name: string;
  expiresIn?: '1m' | '3m' | '6m' | '1y' | 'never';
  isTest?: boolean;
}

export interface CreateApiKeyResult {
  id: string;
  name: string;
  keyPrefix: string;
  fullKey: string; // Only returned at creation time!
  isTest: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  keyPrefix: string;
  isTest: boolean;
  status: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  usageCount: number;
  createdAt: Date;
}

/**
 * Generate a cryptographically secure API key
 * Format: ek_[32 bytes Base64 URL-safe] or ek_test_[32 bytes Base64 URL-safe]
 */
function generateApiKey(isTest: boolean): string {
  const randomBytes = crypto.randomBytes(32);
  const base64 = randomBytes.toString('base64url');
  return isTest ? `ek_test_${base64}` : `ek_${base64}`;
}

/**
 * Hash an API key for storage (SHA-256)
 */
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Get the prefix of an API key for display
 */
function getKeyPrefix(key: string): string {
  // Show first 12 characters (e.g., "ek_Ue7HpvL9...")
  return key.slice(0, 12);
}

/**
 * Count active/non-hard-deleted keys for a user
 */
async function countUserKeys(userId: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(apiKey)
    .where(
      and(
        eq(apiKey.userId, userId),
        or(
          isNull(apiKey.hardDeleteAt),
          gte(apiKey.hardDeleteAt, new Date())
        )
      )
    );
  return result[0]?.count ?? 0;
}

/**
 * Create a new API key for a user
 */
export async function createApiKey(params: CreateApiKeyParams): Promise<CreateApiKeyResult> {
  const { userId, name, expiresIn = 'never', isTest = false } = params;

  // Check key limit
  const currentCount = await countUserKeys(userId);
  if (currentCount >= MAX_KEYS_PER_USER) {
    throw new ApiKeyError(
      'MAX_KEYS_EXCEEDED',
      `Maximum of ${MAX_KEYS_PER_USER} API keys allowed per user`
    );
  }

  // Generate the key
  const fullKey = generateApiKey(isTest);
  const keyHash = hashApiKey(fullKey);
  const keyPrefix = getKeyPrefix(fullKey);

  // Calculate expiration date
  const expirationMs = EXPIRATION_MAP[expiresIn];
  const expiresAt = expirationMs ? new Date(Date.now() + expirationMs) : null;

  // Create the key record
  const keyId = nanoid();
  const now = new Date();

  const newKey: NewApiKey = {
    id: keyId,
    userId,
    name,
    keyHash,
    keyPrefix,
    isTest,
    status: 'active',
    expiresAt,
    lastUsedAt: null,
    usageCount: 0,
    createdAt: now,
    revokedAt: null,
    hardDeleteAt: null,
  };

  await db.insert(apiKey).values(newKey);

  logger.info({ keyId, userId, isTest }, 'API key created');

  return {
    id: keyId,
    name,
    keyPrefix,
    fullKey, // Only returned at creation!
    isTest,
    expiresAt,
    createdAt: now,
  };
}

/**
 * List all API keys for a user (with masked values)
 */
export async function listApiKeys(userId: string): Promise<ApiKeyListItem[]> {
  const keys = await db.query.apiKey.findMany({
    where: and(
      eq(apiKey.userId, userId),
      or(
        isNull(apiKey.hardDeleteAt),
        gte(apiKey.hardDeleteAt, new Date())
      )
    ),
    orderBy: (apiKey, { desc }) => [desc(apiKey.createdAt)],
  });

  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    isTest: key.isTest,
    status: key.status,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    usageCount: key.usageCount,
    createdAt: key.createdAt,
  }));
}

/**
 * Get a single API key by ID (for the owning user)
 */
export async function getApiKey(keyId: string, userId: string): Promise<ApiKeyListItem | null> {
  const key = await db.query.apiKey.findFirst({
    where: and(
      eq(apiKey.id, keyId),
      eq(apiKey.userId, userId)
    ),
  });

  if (!key) {
    return null;
  }

  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    isTest: key.isTest,
    status: key.status,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    usageCount: key.usageCount,
    createdAt: key.createdAt,
  };
}

/**
 * Soft-delete (revoke) an API key
 */
export async function deleteApiKey(keyId: string, userId: string): Promise<boolean> {
  const key = await db.query.apiKey.findFirst({
    where: and(
      eq(apiKey.id, keyId),
      eq(apiKey.userId, userId)
    ),
  });

  if (!key) {
    return false;
  }

  if (key.status === 'revoked') {
    return true; // Already revoked
  }

  const now = new Date();
  const hardDeleteAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days from now

  await db
    .update(apiKey)
    .set({
      status: 'revoked',
      revokedAt: now,
      hardDeleteAt,
    })
    .where(eq(apiKey.id, keyId));

  // Invalidate cache
  await redis.del(`apikey:info:${key.keyHash}`);

  logger.info({ keyId, userId }, 'API key revoked');

  return true;
}

/**
 * Validate an API key and return user info
 * Used by the auth middleware
 */
export async function validateApiKey(keyValue: string): Promise<{
  keyId: string;
  userId: string;
  isTest: boolean;
  userTier: string;
} | null> {
  const keyHash = hashApiKey(keyValue);

  const key = await db.query.apiKey.findFirst({
    where: eq(apiKey.keyHash, keyHash),
  });

  if (!key) {
    return null;
  }

  // Check status
  if (key.status !== 'active') {
    return null;
  }

  // Check expiration
  if (key.expiresAt && key.expiresAt < new Date()) {
    // Mark as expired
    await db
      .update(apiKey)
      .set({ status: 'expired' })
      .where(eq(apiKey.id, key.id));
    return null;
  }

  // Get user tier (simplified - actual implementation uses subscription service)
  const userTier = 'starter'; // Default, will be overridden by auth middleware

  return {
    keyId: key.id,
    userId: key.userId,
    isTest: key.isTest,
    userTier,
  };
}

/**
 * Increment usage count for an API key (called after successful API request)
 */
export async function incrementUsageCount(keyId: string): Promise<void> {
  const key = await db.query.apiKey.findFirst({
    where: eq(apiKey.id, keyId),
    columns: { usageCount: true },
  });

  if (key) {
    await db
      .update(apiKey)
      .set({ usageCount: key.usageCount + 1 })
      .where(eq(apiKey.id, keyId));
  }
}

/**
 * Update last_used_at for an API key (synchronous - use only for critical paths)
 */
export async function updateLastUsed(keyId: string): Promise<void> {
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, keyId));
}

// Redis key for batched last_used_at updates
const LAST_USED_BATCH_KEY = 'apikey:last_used:batch';
const LAST_USED_FLUSH_INTERVAL = 60 * 1000; // Flush every 60 seconds

/**
 * Queue a last_used_at update for batching (reduces DB writes)
 * Updates are flushed every 60 seconds or when batch reaches 100 items
 */
export async function queueLastUsedUpdate(keyId: string): Promise<void> {
  const now = Date.now();
  // Store keyId -> timestamp in Redis hash
  await redis.hset(LAST_USED_BATCH_KEY, keyId, now.toString());
}

/**
 * Flush batched last_used_at updates to the database
 * Should be called periodically by a background task
 */
export async function flushLastUsedUpdates(): Promise<{ flushedCount: number }> {
  // Get all pending updates
  const pending = await redis.hgetall(LAST_USED_BATCH_KEY);
  const keyIds = Object.keys(pending);

  if (keyIds.length === 0) {
    return { flushedCount: 0 };
  }

  logger.info({ count: keyIds.length }, 'Flushing batched last_used_at updates');

  let flushedCount = 0;
  const BATCH_SIZE = 100;

  // Process in batches to avoid overwhelming the database
  for (let i = 0; i < keyIds.length; i += BATCH_SIZE) {
    const batch = keyIds.slice(i, i + BATCH_SIZE);

    // Update each key individually (could be optimized with bulk update)
    for (const keyId of batch) {
      const timestamp = parseInt(pending[keyId], 10);
      const lastUsedAt = new Date(timestamp);

      try {
        await db
          .update(apiKey)
          .set({ lastUsedAt })
          .where(eq(apiKey.id, keyId));
        flushedCount++;
      } catch (err) {
        logger.error({ err, keyId }, 'Failed to update last_used_at');
      }
    }

    // Remove processed keys from Redis
    if (batch.length > 0) {
      await redis.hdel(LAST_USED_BATCH_KEY, ...batch);
    }
  }

  logger.info({ flushedCount }, 'Flushed last_used_at updates');

  return { flushedCount };
}

// Start the periodic flush task
let flushIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background flush task for last_used_at updates
 */
export function startLastUsedFlushTask(): void {
  if (flushIntervalId) {
    return; // Already running
  }

  flushIntervalId = setInterval(async () => {
    try {
      await flushLastUsedUpdates();
    } catch (err) {
      logger.error({ err }, 'Error in last_used_at flush task');
    }
  }, LAST_USED_FLUSH_INTERVAL);

  logger.info({ intervalMs: LAST_USED_FLUSH_INTERVAL }, 'Started last_used_at flush task');
}

/**
 * Stop the background flush task
 */
export function stopLastUsedFlushTask(): void {
  if (flushIntervalId) {
    clearInterval(flushIntervalId);
    flushIntervalId = null;
    logger.info('Stopped last_used_at flush task');
  }
}

/**
 * Custom error class for API key operations
 */
export class ApiKeyError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

export default {
  createApiKey,
  listApiKeys,
  getApiKey,
  deleteApiKey,
  validateApiKey,
  incrementUsageCount,
  updateLastUsed,
  queueLastUsedUpdate,
  flushLastUsedUpdates,
  startLastUsedFlushTask,
  stopLastUsedFlushTask,
  ApiKeyError,
};
