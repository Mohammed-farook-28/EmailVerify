import fs from 'node:fs';
import path from 'node:path';
import { pool, query } from './database.js';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await query<{ filename: string }>(
    'SELECT filename FROM schema_migrations ORDER BY id',
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function run(): Promise<void> {
  console.log('Running migrations...');

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file],
      );
      await client.query('COMMIT');
      console.log(`  Applied: ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  Failed: ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(
    count > 0
      ? `Done. Applied ${count} migration(s).`
      : 'No new migrations to apply.',
  );
  await pool.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
