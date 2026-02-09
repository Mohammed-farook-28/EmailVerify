import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: parseInt(process.env.PG_POOL_SIZE || '20', 10),
});

export const db = drizzle(pool, { schema });

export async function closePool(): Promise<void> {
  await pool.end();
}
