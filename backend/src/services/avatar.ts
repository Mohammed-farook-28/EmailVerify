import sharp from 'sharp';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomBytes } from 'crypto';
import * as UserModel from '../models/user.js';
import { s3, bucket, cdnUrl } from '../config/storage.js';
import {
  PayloadTooLargeError,
  UnsupportedMediaError,
} from '../lib/errors.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function uploadAvatar(
  userId: string,
  file: Express.Multer.File,
): Promise<string> {
  // Validate file type
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    throw new UnsupportedMediaError(
      'Unsupported file type. Please upload a JPG, PNG, or GIF image.',
    );
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    throw new PayloadTooLargeError(
      'File too large. Maximum size is 5MB.',
    );
  }

  // Resize to 200x200
  const resized = await sharp(file.buffer)
    .resize(200, 200, { fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer();

  // Generate unique filename
  const filename = `avatars/${userId}/${randomBytes(16).toString('hex')}.jpg`;

  // Upload to DO Spaces
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: filename,
      Body: resized,
      ContentType: 'image/jpeg',
      ACL: 'public-read',
    }),
  );

  const avatarUrl = `${cdnUrl}/${filename}`;

  // Update user record
  await UserModel.updateAvatar(userId, avatarUrl);

  return avatarUrl;
}
