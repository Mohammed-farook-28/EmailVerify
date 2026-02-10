/**
 * Vitest global setup — runs before each test file.
 *
 * 1. Load .env.test (MUST happen before any app imports)
 * 2. Flush test Redis DB
 * 3. Truncate all Postgres tables in FK-safe order
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test', override: true });

import { beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';

// Now safe to import app modules (env is loaded)
import { db, closePool } from '../src/db/index.js';
import { redis, closeRedis } from '../src/config/redis.js';

// Tables in reverse-FK order so TRUNCATE CASCADE works cleanly
const TABLES = [
  'webhook_delivery',
  'webhook',
  'bulk_verification_result',
  'bulk_job',
  'verification_result',
  'credit_event',
  'checkout_session',
  'processed_webhook_event',
  'api_key',
  'session',
  'account',
  'verification',
  'subscription',
  'billing_info',
  'user',
];

beforeEach(async () => {
  // Flush Redis test DB (DB index 1)
  await redis.flushdb();

  // Truncate all tables
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`)
  );
});

afterAll(async () => {
  await closeRedis();
  await closePool();
});
