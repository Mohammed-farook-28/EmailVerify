/**
 * Upstream Email Verification API Client
 *
 * Uses undici for high-performance HTTP requests with connection pooling.
 * Implements idempotency key generation to prevent duplicate charges.
 *
 * Supports two modes:
 * - Mock API (localhost:8080): Uses POST /verify/single with same response format
 * - Real EmailVerify.ai API: Uses POST /verify/single with EMAILVERIFY-API-KEY header
 */

import { Pool, request } from 'undici';
import { createHash } from 'crypto';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { activeConnections, connectionPoolSize } from '../lib/metrics.js';

// Configure connection pool
const UPSTREAM_API_URL = process.env.UPSTREAM_API_URL || 'http://localhost:8080';
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || 'mock-api-key';
const IS_MOCK = UPSTREAM_API_URL.includes('localhost');

// Pool needs just the origin (scheme + host), not the path
const upstreamOrigin = new URL(UPSTREAM_API_URL).origin;
const pool = new Pool(upstreamOrigin, {
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

/** Raw response shape from the real EmailVerify.ai API (nested under `data`) */
interface UpstreamApiResponse {
  success: boolean;
  code: string;
  message: string;
  data: UpstreamRawResponse;
}

interface UpstreamRawResponse {
  email: string;
  status: string;
  score: number;
  is_deliverable: boolean;
  is_disposable: boolean;
  is_catchall: boolean;
  is_role: boolean;
  is_free: boolean;
  domain: string;
  mx_records: string[];
  smtp_check: boolean;
  reason: string;
  response_time: number;
  credits_used: number;
}

/**
 * Map real EmailVerify.ai response to our internal VerificationResult format
 */
function mapUpstreamResponse(raw: UpstreamRawResponse): VerificationResult {
  // Map upstream status strings to our 4-value enum
  // The upstream API returns extra statuses like 'role', 'disposable', 'catch-all'
  const statusMap: Record<string, VerificationResult['status']> = {
    valid: 'valid',
    invalid: 'invalid',
    risky: 'risky',
    unknown: 'unknown',
    role: 'risky',
    disposable: 'invalid',
    'catch-all': 'risky',
    'catch_all': 'risky',
    spamtrap: 'invalid',
    abuse: 'risky',
    'do_not_mail': 'invalid',
  };

  return {
    email: raw.email,
    status: statusMap[raw.status] || 'unknown',
    score: raw.score,
    deliverability: raw.is_deliverable ? 'deliverable' : (raw.status === 'risky' ? 'risky' : (raw.status === 'unknown' ? 'unknown' : 'undeliverable')),
    attributes: {
      disposable: raw.is_disposable,
      freeProvider: raw.is_free,
      roleAccount: raw.is_role,
      catchAll: raw.is_catchall,
      mxRecordsFound: Array.isArray(raw.mx_records) && raw.mx_records.length > 0,
      smtpValid: raw.smtp_check,
    },
    serverInfo: {
      processingTime: raw.response_time,
      requestId: `upstream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    },
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
 * Supports both mock (localhost) and real EmailVerify.ai API.
 * Mock uses our internal format directly; real API response is mapped.
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

  // Build request based on whether we're using mock or real API
  const endpoint = `${UPSTREAM_API_URL}/verify/single`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (IS_MOCK) {
    headers['Authorization'] = `Bearer ${UPSTREAM_API_KEY}`;
  } else {
    headers['EMAILVERIFY-API-KEY'] = UPSTREAM_API_KEY;
  }

  const body = IS_MOCK
    ? JSON.stringify({ email })
    : JSON.stringify({ email, check_smtp: true });

  try {
    activeConnections.inc();

    const response = await request(
      endpoint,
      {
        method: 'POST',
        headers,
        body,
        bodyTimeout: 15_000, // 15s read timeout
        headersTimeout: 10_000, // 10s connect timeout
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

    const rawResult = await response.body.json();

    // Map response: mock returns our format directly, real API wraps in { success, data }
    let result: VerificationResult;
    if (IS_MOCK) {
      result = rawResult as VerificationResult;
    } else {
      const apiResponse = rawResult as UpstreamApiResponse;
      if (!apiResponse.success || !apiResponse.data) {
        throw new Error(`Upstream API error: ${apiResponse.message || 'Unknown error'}`);
      }
      result = mapUpstreamResponse(apiResponse.data);
    }

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
