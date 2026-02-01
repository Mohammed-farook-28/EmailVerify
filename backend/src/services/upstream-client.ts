/**
 * Upstream Email Verification API Client
 *
 * Uses undici for high-performance HTTP requests with connection pooling.
 * Implements idempotency key generation to prevent duplicate charges.
 */

import { Pool, request } from 'undici';
import { createHash } from 'crypto';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { activeConnections, connectionPoolSize } from '../lib/metrics.js';

// Configure connection pool
const UPSTREAM_API_URL = process.env.UPSTREAM_API_URL || 'http://localhost:8080';
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || 'mock-api-key';

const pool = new Pool(UPSTREAM_API_URL, {
  connections: 200, // Max connections
  pipelining: 1, // Disable pipelining for now
  keepAliveTimeout: 60_000, // 60s
  keepAliveMaxTimeout: 600_000, // 10min
});

// Track pool size for metrics
connectionPoolSize.set(200);

export interface VerificationRequest {
  email: string;
  userId: string;
}

export interface VerificationResult {
  email: string;
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  score: number;
  deliverability: 'deliverable' | 'undeliverable' | 'risky' | 'unknown';
  attributes: {
    disposable: boolean;
    freeProvider: boolean;
    roleAccount: boolean;
    catchAll: boolean;
    mxRecordsFound: boolean;
    smtpValid: boolean;
  };
  serverInfo: {
    processingTime: number;
    requestId: string;
    timestamp: string;
  };
}

/**
 * Generate idempotency key for a verification request
 * Format: {userId}:{SHA256(email)}:{timestamp}
 *
 * @param email - Email to verify
 * @param userId - User making the request
 * @returns Idempotency key
 */
function generateIdempotencyKey(email: string, userId: string): string {
  const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex');
  const timestamp = Date.now();
  return `${userId}:${emailHash}:${timestamp}`;
}

/**
 * Check if idempotency key exists in Redis
 *
 * @param key - Idempotency key
 * @returns Cached result if exists, null otherwise
 */
async function getIdempotentResult(key: string): Promise<VerificationResult | null> {
  try {
    const cached = await redis.get(`idempotency:${key}`);
    if (cached) {
      logger.info({ idempotencyKey: key }, 'Idempotent request detected, returning cached result');
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    logger.warn({ error, idempotencyKey: key }, 'Failed to check idempotency key');
    return null;
  }
}

/**
 * Store idempotent result in Redis with 1hr TTL
 *
 * @param key - Idempotency key
 * @param result - Verification result
 */
async function storeIdempotentResult(key: string, result: VerificationResult): Promise<void> {
  try {
    await redis.setex(`idempotency:${key}`, 3600, JSON.stringify(result)); // 1hr TTL
    logger.debug({ idempotencyKey: key }, 'Stored idempotent result');
  } catch (error) {
    logger.warn({ error, idempotencyKey: key }, 'Failed to store idempotency key');
  }
}

/**
 * Call upstream email verification API
 *
 * @param email - Email to verify
 * @param userId - User making the request
 * @returns Verification result
 * @throws Error if upstream API fails
 */
export async function callUpstreamAPI(
  email: string,
  userId: string
): Promise<VerificationResult> {
  const idempotencyKey = generateIdempotencyKey(email, userId);

  // Check for existing result (idempotency)
  const cachedResult = await getIdempotentResult(idempotencyKey);
  if (cachedResult) {
    return cachedResult;
  }

  const startTime = Date.now();

  try {
    activeConnections.inc();

    const response = await request(
      `${UPSTREAM_API_URL}/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${UPSTREAM_API_KEY}`,
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ email, idempotencyKey }),
        bodyTimeout: 10_000, // 10s read timeout
        headersTimeout: 3_000, // 3s connect timeout
      }
    );

    const duration = Date.now() - startTime;

    if (response.statusCode !== 200) {
      const errorText = await response.body.text();
      logger.error(
        {
          email,
          userId,
          statusCode: response.statusCode,
          error: errorText,
          duration,
        },
        'Upstream API returned non-200 status'
      );
      throw new Error(`Upstream API error: ${response.statusCode} - ${errorText}`);
    }

    const result = await response.body.json() as VerificationResult;

    logger.info(
      {
        email,
        userId,
        status: result.status,
        score: result.score,
        duration,
      },
      'Successfully verified email via upstream API'
    );

    // Store result for idempotency
    await storeIdempotentResult(idempotencyKey, result);

    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    logger.error(
      {
        email,
        userId,
        error: error.message,
        duration,
      },
      'Failed to call upstream API'
    );

    throw error;
  } finally {
    activeConnections.dec();
  }
}

/**
 * Close the connection pool gracefully
 */
export async function closePool(): Promise<void> {
  await pool.close();
  logger.info('Upstream API connection pool closed');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await closePool();
});

export default {
  callUpstreamAPI,
  closePool,
};
