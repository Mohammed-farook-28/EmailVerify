import { db } from '../db/index.js';
import { creditEvent } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { nanoid } from 'nanoid';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

/** Transaction-or-DB type for passing an existing transaction */
export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

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

    logger.info({ userId, bonusAmount }, 'Awarded signup bonus credits');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to award signup bonus');
    // Don't throw - signup should succeed even if credit award fails
  }
}

/**
 * Get user's current credit balance
 * Checks Redis cache first, falls back to DB on miss
 */
export async function getBalance(userId: string): Promise<number> {
  // Check Redis cache first
  try {
    const cached = await redis.get(`credit:balance:${userId}`);
    if (cached !== null) {
      return parseInt(cached, 10);
    }
  } catch {
    // Redis failure is non-fatal, fall through to DB
  }

  const latestEvent = await db
    .select()
    .from(creditEvent)
    .where(eq(creditEvent.userId, userId))
    .orderBy(desc(creditEvent.createdAt))
    .limit(1);

  const balance = latestEvent[0]?.balanceAfter ?? 0;

  // Populate cache on DB hit
  try {
    await redis.set(`credit:balance:${userId}`, balance.toString());
  } catch {
    // Cache population failure is non-fatal
  }

  return balance;
}

/**
 * Deduct credits for email verification
 *
 * Uses a transaction with row-level locking to prevent race conditions.
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
  return await db.transaction(async (tx) => {
    // Lock the latest credit event row for this user to prevent concurrent reads
    const latestEvent = await tx
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.userId, userId))
      .orderBy(desc(creditEvent.createdAt))
      .limit(1)
      .for('update');

    const currentBalance = latestEvent[0]?.balanceAfter ?? 0;

    if (currentBalance < amount) {
      throw new Error('Insufficient credits');
    }

    const newBalance = currentBalance - amount;

    await tx.insert(creditEvent).values({
      id: nanoid(),
      userId,
      type: 'verification_used',
      amount: -amount,
      balanceAfter: newBalance,
      referenceType: 'verification_job',
      referenceId,
      createdAt: new Date(),
    });

    // Update Redis cache
    await redis.set(`credit:balance:${userId}`, newBalance.toString());

    return newBalance;
  });
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
  return await db.transaction(async (tx) => {
    const latestEvent = await tx
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.userId, userId))
      .orderBy(desc(creditEvent.createdAt))
      .limit(1)
      .for('update');

    const currentBalance = latestEvent[0]?.balanceAfter ?? 0;
    const newBalance = currentBalance + amount;

    await tx.insert(creditEvent).values({
      id: nanoid(),
      userId,
      type: 'verification_refund',
      amount: amount,
      balanceAfter: newBalance,
      referenceType: 'verification_failed',
      referenceId,
      createdAt: new Date(),
    });

    // Update Redis cache
    await redis.set(`credit:balance:${userId}`, newBalance.toString());

    return newBalance;
  });
}

/**
 * Add credits from one-time purchase
 *
 * @param userId - User ID
 * @param amount - Number of credits to add (positive number)
 * @param checkoutSessionId - Stripe checkout session ID
 * @param packageLabel - Optional label for the purchase (e.g., "5000 credits")
 * @returns New balance after addition
 */
export async function addPurchaseCredits(
  userId: string,
  amount: number,
  checkoutSessionId: string,
  packageLabel?: string
): Promise<number> {
  return await db.transaction(async (tx) => {
    const idempotencyKey = `purchase:${checkoutSessionId}`;

    // Check if already processed (idempotency)
    const existing = await tx
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].balanceAfter;
    }

    const latestEvent = await tx
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.userId, userId))
      .orderBy(desc(creditEvent.createdAt))
      .limit(1)
      .for('update');

    const currentBalance = latestEvent[0]?.balanceAfter ?? 0;
    const newBalance = currentBalance + amount;

    await tx.insert(creditEvent).values({
      id: nanoid(),
      userId,
      type: 'purchase',
      amount: amount,
      balanceAfter: newBalance,
      referenceType: 'checkout_session',
      referenceId: checkoutSessionId,
      idempotencyKey,
      metadata: { packageLabel: packageLabel || `${amount} credits` },
      createdAt: new Date(),
    });

    // Update Redis cache
    await redis.set(`credit:balance:${userId}`, newBalance.toString());

    return newBalance;
  });
}

/**
 * Add credits from subscription (monthly/annual allocation)
 *
 * @param userId - User ID
 * @param amount - Number of credits to add (positive number)
 * @param planId - Plan identifier (e.g., "starter-monthly", "pro-annual")
 * @param subscriptionId - Stripe subscription ID
 * @param periodEnd - When these credits expire (subscription period end)
 * @returns New balance after addition
 */
export async function addSubscriptionCredits(
  userId: string,
  amount: number,
  planId: string,
  subscriptionId: string,
  periodEnd: Date,
  existingTx?: DbOrTx
): Promise<number> {
  const execute = async (tx: DbOrTx) => {
    const idempotencyKey = `subscription:${subscriptionId}:${periodEnd.getTime()}`;

    // Check if already processed (idempotency)
    const existing = await tx
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].balanceAfter;
    }

    const latestEvent = await tx
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.userId, userId))
      .orderBy(desc(creditEvent.createdAt))
      .limit(1)
      .for('update');

    const currentBalance = latestEvent[0]?.balanceAfter ?? 0;
    const newBalance = currentBalance + amount;

    await tx.insert(creditEvent).values({
      id: nanoid(),
      userId,
      type: 'subscription',
      amount: amount,
      balanceAfter: newBalance,
      referenceType: 'subscription',
      referenceId: subscriptionId,
      idempotencyKey,
      metadata: { planId, expiresAt: periodEnd.toISOString() },
      createdAt: new Date(),
    });

    // Update Redis cache
    await redis.set(`credit:balance:${userId}`, newBalance.toString());

    return newBalance;
  };

  if (existingTx) {
    return execute(existingTx);
  }
  return await db.transaction(async (tx) => execute(tx));
}

/**
 * Expire subscription credits at end of billing period
 *
 * @param userId - User ID
 * @param amount - Number of credits to expire (positive number)
 * @param subscriptionId - Stripe subscription ID
 * @param periodEnd - The period that just ended
 * @returns New balance after expiration
 */
export async function expireSubscriptionCredits(
  userId: string,
  amount: number,
  subscriptionId: string,
  periodEnd: Date,
  existingTx?: DbOrTx
): Promise<number> {
  const execute = async (tx: DbOrTx) => {
    const idempotencyKey = `expire:${subscriptionId}:${periodEnd.getTime()}`;

    // Check if already processed (idempotency)
    const existing = await tx
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].balanceAfter;
    }

    const latestEvent = await tx
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.userId, userId))
      .orderBy(desc(creditEvent.createdAt))
      .limit(1)
      .for('update');

    const currentBalance = latestEvent[0]?.balanceAfter ?? 0;
    // Fix 6: Record actual deduction, not requested amount
    const actualDeduction = Math.min(amount, currentBalance);
    const newBalance = currentBalance - actualDeduction;

    await tx.insert(creditEvent).values({
      id: nanoid(),
      userId,
      type: 'expire',
      amount: -actualDeduction,
      balanceAfter: newBalance,
      referenceType: 'subscription',
      referenceId: subscriptionId,
      idempotencyKey,
      metadata: { periodEnd: periodEnd.toISOString() },
      createdAt: new Date(),
    });

    // Update Redis cache
    await redis.set(`credit:balance:${userId}`, newBalance.toString());

    return newBalance;
  };

  if (existingTx) {
    return execute(existingTx);
  }
  return await db.transaction(async (tx) => execute(tx));
}
