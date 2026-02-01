import { query } from '../config/database.js';
import {
  generateSessionToken,
  hashToken,
} from '../lib/crypto.js';

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  last_authenticated_at: Date;
  created_at: Date;
}

const SESSION_EXPIRY_DAYS = 30;

export async function create(
  userId: string,
): Promise<{ session: SessionRow; token: string }> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  const result = await query<SessionRow>(
    `INSERT INTO sessions (user_id, token_hash, expires_at, last_authenticated_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING *`,
    [userId, tokenHash, expiresAt.toISOString()],
  );

  return { session: result.rows[0], token };
}

export async function findByTokenHash(
  tokenHash: string,
): Promise<SessionRow | null> {
  const result = await query<SessionRow>(
    `SELECT * FROM sessions
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function deleteById(id: string): Promise<void> {
  await query('DELETE FROM sessions WHERE id = $1', [id]);
}

export async function deleteByUserId(userId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function deleteAllExceptCurrent(
  userId: string,
  currentSessionId: string,
): Promise<void> {
  await query(
    'DELETE FROM sessions WHERE user_id = $1 AND id != $2',
    [userId, currentSessionId],
  );
}

export async function deleteExpired(): Promise<number> {
  const result = await query(
    'DELETE FROM sessions WHERE expires_at < NOW()',
  );
  return result.rowCount ?? 0;
}

export async function rotateToken(
  sessionId: string,
): Promise<{ token: string }> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);

  await query(
    `UPDATE sessions SET token_hash = $2, last_authenticated_at = NOW()
     WHERE id = $1`,
    [sessionId, tokenHash],
  );

  return { token };
}

export async function updateLastAuthenticated(
  sessionId: string,
): Promise<void> {
  await query(
    `UPDATE sessions SET last_authenticated_at = NOW()
     WHERE id = $1`,
    [sessionId],
  );
}
