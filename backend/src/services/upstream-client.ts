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

import { Pool } from 'undici';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { activeConnections, connectionPoolSize } from '../lib/metrics.js';

// Configure connection pool
const UPSTREAM_API_URL = process.env.UPSTREAM_API_URL || 'http://localhost:8080';
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || 'mock-api-key';
const IS_MOCK = UPSTREAM_API_URL.includes('localhost');

// Pool needs just the origin (scheme + host), not the path
const parsedUrl = new URL(UPSTREAM_API_URL);
const upstreamOrigin = parsedUrl.origin;
// Preserve path prefix (e.g. "/v1" from "https://api.emailverify.ai/v1")
const upstreamPathPrefix = parsedUrl.pathname.replace(/\/+$/, ''); // strip trailing slash
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
 * Format: {userId}:{SHA256(email)}
 *
 * No timestamp — Redis TTL (1hr) handles expiration. Including Date.now()
 * would make every request unique, defeating idempotency.
 *
 * @param email - Email to verify
 * @param userId - User making the request
 * @returns Idempotency key
 */
function generateIdempotencyKey(email: string, userId: string): string {
  const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex');
  return `${userId}:${emailHash}`;
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getUpstreamAuthHeaders(),
  };

  const body = IS_MOCK
    ? JSON.stringify({ email })
    : JSON.stringify({ email, check_smtp: true });

  try {
    activeConnections.inc();

    const response = await pool.request({
      path: `${upstreamPathPrefix}/verify/single`,
      method: 'POST',
      headers,
      body,
      bodyTimeout: 15_000, // 15s read timeout
      headersTimeout: 10_000, // 10s connect timeout
    });

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

// =============================================
// File-based Bulk Verification (upstream /verify/file)
// =============================================

/** Response from POST /verify/file */
export interface UpstreamFileUploadResponse {
  task_id: string;
  status: string;
  estimated_count: number;
}

/** Response from GET /verify/file/{job_id} */
export interface UpstreamFileJobStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processed_emails: number;
  total_emails: number;
  progress_percent: number;
  valid_count: number;
  invalid_count: number;
  risky_count: number;
  unknown_count: number;
  download_url?: string;
  process_time_seconds?: number;
}

/** A single row from the upstream results CSV */
export interface UpstreamResultRow {
  email: string;
  status: string;
  score: number;
  is_deliverable: boolean;
  is_disposable: boolean;
  is_catchall: boolean;
  is_role: boolean;
  is_free: boolean;
  mx_records: string[];
  smtp_check: boolean;
  reason: string;
}

/**
 * Build auth headers for the upstream API.
 * Mock uses Bearer token; real API uses EMAILVERIFY-API-KEY header.
 */
function getUpstreamAuthHeaders(): Record<string, string> {
  if (IS_MOCK) {
    return { 'Authorization': `Bearer ${UPSTREAM_API_KEY}` };
  }
  return { 'EMAILVERIFY-API-KEY': UPSTREAM_API_KEY };
}

/**
 * Upload a file to the upstream /verify/file endpoint.
 * Uses native fetch for FormData multipart upload.
 *
 * @param filePath - Path to the CSV/Excel file
 * @param filename - Original filename
 * @returns Upstream task_id and estimated count
 */
export async function uploadFileToUpstream(
  filePath: string,
  filename: string
): Promise<UpstreamFileUploadResponse> {
  const startTime = Date.now();

  try {
    const fileBuffer = await readFile(filePath);
    const blob = new Blob([fileBuffer]);

    const formData = new FormData();
    formData.append('file', blob, filename);

    const url = `${upstreamOrigin}${upstreamPathPrefix}/verify/file`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getUpstreamAuthHeaders(),
      body: formData,
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { statusCode: response.status, error: errorText, duration },
        'Upstream file upload failed'
      );
      throw new Error(`Upstream file upload error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as any;

    // Handle both mock and real API response shapes
    const data = result.data || result;
    const taskId = data.task_id || data.taskId;
    const estimatedCount = data.estimated_count || data.estimatedCount || 0;

    logger.info(
      { taskId, estimatedCount, duration },
      'File uploaded to upstream successfully'
    );

    return {
      task_id: taskId,
      status: data.status || 'pending',
      estimated_count: estimatedCount,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(
      { error: error.message, duration },
      'Failed to upload file to upstream'
    );
    throw error;
  }
}

/**
 * Get the status/progress of an upstream file verification job.
 *
 * @param taskId - The upstream task_id from file upload
 * @returns Current job status with progress details
 */
export async function getUpstreamFileJobStatus(
  taskId: string
): Promise<UpstreamFileJobStatus> {
  try {
    const response = await pool.request({
      path: `${upstreamPathPrefix}/verify/file/${taskId}`,
      method: 'GET',
      headers: {
        ...getUpstreamAuthHeaders(),
        'Content-Type': 'application/json',
      },
      bodyTimeout: 15_000,
      headersTimeout: 10_000,
    });

    if (response.statusCode !== 200) {
      const errorText = await response.body.text();
      throw new Error(`Upstream status check error: ${response.statusCode} - ${errorText}`);
    }

    const result = await response.body.json() as any;
    const data = result.data || result;

    return {
      task_id: data.task_id || taskId,
      status: data.status,
      processed_emails: data.processed_emails || 0,
      total_emails: data.total_emails || 0,
      progress_percent: data.progress_percent || 0,
      valid_count: data.valid_count || 0,
      invalid_count: data.invalid_count || 0,
      risky_count: data.risky_count || 0,
      unknown_count: data.unknown_count || 0,
      download_url: data.download_url,
      process_time_seconds: data.process_time_seconds,
    };
  } catch (error: any) {
    logger.error(
      { taskId, error: error.message },
      'Failed to get upstream file job status'
    );
    throw error;
  }
}

/**
 * Download results from an upstream file verification job.
 * Returns parsed result rows.
 *
 * @param taskId - The upstream task_id
 * @returns Array of result rows
 */
export async function downloadUpstreamResults(
  taskId: string
): Promise<UpstreamResultRow[]> {
  try {
    const response = await pool.request({
      path: `${upstreamPathPrefix}/verify/file/${taskId}/results`,
      method: 'GET',
      headers: {
        ...getUpstreamAuthHeaders(),
        'Accept': 'application/json',
      },
      bodyTimeout: 60_000, // 60s for large result downloads
      headersTimeout: 10_000,
    });

    if (response.statusCode !== 200) {
      const errorText = await response.body.text();
      throw new Error(`Upstream results download error: ${response.statusCode} - ${errorText}`);
    }

    const contentType = response.headers['content-type'] || '';

    // If JSON response, parse directly
    if (contentType.includes('application/json')) {
      const result = await response.body.json() as any;
      const data = result.data || result;
      return Array.isArray(data) ? data : data.results || [];
    }

    // If CSV response, parse CSV text into rows
    const csvText = await response.body.text();
    return parseUpstreamCSV(csvText);
  } catch (error: any) {
    logger.error(
      { taskId, error: error.message },
      'Failed to download upstream results'
    );
    throw error;
  }
}

/**
 * Parse CSV text from upstream results into structured rows
 */
function parseUpstreamCSV(csvText: string): UpstreamResultRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const results: UpstreamResultRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: any = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });

    results.push({
      email: row.email || '',
      status: row.status || 'unknown',
      score: parseFloat(row.score) || 0,
      is_deliverable: row.is_deliverable === 'true' || row.deliverable === 'true',
      is_disposable: row.is_disposable === 'true' || row.disposable === 'true',
      is_catchall: row.is_catchall === 'true' || row.catchall === 'true' || row.catch_all === 'true',
      is_role: row.is_role === 'true' || row.role === 'true',
      is_free: row.is_free === 'true' || row.free === 'true',
      mx_records: row.mx_records ? row.mx_records.split(';') : [],
      smtp_check: row.smtp_check === 'true',
      reason: row.reason || '',
    });
  }

  return results;
}

/**
 * Close the connection pool gracefully
 */
export async function closePool(): Promise<void> {
  await pool.close();
  logger.info('Upstream API connection pool closed');
}

export default {
  callUpstreamAPI,
  uploadFileToUpstream,
  getUpstreamFileJobStatus,
  downloadUpstreamResults,
  closePool,
};
