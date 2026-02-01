import { query } from '../config/database.js';

export interface UserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  google_id: string | null;
  password_hash: string | null;
  email_verified: boolean;
  payment_customer_id: string | null;
  language: string;
  data_retention_days: number;
  deletion_requested_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function findById(id: string): Promise<UserRow | null> {
  const result = await query<UserRow>(
    'SELECT * FROM users WHERE id = $1',
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const result = await query<UserRow>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  return result.rows[0] ?? null;
}

export async function findByGoogleId(
  googleId: string,
): Promise<UserRow | null> {
  const result = await query<UserRow>(
    'SELECT * FROM users WHERE google_id = $1',
    [googleId],
  );
  return result.rows[0] ?? null;
}

export async function create(data: {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash?: string;
  googleId?: string;
  emailVerified?: boolean;
  avatarUrl?: string;
}): Promise<UserRow> {
  const result = await query<UserRow>(
    `INSERT INTO users (email, first_name, last_name, password_hash, google_id, email_verified, avatar_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.email.toLowerCase(),
      data.firstName,
      data.lastName,
      data.passwordHash ?? null,
      data.googleId ?? null,
      data.emailVerified ?? false,
      data.avatarUrl ?? null,
    ],
  );
  return result.rows[0];
}

export async function updateName(
  id: string,
  firstName: string,
  lastName: string,
): Promise<UserRow> {
  const result = await query<UserRow>(
    `UPDATE users SET first_name = $2, last_name = $3, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, firstName, lastName],
  );
  return result.rows[0];
}

export async function updateEmail(
  id: string,
  email: string,
): Promise<UserRow> {
  const result = await query<UserRow>(
    `UPDATE users SET email = $2, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, email.toLowerCase()],
  );
  return result.rows[0];
}

export async function updatePassword(
  id: string,
  passwordHash: string,
): Promise<void> {
  await query(
    `UPDATE users SET password_hash = $2, updated_at = NOW()
     WHERE id = $1`,
    [id, passwordHash],
  );
}

export async function updateLanguage(
  id: string,
  language: string,
): Promise<UserRow> {
  const result = await query<UserRow>(
    `UPDATE users SET language = $2, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, language],
  );
  return result.rows[0];
}

export async function updateAvatar(
  id: string,
  avatarUrl: string,
): Promise<void> {
  await query(
    `UPDATE users SET avatar_url = $2, updated_at = NOW()
     WHERE id = $1`,
    [id, avatarUrl],
  );
}

export async function updateGoogleId(
  id: string,
  googleId: string,
): Promise<void> {
  await query(
    `UPDATE users SET google_id = $2, updated_at = NOW()
     WHERE id = $1`,
    [id, googleId],
  );
}

export async function setEmailVerified(id: string): Promise<void> {
  await query(
    `UPDATE users SET email_verified = TRUE, updated_at = NOW()
     WHERE id = $1`,
    [id],
  );
}

export async function setDeletionRequested(id: string): Promise<void> {
  await query(
    `UPDATE users SET deletion_requested_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [id],
  );
}

export async function cancelDeletion(id: string): Promise<void> {
  await query(
    `UPDATE users SET deletion_requested_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [id],
  );
}

export async function updateDataRetentionDays(
  id: string,
  days: number,
): Promise<void> {
  await query(
    `UPDATE users SET data_retention_days = $2, updated_at = NOW()
     WHERE id = $1`,
    [id, days],
  );
}

export async function findPendingDeletion(
  olderThanDays: number,
): Promise<UserRow[]> {
  const result = await query<UserRow>(
    `SELECT * FROM users
     WHERE deletion_requested_at IS NOT NULL
       AND deletion_requested_at < NOW() - INTERVAL '1 day' * $1`,
    [olderThanDays],
  );
  return result.rows;
}

export async function anonymize(id: string): Promise<void> {
  await query(
    `UPDATE users SET
       email = 'deleted_' || id || '@anonymized.local',
       first_name = NULL,
       last_name = NULL,
       avatar_url = NULL,
       google_id = NULL,
       password_hash = NULL,
       email_verified = FALSE,
       updated_at = NOW()
     WHERE id = $1`,
    [id],
  );
}
