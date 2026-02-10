/**
 * Test data factories — insert directly into DB via Drizzle.
 */
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import supertest from 'supertest';
import { db } from '../../src/db/index.js';
import { user, session, creditEvent, verificationResult } from '../../src/db/schema.js';
import { redis } from '../../src/config/redis.js';
import { createApiKey } from '../../src/services/api-key.js';
import type { app as AppType } from '../../src/app.js';

// Better Auth resolves: options.secret || BETTER_AUTH_SECRET || AUTH_SECRET || DEFAULT_SECRET
// Our auth config doesn't set `secret`, so it falls back to DEFAULT_SECRET.
const BETTER_AUTH_COOKIE_SECRET =
  process.env.BETTER_AUTH_SECRET ??
  process.env.AUTH_SECRET ??
  'better-auth-secret-12345678901234567890';

/**
 * Sign a cookie value using the same HMAC-SHA256 approach as better-call/better-auth.
 * Format: value.base64_signature (URL-encoded when set as cookie)
 */
async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );
  const base64Sig = Buffer.from(signature).toString('base64');
  return `${value}.${base64Sig}`;
}

/**
 * Create a test user in the database.
 */
export async function createTestUser(overrides: Partial<{
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}> = {}) {
  const id = overrides.id ?? nanoid();
  const email = overrides.email ?? `test-${id}@example.com`;
  const name = overrides.name ?? 'Test User';
  const emailVerified = overrides.emailVerified ?? true;

  await db.insert(user).values({
    id,
    name,
    email,
    emailVerified,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { id, email, name };
}

/**
 * Build the signed cookie header value for a raw session token.
 */
export async function buildSessionCookie(rawToken: string): Promise<string> {
  const signed = await signCookieValue(rawToken, BETTER_AUTH_COOKIE_SECRET);
  return `ev.session_token=${encodeURIComponent(signed)}`;
}

/**
 * Create a session for a user.
 * Returns the raw token and a ready-to-use signed cookie string.
 */
export async function createTestSession(userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const id = nanoid();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(session).values({
    id,
    userId,
    token,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAuthenticatedAt: new Date(),
  });

  const cookie = await buildSessionCookie(token);

  return { sessionId: id, token, cookie };
}

/**
 * Create a supertest agent with a valid signed session cookie pre-set.
 * Returns `{ agent, user, token }`.
 */
export async function authenticatedAgent(app: typeof AppType) {
  const testUser = await createTestUser();
  const { token } = await createTestSession(testUser.id);

  const cookie = await buildSessionCookie(token);

  const agent = supertest.agent(app);
  agent.set('Cookie', cookie);

  return { agent, user: testUser, token };
}

/**
 * Seed credits for a user (both DB and Redis).
 */
export async function seedCredits(userId: string, amount: number) {
  await db.insert(creditEvent).values({
    id: nanoid(),
    userId,
    type: 'purchase',
    amount,
    balanceAfter: amount,
    referenceType: 'test_seed',
    referenceId: `seed-${nanoid(8)}`,
    idempotencyKey: `seed:${userId}:${nanoid(8)}`,
    createdAt: new Date(),
  });

  await redis.set(`credit:balance:${userId}`, amount.toString());
}

/**
 * Create an API key for a user. Returns `{ keyId, fullKey }`.
 */
export async function createTestApiKey(userId: string) {
  const result = await createApiKey({
    userId,
    name: 'Test Key',
    expiresIn: 'never',
    isTest: false,
  });
  return { keyId: result.id, fullKey: result.fullKey };
}

/**
 * Insert a verification result for a user.
 */
export async function createVerificationResult(userId: string, email: string) {
  const id = nanoid();
  await db.insert(verificationResult).values({
    id,
    userId,
    email,
    status: 'valid',
    score: 0.95,
    deliverability: 'deliverable',
    attributes: {
      disposable: false,
      freeProvider: false,
      roleAccount: false,
      catchAll: false,
      mxRecordsFound: true,
      smtpValid: true,
    },
    serverInfo: {
      processingTime: 150,
      requestId: `test-${id}`,
      timestamp: new Date().toISOString(),
    },
    createdAt: new Date(),
  });
  return { id, email };
}
