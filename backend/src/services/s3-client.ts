import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

const s3Client = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION || 'nyc3',
  credentials: {
    accessKeyId: process.env.SPACES_ACCESS_KEY!,
    secretAccessKey: process.env.SPACES_SECRET_KEY!,
  },
  forcePathStyle: false,
});

const BUCKET = process.env.SPACES_BUCKET || 'emailkit-bulk-results';
const EXPIRATION_SECONDS = 7 * 24 * 60 * 60; // 7 days for download URLs

/**
 * Upload a file to DigitalOcean Spaces
 */
export async function uploadToSpaces(
  key: string,
  data: Buffer | Readable,
  contentType: string = 'text/csv'
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: data,
    ContentType: contentType,
    ACL: 'private', // Private by default, use pre-signed URLs for access
  });

  await s3Client.send(command);
  return key;
}

/**
 * Generate a pre-signed URL for downloading a file
 */
export async function generatePresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: EXPIRATION_SECONDS,
  });

  return url;
}

/**
 * Delete a file from DigitalOcean Spaces
 */
export async function deleteFromSpaces(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Generate S3 key for bulk verification results
 */
export function generateResultKey(jobId: string): string {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `results/${timestamp}/${jobId}.csv`;
}
