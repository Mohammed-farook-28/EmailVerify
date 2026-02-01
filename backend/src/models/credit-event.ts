import { query, getClient } from '../config/database.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';

export interface CreditEventRow {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  idempotency_key: string | null;
  created_at: Date;
}

export async function create(data: {
  userId: string;
  type: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
}): Promise<CreditEventRow> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get current balance from the latest event
    const balanceResult = await client.query<{ balance_after: number }>(
      `SELECT balance_after FROM credit_events
       WHERE user_id = $1
       ORDER BY id DESC LIMIT 1`,
      [data.userId],
    );
    const currentBalance = balanceResult.rows[0]?.balance_after ?? 0;
    const newBalance = currentBalance + data.amount;

    const result = await client.query<CreditEventRow>(
      `INSERT INTO credit_events (user_id, type, amount, balance_after, reference_type, reference_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.userId,
        data.type,
        data.amount,
        newBalance,
        data.referenceType ?? null,
        data.referenceId ?? null,
        data.idempotencyKey ?? null,
      ],
    );

    await client.query('COMMIT');

    // Update Redis cache
    await redis.set(`user:${data.userId}:credits`, newBalance.toString());

    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function findByUserId(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<CreditEventRow[]> {
  const result = await query<CreditEventRow>(
    `SELECT * FROM credit_events
     WHERE user_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return result.rows;
}

export async function allocateSignupBonus(userId: string): Promise<CreditEventRow> {
  return create({
    userId,
    type: 'signup_bonus',
    amount: env.signupBonusCredits,
    referenceType: 'registration',
    referenceId: userId,
    idempotencyKey: `signup_bonus:${userId}`,
  });
}

export async function getBalance(userId: string): Promise<number> {
  // Try Redis cache first
  const cached = await redis.get(`user:${userId}:credits`);
  if (cached !== null) {
    return parseInt(cached, 10);
  }

  // Fallback to DB
  const result = await query<{ balance_after: number }>(
    `SELECT balance_after FROM credit_events
     WHERE user_id = $1
     ORDER BY id DESC LIMIT 1`,
    [userId],
  );
  const balance = result.rows[0]?.balance_after ?? 0;

  // Cache it
  await redis.set(`user:${userId}:credits`, balance.toString());

  return balance;
}
