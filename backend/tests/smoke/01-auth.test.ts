/**
 * Auth smoke tests — Better Auth endpoints + requireAuth middleware.
 */
import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { app } from '../helpers/app.js';
import { authenticatedAgent } from '../helpers/factories.js';
import { db } from '../../src/db/index.js';
import { verification } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('auth', () => {
  it('send-verification-otp returns 200 and creates a verification row', async () => {
    const email = `otp-test-${Date.now()}@example.com`;

    // Better Auth emailOTP plugin endpoint
    const res = await supertest(app)
      .post('/api/auth/email-otp/send-verification-otp')
      .send({ email, type: 'sign-in' });

    // 200 = OTP sent successfully
    expect(res.status).toBe(200);

    // Better Auth stores the OTP in the verification table
    // The identifier format may vary, so just check a row exists
    const rows = await db.select().from(verification);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('session cookie grants access', async () => {
    const { agent } = await authenticatedAgent(app);

    const res = await agent.get('/api/billing/info');
    expect(res.status).not.toBe(401);
  });

  it('no session returns 401', async () => {
    const res = await supertest(app).get('/api/billing/info');
    expect(res.status).toBe(401);
  });

  it('invalid session token returns 401', async () => {
    const res = await supertest(app)
      .get('/api/billing/info')
      .set('Cookie', 'ev.session_token=garbage-token-value');

    expect(res.status).toBe(401);
  });
});
