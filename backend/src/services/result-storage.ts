import { stringify } from 'csv-stringify';
import { Readable } from 'stream';
import { db } from '../db/index.js';
import { bulkVerificationResult } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { uploadToSpaces, generatePresignedUrl, generateResultKey } from './s3-client.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger({ service: 'result-storage' });

const CSV_COLUMNS = [
  { key: 'email', header: 'Email' },
  { key: 'status', header: 'Status' },
  { key: 'deliverable', header: 'Deliverable' },
  { key: 'risky', header: 'Risky' },
  { key: 'riskScore', header: 'Risk Score' },
  { key: 'smtpProvider', header: 'SMTP Provider' },
  { key: 'isFreeEmail', header: 'Free Email' },
  { key: 'isRoleBased', header: 'Role Based' },
  { key: 'isCatchAll', header: 'Catch All' },
  { key: 'isDisposable', header: 'Disposable' },
  { key: 'hasMxRecords', header: 'Has MX Records' },
];

const PAGE_SIZE = 5000;

function formatResult(result: typeof bulkVerificationResult.$inferSelect) {
  return {
    email: result.email,
    status: result.status,
    deliverable: result.deliverable ? 'Yes' : 'No',
    risky: result.risky ? 'Yes' : 'No',
    riskScore: result.riskScore.toFixed(2),
    smtpProvider: result.smtpProvider || '',
    isFreeEmail: result.isFreeEmail ? 'Yes' : 'No',
    isRoleBased: result.isRoleBased ? 'Yes' : 'No',
    isCatchAll: result.isCatchAll ? 'Yes' : 'No',
    isDisposable: result.isDisposable ? 'Yes' : 'No',
    hasMxRecords: result.hasMxRecords ? 'Yes' : 'No',
  };
}

/**
 * Generate CSV from verification results and upload to S3
 * Uses paginated reads to avoid loading all results into memory.
 *
 * @param jobId - Bulk job ID
 * @returns Pre-signed URL for downloading the results
 */
export async function generateAndUploadResults(jobId: string): Promise<string> {
  try {
    logger.info({ jobId }, 'Starting result CSV generation');

    const stringifier = stringify({ header: true, columns: CSV_COLUMNS });
    const s3Key = generateResultKey(jobId);

    // Start S3 upload immediately — it reads from the stringifier stream
    // as we push pages into it, so data flows through without buffering everything.
    const uploadPromise = uploadToSpaces(s3Key, stringifier, 'text/csv');

    // Paginated read — push rows into the stringifier while S3 consumes the other end
    let offset = 0;
    let hasMore = true;
    let totalRows = 0;

    while (hasMore) {
      const page = await db
        .select()
        .from(bulkVerificationResult)
        .where(eq(bulkVerificationResult.jobId, jobId))
        .limit(PAGE_SIZE)
        .offset(offset);

      for (const result of page) {
        stringifier.write(formatResult(result));
      }

      totalRows += page.length;
      offset += PAGE_SIZE;
      hasMore = page.length === PAGE_SIZE;
    }

    if (totalRows === 0) {
      stringifier.end();
      // Await + ignore the upload (it'll get an empty stream / error)
      await uploadPromise.catch(() => {});
      throw new Error('No results found for job');
    }

    stringifier.end();

    logger.info({ jobId, resultCount: totalRows }, 'CSV generation complete');

    try {
      await uploadPromise;

      logger.info({ jobId, s3Key }, 'Uploaded results to S3');

      // Generate pre-signed URL (valid for 7 days)
      const presignedUrl = await generatePresignedUrl(s3Key);

      logger.info({ jobId, presignedUrl }, 'Generated pre-signed URL');

      return presignedUrl;
    } catch (s3Error: any) {
      // In dev mode with test credentials, S3 upload will fail — don't crash the job
      logger.warn({ jobId, error: s3Error.message }, 'S3 upload failed, results available via API only');
      return '';
    }
  } catch (error: any) {
    logger.error({ jobId, error }, 'Failed to generate and upload results');
    throw error;
  }
}

/**
 * Stream verification results as CSV
 * Uses paginated reads to avoid loading all results into memory.
 *
 * @param jobId - Bulk job ID
 * @returns Readable stream of CSV data
 */
export async function streamResultsAsCSV(jobId: string): Promise<Readable> {
  const stringifier = stringify({ header: true, columns: CSV_COLUMNS });

  // Paginated read in the background
  (async () => {
    try {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const page = await db
          .select()
          .from(bulkVerificationResult)
          .where(eq(bulkVerificationResult.jobId, jobId))
          .limit(PAGE_SIZE)
          .offset(offset);

        for (const result of page) {
          stringifier.write(formatResult(result));
        }

        offset += PAGE_SIZE;
        hasMore = page.length === PAGE_SIZE;
      }

      stringifier.end();
    } catch (err) {
      stringifier.destroy(err as Error);
    }
  })();

  return stringifier;
}
