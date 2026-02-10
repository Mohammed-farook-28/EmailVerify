/**
 * Bulk Result Expiry Notification Worker
 *
 * Runs daily to send email notifications to users about bulk verification results
 * that are about to expire:
 * - 7 days before expiry: First warning
 * - 3 days before expiry: Final warning
 *
 * Results expire 14 days after job completion.
 */

import { Queue, Worker, Job } from 'bullmq';
import { redis, bullRedis } from '../config/redis.js';
import { logger, createLogger } from '../config/logger.js';
import { db } from '../db/index.js';
import { bulkJob, user } from '../db/schema.js';
import { and, eq, gte, lte, isNotNull, isNull } from 'drizzle-orm';
import { resend, fromEmail } from '../config/email.js';

interface NotifyJobData {
  triggeredAt: string;
}

// Create notification queue
const notifyQueue = new Queue<NotifyJobData>('result-expiry-notify', {
  connection: bullRedis,
});

// Track which notifications have been sent to avoid duplicates
// Key format: `result-expiry-notify:{jobId}:{daysBeforeExpiry}`

interface NotificationSummary {
  sevenDayNotifications: number;
  threeDayNotifications: number;
  errors: number;
}

/**
 * Send expiry warning email
 */
async function sendExpiryWarningEmail(
  email: string,
  jobId: string,
  filename: string | null,
  totalCount: number,
  daysRemaining: number,
  expiresAt: Date
): Promise<void> {
  const jobName = filename || `Job ${jobId.slice(0, 8)}`;
  const urgency = daysRemaining <= 3 ? 'Final' : 'Reminder';
  const urgencyColor = daysRemaining <= 3 ? '#dc2626' : '#f59e0b';

  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: `${urgency}: Your bulk verification results expire in ${daysRemaining} days`,
    html: `
      <h2 style="color: ${urgencyColor};">Bulk Results Expiring Soon</h2>
      <p>Your bulk verification results will be <strong>permanently deleted</strong> in <strong>${daysRemaining} days</strong>.</p>

      <div style="background: #f4f4f4; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0;"><strong>Job:</strong> ${jobName}</p>
        <p style="margin: 8px 0 0;"><strong>Emails verified:</strong> ${totalCount.toLocaleString()}</p>
        <p style="margin: 8px 0 0;"><strong>Expires:</strong> ${expiresAt.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}</p>
      </div>

      <p><strong>What to do:</strong></p>
      <ol>
        <li>Go to your <a href="https://app.emailkit.io/home/history">bulk verification history</a></li>
        <li>Find your job and click "Download Results"</li>
        <li>Save the CSV file to your computer</li>
      </ol>

      <p style="color: #666; font-size: 12px; margin-top: 24px;">
        After expiration, results cannot be recovered. Download them now to keep a copy.
      </p>
    `,
  });
}

/**
 * Check if notification was already sent
 */
async function wasNotificationSent(jobId: string, daysBeforeExpiry: number): Promise<boolean> {
  const key = `result-expiry-notify:${jobId}:${daysBeforeExpiry}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

/**
 * Mark notification as sent (TTL: 30 days)
 */
async function markNotificationSent(jobId: string, daysBeforeExpiry: number): Promise<void> {
  const key = `result-expiry-notify:${jobId}:${daysBeforeExpiry}`;
  await redis.setex(key, 30 * 24 * 60 * 60, '1');
}

/**
 * Process expiry notifications
 */
async function processNotifications(job: Job<NotifyJobData>): Promise<NotificationSummary> {
  const jobLogger = createLogger({
    jobId: job.id,
    operation: 'result-expiry-notify',
  });

  jobLogger.info('Starting bulk result expiry notifications');

  const summary: NotificationSummary = {
    sevenDayNotifications: 0,
    threeDayNotifications: 0,
    errors: 0,
  };

  try {
    const now = new Date();

    // Calculate date windows
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Find jobs expiring in ~7 days (window: 6-7 days)
    const sevenDayJobs = await db
      .select({
        id: bulkJob.id,
        userId: bulkJob.userId,
        filename: bulkJob.filename,
        totalCount: bulkJob.totalCount,
        resultExpiresAt: bulkJob.resultExpiresAt,
      })
      .from(bulkJob)
      .where(
        and(
          eq(bulkJob.status, 'completed'),
          isNotNull(bulkJob.resultExpiresAt),
          gte(bulkJob.resultExpiresAt, sixDaysFromNow),
          lte(bulkJob.resultExpiresAt, sevenDaysFromNow)
        )
      );

    jobLogger.info({ count: sevenDayJobs.length }, 'Found jobs expiring in ~7 days');

    // Find jobs expiring in ~3 days (window: 2-3 days)
    const threeDayJobs = await db
      .select({
        id: bulkJob.id,
        userId: bulkJob.userId,
        filename: bulkJob.filename,
        totalCount: bulkJob.totalCount,
        resultExpiresAt: bulkJob.resultExpiresAt,
      })
      .from(bulkJob)
      .where(
        and(
          eq(bulkJob.status, 'completed'),
          isNotNull(bulkJob.resultExpiresAt),
          gte(bulkJob.resultExpiresAt, twoDaysFromNow),
          lte(bulkJob.resultExpiresAt, threeDaysFromNow)
        )
      );

    jobLogger.info({ count: threeDayJobs.length }, 'Found jobs expiring in ~3 days');

    // Process 7-day notifications
    for (const bulkJobRecord of sevenDayJobs) {
      try {
        // Check if already notified
        if (await wasNotificationSent(bulkJobRecord.id, 7)) {
          jobLogger.debug({ bulkJobId: bulkJobRecord.id }, 'Already sent 7-day notification');
          continue;
        }

        // Get user email
        const userRecord = await db.query.user.findFirst({
          where: eq(user.id, bulkJobRecord.userId),
          columns: { email: true },
        });

        if (!userRecord?.email) {
          jobLogger.warn({ userId: bulkJobRecord.userId }, 'User not found or no email');
          continue;
        }

        // Send notification
        await sendExpiryWarningEmail(
          userRecord.email,
          bulkJobRecord.id,
          bulkJobRecord.filename,
          bulkJobRecord.totalCount,
          7,
          bulkJobRecord.resultExpiresAt!
        );

        // Mark as sent
        await markNotificationSent(bulkJobRecord.id, 7);
        summary.sevenDayNotifications++;

        jobLogger.info(
          { bulkJobId: bulkJobRecord.id, email: userRecord.email },
          'Sent 7-day expiry notification'
        );
      } catch (err: any) {
        jobLogger.error(
          { bulkJobId: bulkJobRecord.id, error: err.message },
          'Failed to send 7-day notification'
        );
        summary.errors++;
      }
    }

    // Process 3-day notifications
    for (const bulkJobRecord of threeDayJobs) {
      try {
        // Check if already notified
        if (await wasNotificationSent(bulkJobRecord.id, 3)) {
          jobLogger.debug({ bulkJobId: bulkJobRecord.id }, 'Already sent 3-day notification');
          continue;
        }

        // Get user email
        const userRecord = await db.query.user.findFirst({
          where: eq(user.id, bulkJobRecord.userId),
          columns: { email: true },
        });

        if (!userRecord?.email) {
          jobLogger.warn({ userId: bulkJobRecord.userId }, 'User not found or no email');
          continue;
        }

        // Send notification
        await sendExpiryWarningEmail(
          userRecord.email,
          bulkJobRecord.id,
          bulkJobRecord.filename,
          bulkJobRecord.totalCount,
          3,
          bulkJobRecord.resultExpiresAt!
        );

        // Mark as sent
        await markNotificationSent(bulkJobRecord.id, 3);
        summary.threeDayNotifications++;

        jobLogger.info(
          { bulkJobId: bulkJobRecord.id, email: userRecord.email },
          'Sent 3-day expiry notification'
        );
      } catch (err: any) {
        jobLogger.error(
          { bulkJobId: bulkJobRecord.id, error: err.message },
          'Failed to send 3-day notification'
        );
        summary.errors++;
      }
    }

    jobLogger.info(summary, 'Bulk result expiry notifications completed');

    return summary;
  } catch (error: any) {
    jobLogger.error(
      { error: error.message, stack: error.stack },
      'Result expiry notification job failed'
    );
    throw error;
  }
}

/**
 * Create the notification worker
 */
export function createResultExpiryNotifyWorker(): Worker<NotifyJobData> {
  const worker = new Worker<NotifyJobData>(
    'result-expiry-notify',
    async (job: Job<NotifyJobData>) => {
      return await processNotifications(job);
    },
    {
      connection: bullRedis,
      concurrency: 1,
    }
  );

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'Result expiry notification job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message, stack: err.stack },
      'Result expiry notification job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message, stack: err.stack }, 'Result expiry notify worker error');
  });

  logger.info('Result expiry notify worker started');

  return worker;
}

/**
 * Schedule recurring notifications (daily at 10 AM UTC)
 */
export async function scheduleResultExpiryNotifications(): Promise<void> {
  await notifyQueue.add(
    'notify',
    { triggeredAt: new Date().toISOString() },
    {
      repeat: {
        pattern: '0 10 * * *', // Daily at 10 AM UTC
      },
      jobId: 'result-expiry-notify-cron',
    }
  );

  logger.info('Result expiry notification cron job scheduled (daily at 10 AM UTC)');
}

/**
 * Run once manually (for testing)
 */
export async function runResultExpiryNotifyOnce(): Promise<void> {
  await notifyQueue.add('notify-manual', {
    triggeredAt: new Date().toISOString(),
  });
}

// Export queue for external access
export { notifyQueue };

// Start worker if running as standalone process
if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createResultExpiryNotifyWorker();

  scheduleResultExpiryNotifications().catch((err) => {
    logger.error({ error: err.message }, 'Failed to schedule result expiry notifications');
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down result expiry notify worker');
    await worker.close();
    await notifyQueue.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down result expiry notify worker');
    await worker.close();
    await notifyQueue.close();
    process.exit(0);
  });
}
