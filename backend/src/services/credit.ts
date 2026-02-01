import { db } from '../db/index.js';
import { creditEvent } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { nanoid } from 'nanoid';
import { redis } from '../config/redis.js';

/**
 * Award signup bonus credits to a new user
 */
export async function awardSignupBonus(userId: string): Promise<void> {
  try {
    // Check if signup bonus already awarded (idempotency)
    const existing = await db
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.idempotencyKey, `signup_bonus:${userId}`))
      .limit(1);

    if (existing.length > 0) {
      // Already awarded
      return;
    }

    // Get current balance
    const latestEvent = await db
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.userId, userId))
      .orderBy(desc(creditEvent.createdAt))
      .limit(1);

    const currentBalance = latestEvent[0]?.balanceAfter ?? 0;
    const bonusAmount = env.signupBonusCredits;
    const newBalance = currentBalance + bonusAmount;

    // Create credit event
    await db.insert(creditEvent).values({
      id: nanoid(),
      userId,
      type: 'signup_bonus',
      amount: bonusAmount,
      balanceAfter: newBalance,
      referenceType: 'registration',
      referenceId: userId,
      idempotencyKey: `signup_bonus:${userId}`,
      createdAt: new Date(),
    });

    console.log(`Awarded ${bonusAmount} signup bonus credits to user ${userId}`);
  } catch (error) {
    console.error('Failed to award signup bonus:', error);
    // Don't throw - signup should succeed even if credit award fails
  }
}

/**
 * Get user's current credit balance
 */
export async function getBalance(userId: string): Promise<number> {
  const latestEvent = await db
    .select()
    .from(creditEvent)
    .where(eq(creditEvent.userId, userId))
    .orderBy(desc(creditEvent.createdAt))
    .limit(1);

  return latestEvent[0]?.balanceAfter ?? 0;
}

/**
 * Deduct credits for email verification
 *
 * @param userId - User ID
 * @param amount - Number of credits to deduct (positive number)
 * @param referenceId - Reference ID (e.g., job ID)
 * @returns New balance after deduction
 * @throws Error if insufficient credits
 */
export async function deductCredits(
  userId: string,
  amount: number,
  referenceId: string
): Promise<number> {
  const currentBalance = await getBalance(userId);

  if (currentBalance < amount) {
    throw new Error('Insufficient credits');
  }

  const newBalance = currentBalance - amount;

  // Create credit event
  await db.insert(creditEvent).values({
    id: nanoid(),
    userId,
    type: 'verification_used',
    amount: -amount, // Negative for deduction
    balanceAfter: newBalance,
    referenceType: 'verification_job',
    referenceId,
    createdAt: new Date(),
  });

  return newBalance;
}

/**
 * Refund credits for failed verification
 *
 * @param userId - User ID
 * @param amount - Number of credits to refund (positive number)
 * @param referenceId - Reference ID (e.g., verification_failed:jobId)
 * @returns New balance after refund
 */
export async function refundCredits(
  userId: string,
  amount: number,
  referenceId: string
): Promise<number> {
  const currentBalance = await getBalance(userId);
  const newBalance = currentBalance + amount;

  // Create credit event for refund
  await db.insert(creditEvent).values({
    id: nanoid(),
    userId,
    type: 'verification_refund',
    amount: amount, // Positive for refund
    balanceAfter: newBalance,
    referenceType: 'verification_failed',
    referenceId,
    createdAt: new Date(),
  });

  // Update Redis cache immediately so user sees refund right away
  await redis.set(`credit:balance:${userId}`, newBalance.toString());

  return newBalance;
}
