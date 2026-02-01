/**
 * Credit Reconciliation Service
 *
 * Syncs Redis credit cache with PostgreSQL ledger every 5 minutes.
 * Detects drift and corrects balances atomically.
 *
 * Flow:
 * 1. Fetch Redis balance
 * 2. Calculate PostgreSQL balance (sum of credit_events)
 * 3. Compare and detect drift
 * 4. Correct drift atomically using Lua script
 * 5. Log and emit metrics
 */

import { db } from '../db/index.js';
import { creditEvent, user } from '../db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';
import { redis } from '../config/redis.js';
import { logger, createLogger } from '../config/logger.js';

/**
 * Reconciliation result for a single user
 */
export interface ReconciliationResult {
  userId: string;
  redisBalance: number;
  pgBalance: number;
  drift: number;
  corrected: boolean;
}

/**
 * Summary of reconciliation run
 */
export interface ReconciliationSummary {
  totalUsers: number;
  usersProcessed: number;
  driftDetected: number;
  totalDrift: number;
  corrected: number;
  errors: number;
  duration: number; // milliseconds
}

/**
 * Drift severity levels
 */
enum DriftSeverity {
  INFO = 'info', // 1-5 credits
  WARNING = 'warning', // 6-50 credits
  CRITICAL = 'critical', // 51-500 credits
  INCIDENT = 'incident', // 500+ credits
}

/**
 * Redis Lua script for atomic correction
 * Note: Redis EVAL is safe for Lua scripts (not arbitrary code execution)
 */
const correctionScript = `
  local key = KEYS[1]
  local correction = tonumber(ARGV[1])
  local currentBalance = tonumber(redis.call('GET', key) or 0)
  local newBalance = currentBalance + correction
  redis.call('SET', key, newBalance)
  return newBalance
`;

/**
 * Get drift severity level
 *
 * @param drift - Absolute drift amount
 * @returns Severity level
 */
function getDriftSeverity(drift: number): DriftSeverity {
  const absDrift = Math.abs(drift);
  if (absDrift >= 500) return DriftSeverity.INCIDENT;
  if (absDrift >= 51) return DriftSeverity.CRITICAL;
  if (absDrift >= 6) return DriftSeverity.WARNING;
  return DriftSeverity.INFO;
}

/**
 * Reconcile credits for a single user
 *
 * @param userId - User ID to reconcile
 * @returns Reconciliation result
 */
export async function reconcileUser(userId: string): Promise<ReconciliationResult> {
  const serviceLogger = createLogger({
    userId,
    operation: 'reconcile-user',
  });

  // Try to acquire lock for this user (prevent concurrent reconciliation)
  const lockKey = `reconciliation:lock:${userId}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');

  if (!lockAcquired) {
    // Another reconciliation in progress for this user, skip
    serviceLogger.info('Reconciliation already in progress for user, skipping');
    return {
      userId,
      redisBalance: 0,
      pgBalance: 0,
      drift: 0,
      corrected: false,
    };
  }

  try {
    // 1. Fetch Redis balance
    const redisBalanceStr = await redis.get(`credit:balance:${userId}`);
    const redisBalance = redisBalanceStr ? parseInt(redisBalanceStr, 10) : 0;

    // 2. Calculate PostgreSQL balance (latest balanceAfter from ledger)
    const latestEvent = await db
      .select()
      .from(creditEvent)
      .where(eq(creditEvent.userId, userId))
      .orderBy(desc(creditEvent.createdAt))
      .limit(1)
      .execute();

    const pgBalance = latestEvent[0]?.balanceAfter ?? 0;

    // 3. Calculate drift
    const drift = redisBalance - pgBalance;

    serviceLogger.info(
      {
        redisBalance,
        pgBalance,
        drift,
      },
      'Calculated balance drift'
    );

    // 4. Correct drift if needed
    let corrected = false;
    if (drift !== 0) {
      const severity = getDriftSeverity(drift);

      // Log based on severity
      const logMessage = `Credit drift detected: ${drift} credits`;
      const logContext = { drift, severity };

      if (severity === DriftSeverity.INCIDENT || severity === DriftSeverity.CRITICAL) {
        serviceLogger.error(logContext, logMessage);
      } else if (severity === DriftSeverity.WARNING) {
        serviceLogger.warn(logContext, logMessage);
      } else {
        serviceLogger.info(logContext, logMessage);
      }

      // Correct Redis balance using Lua script (atomic)
      // Note: Redis EVAL is safe for Lua scripts, not arbitrary code
      try {
        await redis.call('EVAL', correctionScript, 1, `credit:balance:${userId}`, -drift);
        corrected = true;

        serviceLogger.info(
          {
            correction: -drift,
            newBalance: pgBalance,
          },
          'Redis balance corrected'
        );
      } catch (error: any) {
        serviceLogger.error(
          {
            error: error.message,
            stack: error.stack,
          },
          'Failed to correct Redis balance'
        );
      }
    }

    return {
      userId,
      redisBalance,
      pgBalance,
      drift,
      corrected,
    };
  } catch (error: any) {
    serviceLogger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Reconciliation failed for user'
    );
    throw error;
  } finally {
    // Always release lock, even if error occurred
    await redis.del(lockKey);
  }
}

/**
 * Reconcile all active users
 *
 * @param batchSize - Number of users to process in each batch (default: 1000)
 * @returns Reconciliation summary
 */
export async function reconcileAll(batchSize: number = 1000): Promise<ReconciliationSummary> {
  const serviceLogger = createLogger({
    operation: 'reconcile-all',
    batchSize,
  });

  // Try to acquire global reconciliation lock (prevent concurrent runs)
  const globalLockKey = 'reconciliation:global:lock';
  const lockAcquired = await redis.set(globalLockKey, '1', 'EX', 300, 'NX'); // 5 min lock

  if (!lockAcquired) {
    serviceLogger.info('Another reconciliation already running globally, skipping');
    return {
      totalUsers: 0,
      usersProcessed: 0,
      driftDetected: 0,
      totalDrift: 0,
      corrected: 0,
      errors: 0,
      duration: 0,
    };
  }

  const startTime = Date.now();

  serviceLogger.info('Starting credit reconciliation for all users');

  const summary: ReconciliationSummary = {
    totalUsers: 0,
    usersProcessed: 0,
    driftDetected: 0,
    totalDrift: 0,
    corrected: 0,
    errors: 0,
    duration: 0,
  };

  try {
    // Get all active users (users with credit events)
    const usersWithCredits = await db
      .selectDistinct({ userId: creditEvent.userId })
      .from(creditEvent)
      .execute();

    summary.totalUsers = usersWithCredits.length;

    serviceLogger.info({ totalUsers: summary.totalUsers }, 'Users to reconcile');

    // Process users in batches
    for (let i = 0; i < usersWithCredits.length; i += batchSize) {
      const batch = usersWithCredits.slice(i, i + batchSize);

      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map((u) => reconcileUser(u.userId))
      );

      // Aggregate results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          summary.usersProcessed++;

          if (result.value.drift !== 0) {
            summary.driftDetected++;
            summary.totalDrift += Math.abs(result.value.drift);

            if (result.value.corrected) {
              summary.corrected++;
            }
          }
        } else {
          summary.errors++;
          serviceLogger.error(
            { error: result.reason },
            'Failed to reconcile user in batch'
          );
        }
      }

      serviceLogger.info(
        {
          batchNumber: Math.floor(i / batchSize) + 1,
          processed: summary.usersProcessed,
          total: summary.totalUsers,
        },
        'Batch processed'
      );
    }

    summary.duration = Date.now() - startTime;

    serviceLogger.info(
      {
        summary,
      },
      'Credit reconciliation completed'
    );

    return summary;
  } catch (error: any) {
    serviceLogger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Reconciliation failed'
    );
    throw error;
  } finally {
    // Always release global lock
    await redis.del(globalLockKey);
  }
}
