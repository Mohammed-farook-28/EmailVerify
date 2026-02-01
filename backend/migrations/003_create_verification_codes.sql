CREATE TABLE verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(255) NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_purpose CHECK (purpose IN ('email_verification', 'password_reset', 'email_change', 'account_deletion'))
);

CREATE INDEX verification_codes_user_purpose_idx
  ON verification_codes (user_id, purpose)
  WHERE consumed_at IS NULL AND expires_at > NOW();
