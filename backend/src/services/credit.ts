import { db } from '../db/index.js';
import { creditEvent } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { nanoid } from 'nanoid';

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
