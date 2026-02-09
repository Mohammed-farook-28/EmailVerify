import { db } from '../db/index.js';
import { creditEvent, subscription, user } from '../db/schema.js';
import { and, desc, eq, gte } from 'drizzle-orm';
import { logger } from '../config/logger.js';

const PLAN_CREDITS: Record<string, number> = {
  'starter-monthly': 1000,
  'starter-annual': 1000,
  'growth-monthly': 5000,
  'growth-annual': 5000,
  'pro-monthly': 15000,
  'pro-annual': 15000,
  'scale-monthly': 50000,
  'scale-annual': 50000,
  'titan-monthly': 200000,
  'titan-annual': 200000,
};

export interface BillingInfo {
  balance: number;
  subscription?: {
    planId: string;
    planName: string;
    creditsPerPeriod: number;
    billingCycle: 'monthly' | 'annual';
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  };
}

export interface TransactionHistoryItem {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  metadata?: any;
  createdAt: Date;
}

/**
 * Get user's billing information (balance + subscription)
 */
export async function getBillingInfo(userId: string): Promise<BillingInfo> {
  try {
    // Get latest credit event for balance
    const latestEvent = await db
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.userId, userId))
      .orderBy(desc(creditEvent.createdAt))
      .limit(1);

    const balance = latestEvent[0]?.balanceAfter ?? 0;

    // Get active subscription if exists
    const [userSubscription] = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);

    const billingInfo: BillingInfo = {
      balance,
    };

    if (userSubscription) {
      // Extract plan name and billing cycle from planId (e.g., "starter-monthly")
      const planIdParts = userSubscription.planId.split('-');
      const billingCycle = planIdParts[planIdParts.length - 1] as 'monthly' | 'annual';
      const planNameSlug = planIdParts.slice(0, -1).join('-');

      // Capitalize plan name
      const planName = planNameSlug.charAt(0).toUpperCase() + planNameSlug.slice(1);

      billingInfo.subscription = {
        planId: userSubscription.planId,
        planName,
        creditsPerPeriod: PLAN_CREDITS[userSubscription.planId] ?? 0,
        billingCycle,
        status: userSubscription.status,
        currentPeriodStart: userSubscription.currentPeriodStart,
        currentPeriodEnd: userSubscription.currentPeriodEnd,
        cancelAtPeriodEnd: userSubscription.cancelAtPeriodEnd,
      };
    }

    return billingInfo;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get billing info');
    throw new Error('Failed to retrieve billing information');
  }
}

export interface TransactionHistoryResponse {
  transactions: TransactionHistoryItem[];
  total: number;
  hasMore: boolean;
}

/**
 * Get transaction history for a user
 *
 * @param userId - User ID
 * @param limit - Number of transactions to return (default: 10, max: 100)
 * @param offset - Offset for pagination (default: 0)
 * @param startDate - Optional filter: only return transactions after this date
 * @returns Transaction history with pagination metadata
 */
export async function getTransactionHistory(
  userId: string,
  limit: number = 10,
  offset: number = 0,
  startDate?: Date
): Promise<TransactionHistoryResponse> {
  try {
    // Enforce reasonable limits
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safeOffset = Math.max(0, offset);

    // Build query conditions
    const conditions = [eq(creditEvent.userId, userId)];
    if (startDate) {
      conditions.push(gte(creditEvent.createdAt, startDate));
    }

    // Get count of total matching transactions
    const countResult = await db
      .select({ count: creditEvent.id })
      .from(creditEvent)
      .where(and(...conditions));

    const total = countResult.length;

    // Get paginated events
    const events = await db
      .select()
      .from(creditEvent)
      .where(and(...conditions))
      .orderBy(desc(creditEvent.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);

    const transactions = events.map((event) => ({
      id: event.id,
      type: event.type,
      amount: event.amount,
      balanceAfter: event.balanceAfter,
      metadata: event.metadata,
      createdAt: event.createdAt,
    }));

    return {
      transactions,
      total,
      hasMore: safeOffset + transactions.length < total,
    };
  } catch (error) {
    logger.error({ error, userId, limit, offset }, 'Failed to get transaction history');
    throw new Error('Failed to retrieve transaction history');
  }
}

/**
 * Export transaction history as CSV
 *
 * @param userId - User ID
 * @param startDate - Optional filter: only export transactions after this date
 * @returns CSV string
 */
export async function exportTransactionsCSV(userId: string, startDate?: Date): Promise<string> {
  try {
    // Default date range: last 365 days if no startDate provided
    const effectiveStartDate = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const conditions = [
      eq(creditEvent.userId, userId),
      gte(creditEvent.createdAt, effectiveStartDate),
    ];

    // Hard limit: max 50,000 rows to prevent OOM
    const MAX_EXPORT_ROWS = 50_000;

    const events = await db
      .select()
      .from(creditEvent)
      .where(and(...conditions))
      .orderBy(desc(creditEvent.createdAt))
      .limit(MAX_EXPORT_ROWS);

    // Generate CSV header
    const header = 'ID,Type,Amount,Balance After,Reference Type,Reference ID,Created At\n';

    // Generate CSV rows
    const rows = events
      .map((event) => {
        const row = [
          event.id,
          event.type,
          event.amount.toString(),
          event.balanceAfter.toString(),
          event.referenceType || '',
          event.referenceId || '',
          event.createdAt.toISOString(),
        ];
        return row.map((field) => `"${field}"`).join(',');
      })
      .join('\n');

    return header + rows;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to export transactions CSV');
    throw new Error('Failed to export transaction history');
  }
}

/**
 * Get user's Stripe customer ID (creates one if doesn't exist)
 */
export async function getOrCreateStripeCustomerId(
  userId: string,
  email: string,
  name: string
): Promise<string> {
  try {
    // Check if user already has a Stripe customer ID
    const [existingUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (existingUser?.paymentCustomerId) {
      return existingUser.paymentCustomerId;
    }

    // Will be implemented when we integrate with Stripe client
    throw new Error('Stripe customer creation not yet implemented');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get or create Stripe customer ID');
    throw error;
  }
}
