/**
 * Dashboard Metrics Service
 *
 * Provides aggregated statistics and analytics for the dashboard:
 * - Summary stats (credits, verifications, API calls)
 * - Status distribution (valid, invalid, risky, etc.)
 * - Trend data (daily verification counts)
 */

import { db } from '../db/index.js';
import { verificationResult, user } from '../db/schema.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getBalance } from './credit.js';
import { logger, createLogger } from '../config/logger.js';

/**
 * Dashboard summary statistics
 */
export interface DashboardStats {
  credits: number;
  totalVerifications: number;
  apiCalls: number; // Placeholder for future API usage tracking
  periodVerifications: number; // Verifications within selected time range
}

/**
 * Status distribution data
 */
export interface StatusDistribution {
  status: string;
  count: number;
  percentage: number;
}

/**
 * Trend data point (daily verification count)
 */
export interface TrendDataPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

/**
 * Get dashboard summary statistics
 *
 * @param userId - User ID
 * @param rangeDays - Time range in days (7, 30, or 90)
 * @returns Summary statistics
 */
export async function getDashboardStats(
  userId: string,
  rangeDays: number = 30
): Promise<DashboardStats> {
  // Validate range parameter
  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 365) {
    throw new Error('rangeDays must be an integer between 1 and 365');
  }

  const serviceLogger = createLogger({
    userId,
    operation: 'get-dashboard-stats',
    rangeDays,
  });

  serviceLogger.info('Fetching dashboard stats');

  try {
    // Get current credit balance from Redis
    const credits = await getBalance(userId);

    // Calculate cutoff date for period filter
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - rangeDays);

    // Get total verifications (all time)
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(verificationResult)
      .where(eq(verificationResult.userId, userId))
      .execute();

    const totalVerifications = totalResult[0]?.count || 0;

    // Get period verifications (within time range)
    const periodResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(verificationResult)
      .where(
        and(
          eq(verificationResult.userId, userId),
          gte(verificationResult.createdAt, cutoffDate)
        )
      )
      .execute();

    const periodVerifications = periodResult[0]?.count || 0;

    // API calls placeholder (will be implemented in future)
    const apiCalls = 0;

    serviceLogger.info(
      {
        credits,
        totalVerifications,
        periodVerifications,
        apiCalls,
      },
      'Dashboard stats retrieved'
    );

    return {
      credits,
      totalVerifications,
      apiCalls,
      periodVerifications,
    };
  } catch (error: any) {
    serviceLogger.error(
      { error: error.message, stack: error.stack },
      'Failed to get dashboard stats'
    );
    throw new Error('Failed to retrieve dashboard statistics');
  }
}

/**
 * Get status distribution (counts grouped by status)
 *
 * @param userId - User ID
 * @param rangeDays - Time range in days (7, 30, or 90)
 * @returns Array of status distributions
 */
export async function getStatusDistribution(
  userId: string,
  rangeDays: number = 30
): Promise<StatusDistribution[]> {
  // Validate range parameter
  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 365) {
    throw new Error('rangeDays must be an integer between 1 and 365');
  }

  const serviceLogger = createLogger({
    userId,
    operation: 'get-status-distribution',
    rangeDays,
  });

  serviceLogger.info('Fetching status distribution');

  try {
    // Calculate cutoff date for period filter
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - rangeDays);

    // Get status counts
    const statusCounts = await db
      .select({
        status: verificationResult.status,
        count: sql<number>`count(*)::int`,
      })
      .from(verificationResult)
      .where(
        and(
          eq(verificationResult.userId, userId),
          gte(verificationResult.createdAt, cutoffDate)
        )
      )
      .groupBy(verificationResult.status)
      .execute();

    // Calculate total for percentage
    const total = statusCounts.reduce((sum, item) => sum + item.count, 0);

    // Map to StatusDistribution format with percentages
    const distribution = statusCounts.map((item) => ({
      status: item.status,
      count: item.count,
      percentage: total > 0 ? Math.round((item.count / total) * 100 * 100) / 100 : 0,
    }));

    serviceLogger.info(
      {
        total,
        statuses: distribution.length,
      },
      'Status distribution retrieved'
    );

    return distribution;
  } catch (error: any) {
    serviceLogger.error(
      { error: error.message, stack: error.stack },
      'Failed to get status distribution'
    );
    throw new Error('Failed to retrieve status distribution');
  }
}

/**
 * Get verification trend (daily counts over time)
 *
 * @param userId - User ID
 * @param rangeDays - Time range in days (7, 30, or 90)
 * @returns Array of trend data points
 */
export async function getVerificationTrend(
  userId: string,
  rangeDays: number = 30
): Promise<TrendDataPoint[]> {
  // Validate range parameter
  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 365) {
    throw new Error('rangeDays must be an integer between 1 and 365');
  }

  const serviceLogger = createLogger({
    userId,
    operation: 'get-verification-trend',
    rangeDays,
  });

  serviceLogger.info('Fetching verification trend');

  try {
    // Calculate cutoff date for period filter
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - rangeDays);

    // Get daily verification counts
    const trendData = await db
      .select({
        date: sql<string>`DATE(${verificationResult.createdAt})`,
        count: sql<number>`count(*)::int`,
      })
      .from(verificationResult)
      .where(
        and(
          eq(verificationResult.userId, userId),
          gte(verificationResult.createdAt, cutoffDate)
        )
      )
      .groupBy(sql`DATE(${verificationResult.createdAt})`)
      .orderBy(sql`DATE(${verificationResult.createdAt}) ASC`)
      .execute();

    serviceLogger.info(
      {
        dataPoints: trendData.length,
      },
      'Verification trend retrieved'
    );

    return trendData;
  } catch (error: any) {
    serviceLogger.error(
      { error: error.message, stack: error.stack },
      'Failed to get verification trend'
    );
    throw new Error('Failed to retrieve verification trend');
  }
}

/**
 * Usage by status data point (daily verification counts by status)
 */
export interface UsageByStatusDataPoint {
  date: string; // YYYY-MM-DD
  valid: number;
  invalid: number;
  risky: number;
  unknown: number;
}

/**
 * Get daily verification counts broken down by status
 *
 * @param userId - User ID
 * @param rangeDays - Time range in days (7, 30, or 90)
 * @returns Array of daily data points with per-status counts
 */
export async function getUsageByStatus(
  userId: string,
  rangeDays: number = 7
): Promise<UsageByStatusDataPoint[]> {
  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 365) {
    throw new Error('rangeDays must be an integer between 1 and 365');
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - rangeDays);

  try {
    const rows = await db
      .select({
        date: sql<string>`DATE(${verificationResult.createdAt})`,
        status: verificationResult.status,
        count: sql<number>`count(*)::int`,
      })
      .from(verificationResult)
      .where(
        and(
          eq(verificationResult.userId, userId),
          gte(verificationResult.createdAt, cutoffDate)
        )
      )
      .groupBy(sql`DATE(${verificationResult.createdAt})`, verificationResult.status)
      .orderBy(sql`DATE(${verificationResult.createdAt}) ASC`)
      .execute();

    // Pivot rows into { date, valid, invalid, risky, unknown }
    const dateMap = new Map<string, UsageByStatusDataPoint>();

    for (const row of rows) {
      if (!dateMap.has(row.date)) {
        dateMap.set(row.date, { date: row.date, valid: 0, invalid: 0, risky: 0, unknown: 0 });
      }
      const entry = dateMap.get(row.date)!;
      if (row.status === 'valid') entry.valid = row.count;
      else if (row.status === 'invalid') entry.invalid = row.count;
      else if (row.status === 'risky') entry.risky = row.count;
      else if (row.status === 'unknown') entry.unknown = row.count;
    }

    return Array.from(dateMap.values());
  } catch (error: any) {
    throw new Error('Failed to retrieve usage by status');
  }
}
