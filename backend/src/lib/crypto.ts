import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/bcrypt';

const BCRYPT_COST = 12;

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateVerificationCode(): string {
  const code = crypto.randomInt(0, 1_000_000);
  return code.toString().padStart(6, '0');
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return verify(password, passwordHash);
}
