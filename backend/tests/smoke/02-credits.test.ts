/**
 * Credit system smoke tests — real DB + real Redis.
 */
import { describe, it, expect } from 'vitest';
import { redis } from '../../src/config/redis.js';
import {
  awardSignupBonus,
  getBalance,
  deductCredits,
} from '../../src/services/credit.js';
import { env } from '../../src/config/env.js';
import { createTestUser, seedCredits } from '../helpers/factories.js';

describe('credit system', () => {
  it('awards signup bonus', async () => {
    const { id: userId } = await createTestUser();
    await awardSignupBonus(userId);
    const balance = await getBalance(userId);
    expect(balance).toBe(env.signupBonusCredits);
  });

  it('deducts credits and keeps Redis in sync', async () => {
    const { id: userId } = await createTestUser();
    await seedCredits(userId, 100);

    const newBalance = await deductCredits(userId, 5, 'ref-deduct-1');
    expect(newBalance).toBe(95);

    const cached = await redis.get(`credit:balance:${userId}`);
    expect(cached).toBe('95');
  });

  it('rejects overdraft', async () => {
    const { id: userId } = await createTestUser();
    await seedCredits(userId, 3);

    await expect(
      deductCredits(userId, 5, 'ref-overdraft')
    ).rejects.toThrow('Insufficient credits');
  });

  it('sequential deductions reach zero', async () => {
    const { id: userId } = await createTestUser();
    await seedCredits(userId, 5);

    // Deduct one at a time — no concurrency ambiguity
    for (let i = 0; i < 5; i++) {
      await deductCredits(userId, 1, `ref-seq-${i}`);
    }

    const finalBalance = await getBalance(userId);
    expect(finalBalance).toBe(0);

    // Next deduction should fail
    await expect(
      deductCredits(userId, 1, 'ref-seq-exhausted')
    ).rejects.toThrow('Insufficient credits');
  });
});
