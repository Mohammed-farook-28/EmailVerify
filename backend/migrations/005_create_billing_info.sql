CREATE TABLE billing_info (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  address VARCHAR(500),
  city VARCHAR(255),
  state VARCHAR(255),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
