import { query } from '../config/database.js';

export interface BillingInfoRow {
  user_id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  updated_at: Date;
}

export async function findByUserId(
  userId: string,
): Promise<BillingInfoRow | null> {
  const result = await query<BillingInfoRow>(
    'SELECT * FROM billing_info WHERE user_id = $1',
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function upsert(
  userId: string,
  data: {
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  },
): Promise<BillingInfoRow> {
  const result = await query<BillingInfoRow>(
    `INSERT INTO billing_info (user_id, address, city, state, postal_code, country)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       address = COALESCE($2, billing_info.address),
       city = COALESCE($3, billing_info.city),
       state = COALESCE($4, billing_info.state),
       postal_code = COALESCE($5, billing_info.postal_code),
       country = COALESCE($6, billing_info.country),
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      data.address ?? null,
      data.city ?? null,
      data.state ?? null,
      data.postalCode ?? null,
      data.country ?? null,
    ],
  );
  return result.rows[0];
}
