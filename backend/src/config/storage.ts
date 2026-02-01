import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

export const s3 = new S3Client({
  endpoint: `https://${env.doSpacesRegion}.digitaloceanspaces.com`,
  region: env.doSpacesRegion,
  credentials: {
    accessKeyId: env.doSpacesKey,
    secretAccessKey: env.doSpacesSecret,
  },
  forcePathStyle: false,
});

export const bucket = env.doSpacesBucket;
export const cdnUrl = env.doSpacesCdnUrl;
