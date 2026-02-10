/**
 * Quick-verify smoke tests.
 *
 * Mocks the queue service (no worker running in tests) and upstream client.
 */
import { describe, it, expect, vi } from 'vitest';
import supertest from 'supertest';
import { app } from '../helpers/app.js';
import {
  authenticatedAgent,
  seedCredits,
  createTestUser,
  createTestSession,
  createVerificationResult,
} from '../helpers/factories.js';

// Mock the queue — enqueueSingleVerification returns a fake job ID
vi.mock('../../src/services/queue.js', () => ({
  enqueueSingleVerification: vi.fn().mockResolvedValue('mock-job-id'),
  isQueueOverloaded: vi.fn().mockResolvedValue(false),
  verificationQueue: { add: vi.fn(), addBulk: vi.fn(), close: vi.fn() },
  dlqQueue: { close: vi.fn() },
  queueEvents: { close: vi.fn() },
  closeQueue: vi.fn(),
  getQueueStats: vi.fn().mockResolvedValue({ waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0, total: 0 }),
}));

describe('quick-verify', () => {
  it('happy path: deducts credit and returns job ID', async () => {
    const { agent, user } = await authenticatedAgent(app);
    await seedCredits(user.id, 100);

    const res = await agent
      .post('/home/quick-verify')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.newBalance).toBe(99);
  });

  it('returns 402 with insufficient credits', async () => {
    const { agent } = await authenticatedAgent(app);
    // No credits seeded — balance is 0

    const res = await agent
      .post('/home/quick-verify')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(402);
    expect(res.body.error).toBe('Insufficient credits');
  });

  it('recent results are user-isolated', async () => {
    // User A
    const userA = await createTestUser({ email: 'usera@example.com' });
    const { cookie: cookieA } = await createTestSession(userA.id);
    await createVerificationResult(userA.id, 'a-only@example.com');

    // User B
    const userB = await createTestUser({ email: 'userb@example.com' });
    const { cookie: cookieB } = await createTestSession(userB.id);
    await createVerificationResult(userB.id, 'b-only@example.com');

    // User A should only see their results
    const resA = await supertest(app)
      .get('/home/quick-verify/recent')
      .set('Cookie', cookieA);

    expect(resA.status).toBe(200);
    expect(resA.body.results).toHaveLength(1);
    expect(resA.body.results[0].email).toBe('a-only@example.com');

    // User B should only see their results
    const resB = await supertest(app)
      .get('/home/quick-verify/recent')
      .set('Cookie', cookieB);

    expect(resB.status).toBe(200);
    expect(resB.body.results).toHaveLength(1);
    expect(resB.body.results[0].email).toBe('b-only@example.com');
  });
});
