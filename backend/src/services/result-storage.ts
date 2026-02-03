import { stringify } from 'csv-stringify';
import { Readable, PassThrough } from 'stream';
import { db } from '../db/index.js';
import { bulkVerificationResult } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { uploadToSpaces, generatePresignedUrl, generateResultKey } from './s3-client.js';
import { createLogger } from '../config/logger.js';

const logger = createLogger({ service: 'result-storage' });

/**
 * Generate CSV from verification results and upload to S3
 *
 * @param jobId - Bulk job ID
 * @returns Pre-signed URL for downloading the results
 */
export async function generateAndUploadResults(jobId: string): Promise<string> {
  try {
    logger.info({ jobId }, 'Starting result CSV generation');

    // Fetch all verification results for this job
    const results = await db
      .select()
      .from(bulkVerificationResult)
      .where(eq(bulkVerificationResult.jobId, jobId));

    logger.info({ jobId, resultCount: results.length }, 'Fetched verification results');

    if (results.length === 0) {
      throw new Error('No results found for job');
    }

    // Create CSV stringifier
    const stringifier = stringify({
      header: true,
      columns: [
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
      ],
    });

    // Convert stringifier to buffer
    const chunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on('data', (chunk) => {
      chunks.push(chunk);
    });

    // Pipe results through stringifier with error handling
    await new Promise<void>((resolve, reject) => {
      stringifier.on('error', reject);
      passThrough.on('error', reject);
      passThrough.on('end', resolve);

      for (const result of results) {
        stringifier.write({
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
        });
      }

      stringifier.end();
      stringifier.pipe(passThrough);
    });

    const csvBuffer = Buffer.concat(chunks);

    logger.info(
      { jobId, csvSize: csvBuffer.length },
      'CSV generation complete'
    );

    // Generate S3 key
    const s3Key = generateResultKey(jobId);

    // Upload to S3
    await uploadToSpaces(s3Key, csvBuffer, 'text/csv');

    logger.info({ jobId, s3Key }, 'Uploaded results to S3');

    // Generate pre-signed URL (valid for 7 days)
    const presignedUrl = await generatePresignedUrl(s3Key);

    logger.info({ jobId, presignedUrl }, 'Generated pre-signed URL');

    return presignedUrl;
  } catch (error: any) {
    logger.error({ jobId, error }, 'Failed to generate and upload results');
    throw error;
  }
}

/**
 * Stream verification results as CSV
 *
 * @param jobId - Bulk job ID
 * @returns Readable stream of CSV data
 */
export async function streamResultsAsCSV(jobId: string): Promise<Readable> {
  // Fetch all verification results for this job
  const results = await db
    .select()
    .from(bulkVerificationResult)
    .where(eq(bulkVerificationResult.jobId, jobId));

  // Create CSV stringifier
  const stringifier = stringify({
    header: true,
    columns: [
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
    ],
  });

  // Write results to stringifier
  for (const result of results) {
    stringifier.write({
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
    });
  }

  stringifier.end();

  return stringifier;
}
