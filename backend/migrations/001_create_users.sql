CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  avatar_url TEXT,
  google_id VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  payment_customer_id VARCHAR(255) UNIQUE,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  data_retention_days INTEGER NOT NULL DEFAULT 30,
  deletion_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX users_email_idx ON users (email);
CREATE UNIQUE INDEX users_google_id_idx ON users (google_id) WHERE google_id IS NOT NULL;
CREATE INDEX users_deletion_idx ON users (deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;
