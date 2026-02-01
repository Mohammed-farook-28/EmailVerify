CREATE TABLE credit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_type VARCHAR(50),
  reference_id VARCHAR(255),
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_type CHECK (type IN ('signup_bonus', 'purchase', 'subscription', 'deduct', 'refund'))
);

CREATE INDEX credit_events_user_id_idx ON credit_events (user_id);
CREATE UNIQUE INDEX credit_events_idempotency_idx ON credit_events (idempotency_key);
