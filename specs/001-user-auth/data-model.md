# Data Model: User Authentication & Profile Management

**Feature**: 001-user-auth | **Date**: 2026-01-31
**Source**: `docs/architecture.md` Section 12, Feature spec `specs/001-user-auth/spec.md`

---

## Entities

### Users

Primary entity representing a platform account holder.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Normalized to lowercase |
| first_name | VARCHAR(255) | | |
| last_name | VARCHAR(255) | | |
| avatar_url | TEXT | | CDN URL from DO Spaces |
| google_id | VARCHAR(255) | UNIQUE | NULL for email/password-only users |
| password_hash | VARCHAR(255) | | NULL for Google-only users; bcrypt cost 12 |
| email_verified | BOOLEAN | DEFAULT FALSE | Must be TRUE for dashboard access |
| payment_customer_id | VARCHAR(255) | UNIQUE | Payment provider customer ID |
| language | VARCHAR(10) | DEFAULT 'en' | Only 'en' at MVP |
| data_retention_days | INTEGER | DEFAULT 30 | 7, 14, 30, 60, or 90 |
| deletion_requested_at | TIMESTAMPTZ | | NULL = not scheduled; set = grace period active |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes**:
- `users_email_idx` — UNIQUE on `email`
- `users_google_id_idx` — UNIQUE on `google_id` WHERE `google_id IS NOT NULL`
- `users_deletion_idx` — on `deletion_requested_at` WHERE `deletion_requested_at IS NOT NULL` (for cron job)

**Identity & Uniqueness**:
- Email is the primary identity. One account per email.
- Google ID is a secondary identity. Links to exactly one user.
- A user can have both a password and a Google ID (linked account).

**State Transitions**:
```
[Created] → email_verified=false
    ↓ verify-email
[Active] → email_verified=true, deletion_requested_at=NULL
    ↓ request deletion
[Pending Deletion] → deletion_requested_at=<timestamp>
    ↓ sign in (cancel)          ↓ 30 days elapsed
[Active]                    [Anonymized]
```

**Anonymization** (after 30-day grace period):
- email → `deleted_{uuid}@anonymized.local`
- first_name, last_name, avatar_url, google_id, password_hash → NULL
- email_verified → FALSE
- deleted_at timestamp added (or use updated_at)

---

### Sessions

Server-side session records for authenticated users.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| user_id | UUID | FK → users(id) ON DELETE CASCADE, NOT NULL | |
| token_hash | VARCHAR(255) | UNIQUE, NOT NULL | SHA-256 of session token |
| expires_at | TIMESTAMPTZ | NOT NULL | 30 days from creation |
| last_authenticated_at | TIMESTAMPTZ | DEFAULT NOW() | Updated on sign-in, OAuth callback, password re-entry; used for 10-min re-auth window |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes**:
- `sessions_token_hash_idx` — UNIQUE on `token_hash` (lookup by cookie)
- `sessions_user_id_idx` — on `user_id` (for mass revocation)
- `sessions_expires_at_idx` — on `expires_at` (for cleanup cron)

**Lifecycle**:
- Created on: successful sign-in, successful email verification, successful OAuth callback, successful password reset
- Rotated on: email change, password change (current session gets new token, others destroyed)
- Destroyed on: sign-out (single session), password change (all other sessions), account deletion
- Expired: 30 days from creation; cleaned up by hourly cron job

---

### Verification Codes

Time-limited codes for email verification and password reset.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| user_id | UUID | FK → users(id) ON DELETE CASCADE, NOT NULL | |
| code_hash | VARCHAR(255) | NOT NULL | SHA-256 of 6-digit code |
| purpose | VARCHAR(20) | NOT NULL | 'email_verification', 'password_reset', 'email_change', 'account_deletion' |
| attempts | INTEGER | DEFAULT 0 | Max 5 attempts before invalidation |
| expires_at | TIMESTAMPTZ | NOT NULL | 15 minutes from creation |
| consumed_at | TIMESTAMPTZ | | Set when code is successfully used |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes**:
- `verification_codes_user_purpose_idx` — on `(user_id, purpose)` WHERE `consumed_at IS NULL AND expires_at > NOW()` (find active code)

**Validation Rules**:
- Code: 6-digit numeric string (000000–999999)
- Max 5 wrong attempts → code invalidated (must request new)
- Only one active code per user per purpose at a time (new code invalidates previous)
- Expired codes cannot be used (410 Gone response)

---

### Credit Events

Immutable ledger of all credit transactions. Relevant to this feature only for the signup bonus allocation.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | BIGSERIAL | PK | |
| user_id | UUID | FK → users(id), NOT NULL | Retained even after anonymization |
| type | VARCHAR(20) | NOT NULL | 'signup_bonus', 'purchase', 'subscription', 'deduct', 'refund' |
| amount | INTEGER | NOT NULL | Positive = credit, negative = debit |
| balance_after | INTEGER | NOT NULL | Running balance after this event |
| reference_type | VARCHAR(50) | | 'registration', 'payment', 'verification', etc. |
| reference_id | VARCHAR(255) | | Related entity ID |
| idempotency_key | VARCHAR(255) | UNIQUE | Prevents double-processing |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes**:
- `credit_events_user_id_idx` — on `user_id` (user history lookup)
- `credit_events_idempotency_idx` — UNIQUE on `idempotency_key`

---

### Billing Info (Extension to Users or Separate Table)

Billing address for invoicing. Stored as part of the user profile.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| user_id | UUID | PK, FK → users(id) ON DELETE CASCADE | One billing address per user |
| address | VARCHAR(500) | | Free-form street address |
| city | VARCHAR(255) | | |
| state | VARCHAR(255) | | State/province/region |
| postal_code | VARCHAR(20) | | |
| country | VARCHAR(100) | | Country name or ISO code |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Design decision**: Separate table rather than adding columns to users, since billing info is optional and rarely accessed. Keeps the users table lean for auth queries.

---

## Redis Keys (Auth-Related)

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `user:{userId}:credits` | STRING (integer) | None (noeviction) | Credit balance cache |
| `ratelimit:signin:{email}` | SORTED SET | 15 min | Sign-in attempt tracking |
| `ratelimit:signup:{ip}` | SORTED SET | 1 hour | Sign-up attempt tracking |
| `ratelimit:pwreset:{email}` | SORTED SET | 1 hour | Password reset attempt tracking |
| `ratelimit:verify:{userId}` | SORTED SET | 15 min | Verification code attempt tracking |
| `ratelimit:oauth:{ip}` | SORTED SET | 1 min | OAuth callback attempt tracking |
| `lockout:{email}` | STRING | 30 min | Account lockout flag |

---

## Relationships

```
Users 1 ──── * Sessions        (one user, many sessions)
Users 1 ──── * VerificationCodes (one user, many codes over time)
Users 1 ──── * CreditEvents     (one user, many credit transactions)
Users 1 ──── 0..1 BillingInfo   (one user, optional billing address)
```
