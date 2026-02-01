import { query } from '../config/database.js';
import {
  generateVerificationCode,
  hashToken,
} from '../lib/crypto.js';

export interface VerificationCodeRow {
  id: string;
  user_id: string;
  code_hash: string;
  purpose: string;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

const CODE_EXPIRY_MINUTES = 15;
const MAX_ATTEMPTS = 5;

export async function create(
  userId: string,
  purpose: string,
): Promise<{ row: VerificationCodeRow; code: string }> {
  // Invalidate any existing active codes for this user+purpose
  await invalidateByUserAndPurpose(userId, purpose);

  const code = generateVerificationCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  const result = await query<VerificationCodeRow>(
    `INSERT INTO verification_codes (user_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, codeHash, purpose, expiresAt.toISOString()],
  );

  return { row: result.rows[0], code };
}

export async function findActiveByUserAndPurpose(
  userId: string,
  purpose: string,
): Promise<VerificationCodeRow | null> {
  const result = await query<VerificationCodeRow>(
    `SELECT * FROM verification_codes
     WHERE user_id = $1
       AND purpose = $2
       AND consumed_at IS NULL
       AND expires_at > NOW()
       AND attempts < $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, purpose, MAX_ATTEMPTS],
  );
  return result.rows[0] ?? null;
}

export async function incrementAttempts(id: string): Promise<number> {
  const result = await query<{ attempts: number }>(
    `UPDATE verification_codes SET attempts = attempts + 1
     WHERE id = $1
     RETURNING attempts`,
    [id],
  );
  return result.rows[0].attempts;
}

export async function markConsumed(id: string): Promise<void> {
  await query(
    `UPDATE verification_codes SET consumed_at = NOW()
     WHERE id = $1`,
    [id],
  );
}

export async function invalidateByUserAndPurpose(
  userId: string,
  purpose: string,
): Promise<void> {
  await query(
    `UPDATE verification_codes SET consumed_at = NOW()
     WHERE user_id = $1
       AND purpose = $2
       AND consumed_at IS NULL`,
    [userId, purpose],
  );
}
