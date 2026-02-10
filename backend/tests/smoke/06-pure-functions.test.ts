/**
 * Pure function smoke tests — no DB, no Redis, no mocking.
 */
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/crypto.js';
import {
  signWebhookPayload,
  verifyWebhookSignature,
} from '../../src/lib/hmac.js';

describe('crypto: bcrypt', () => {
  it('round-trips a password', async () => {
    const hash = await hashPassword('my-password');
    const match = await verifyPassword('my-password', hash);
    expect(match).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct');
    const match = await verifyPassword('wrong', hash);
    expect(match).toBe(false);
  });
});

describe('hmac: webhook signatures', () => {
  const secret = 'whsec_test-secret-key';
  const body = JSON.stringify({ event: 'test', data: { id: 1 } });

  it('round-trips a signature', () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signWebhookPayload(body, secret, ts);
    const valid = verifyWebhookSignature(body, sig, secret, 300);
    expect(valid).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signWebhookPayload(body, secret, ts);
    const valid = verifyWebhookSignature('tampered', sig, secret, 300);
    expect(valid).toBe(false);
  });
});
