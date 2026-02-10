/**
 * Public API v1 smoke tests.
 *
 * Mocks upstream-client and circuit-breaker so no real HTTP calls are made.
 */
import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'crypto';
import supertest from 'supertest';
import { app } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { apiKey } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createTestUser,
  seedCredits,
  createTestApiKey,
} from '../helpers/factories.js';

// Mock upstream client — return a canned verification result
vi.mock('../../src/services/upstream-client.js', () => ({
  callUpstreamAPI: vi.fn().mockResolvedValue({
    email: 'test@example.com',
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
      processingTime: 120,
      requestId: 'mock-req-id',
      timestamp: new Date().toISOString(),
    },
  }),
  closePool: vi.fn(),
}));

// Mock bulk-verification queue (imported by api-v1/verify.ts)
vi.mock('../../src/services/bulk-verification.js', () => ({
  bulkVerificationQueue: {
    add: vi.fn(),
    addBulk: vi.fn(),
    close: vi.fn(),
  },
}));

describe('API v1', () => {
  it('full verify flow with API key', async () => {
    const testUser = await createTestUser();
    await seedCredits(testUser.id, 100);
    const { fullKey } = await createTestApiKey(testUser.id);

    const res = await supertest(app)
      .post('/api/v1/verify')
      .set('Authorization', `Bearer ${fullKey}`)
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@example.com');
    expect(res.body.status).toBe('valid');
    expect(res.body.score).toBe(0.95);
  });

  it('returns 401 without Authorization header', async () => {
    const res = await supertest(app)
      .post('/api/v1/verify')
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for expired API key', async () => {
    const testUser = await createTestUser();
    await seedCredits(testUser.id, 100);
    const { keyId, fullKey } = await createTestApiKey(testUser.id);

    // Manually expire the key
    await db
      .update(apiKey)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(apiKey.id, keyId));

    const res = await supertest(app)
      .post('/api/v1/verify')
      .set('Authorization', `Bearer ${fullKey}`)
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(401);
  });

  it('returns credit balance via API', async () => {
    const testUser = await createTestUser();
    await seedCredits(testUser.id, 500);
    const { fullKey } = await createTestApiKey(testUser.id);

    const res = await supertest(app)
      .get('/api/v1/credits')
      .set('Authorization', `Bearer ${fullKey}`);

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(500);
  });
});
