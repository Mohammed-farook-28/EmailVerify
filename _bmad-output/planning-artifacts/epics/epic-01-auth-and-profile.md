# Epic 1: User Authentication & Profile Management

## Epic Goal

Users can discover EmailKit, create accounts (email/password or Google OAuth), verify their email, sign in, manage their profile (name, email, password, avatar, language), link Google accounts, and delete their account with a 30-day recovery grace period. New users receive free credits upon signup to begin verifying immediately.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR65
**Dependencies:** None — this is the foundation epic.

---

## Story 1.1: Email/Password Registration with Email Verification

As a new user,
I want to create an account with my email and password and verify my email,
So that I can access the dashboard and start verifying emails with free credits.

**FRs:** FR1, FR3, FR65 | **NFRs:** NFR10, NFR12, NFR15, NFR16

**Acceptance Criteria:**

**Given** a visitor on /auth/sign-up
**When** they submit a valid email and password (min 8 chars)
**Then** a user record is created with email_verified=false and password hashed (bcrypt cost 12)
**And** a 6-digit verification code is emailed via transactional email (15-min expiry)

**Given** a user with a pending verification code
**When** they enter the correct code on /auth/verify-email
**Then** email_verified is set to true
**And** a session is created (256-bit random token, SHA-256 hashed, httpOnly Secure SameSite=Strict cookie named ev_session, 30-day expiry)
**And** free credits are allocated (Redis INCRBY + credit_events INSERT type='signup_bonus')
**And** the user is redirected to /home

**Edge Cases:**
- Duplicate email → 409 Conflict error with message
- Weak password (< 8 chars) → 422 validation error
- Expired verification code → prompt to resend
- 5 wrong code attempts → code invalidated, must request new code
- Same email already exists via Google OAuth → inform user to sign in with Google or link later

**Technical Context:**
- Tables created: `users`, `sessions`, `credit_events` (schema in architecture Section 12)
- Redis key: `user:{userId}:credits` — set to initial free credit amount
- Auth rate limits: 3 signups/hr per IP (architecture Section 14)
- UI screens: `docs/figma/auth/spec.md` — Sign Up + Verify Email
- Email service: Resend with React Email template for verification code
- Endpoints: `POST /auth/sign-up`, `POST /auth/verify-email`

---

## Story 1.2: Google OAuth Sign-Up & Sign-In with Account Linking

As a user,
I want to sign up or sign in using my Google account,
So that I can access EmailKit without managing another password.

**FRs:** FR2, FR13 | **NFRs:** NFR8

**Acceptance Criteria:**

**Given** a visitor clicking "Sign in with Google"
**When** they complete the Google OAuth 2.0 Authorization Code flow (scopes: openid, email, profile)
**Then** the server exchanges the code for tokens and extracts email, name, avatar from id_token
**And** a user is found by google_id or created (with email_verified=true — Google guarantees verified emails)
**And** new users receive free credits (same as Story 1.1)
**And** a session is created and the user is redirected to /home

**Given** an existing email/password user
**When** they sign in with Google using the same email address
**Then** the google_id is linked to their existing user record
**And** they are signed in normally with a new session

**Edge Cases:**
- Google auth callback error or user cancels → redirect to /auth/sign-in with error message
- OAuth callback rate limit: 10 attempts/min per IP
- User revokes Google access externally → next sign-in fails, user can still use email/password

**Technical Context:**
- Google OAuth 2.0 Authorization Code Flow (architecture Section 7)
- Google client secret stored in environment variable
- Callback endpoint: `POST /auth/callback/google`
- UI screens: `docs/figma/auth/spec.md` — Sign In with Google button
- Account linking: match on `users.email` when `google_id` not found but email exists

---

## Story 1.3: Email/Password Sign-In

As a returning user,
I want to sign in with my email and password,
So that I can access my dashboard and verification history.

**FRs:** FR4 | **NFRs:** NFR10, NFR12, NFR14

**Acceptance Criteria:**

**Given** a verified user on /auth/sign-in
**When** they submit correct email and password
**Then** bcrypt comparison succeeds
**And** a session is created with httpOnly cookie (ev_session)
**And** the user is redirected to /home

**Given** a user with email_verified=false
**When** they try to sign in
**Then** they are redirected to /auth/verify-email with a prompt to complete verification

**Edge Cases:**
- Wrong password → generic "Invalid credentials" message (no email enumeration)
- Account doesn't exist → same generic "Invalid credentials" message
- 5 failed attempts in 15 minutes per email → 30-minute lockout
- CSRF token required on all POST requests

**Technical Context:**
- Auth rate limits: 5 attempts/15min per email (architecture Section 14)
- CSRF protection on all state-changing requests (architecture Section 7)
- Endpoint: `POST /auth/sign-in`
- UI screens: `docs/figma/auth/spec.md` — Sign In screen

---

## Story 1.4: Password Reset

As a user who forgot their password,
I want to reset it via a code sent to my email,
So that I can regain access to my account.

**FRs:** FR5 | **NFRs:** NFR10

**Acceptance Criteria:**

**Given** a user on /auth/password-reset
**When** they submit their email address
**Then** a 6-digit reset code is sent (15-min expiry, via Resend)
**And** the response shows "If an account exists, a code has been sent" (no enumeration)

**Given** a user with a valid reset code
**When** they submit the code and a new password (min 8 chars)
**Then** the password is updated (bcrypt cost 12)
**And** all existing sessions are invalidated (DELETE FROM sessions WHERE user_id = X)
**And** a new session is created and the user is redirected to /home

**Edge Cases:**
- Non-existent email → same success message (no enumeration)
- Expired code → prompt to request a new one
- 5 wrong code attempts → code invalidated, must request new
- Rate limit: 3 reset requests/hr per email

**Technical Context:**
- Auth rate limits: 3 requests/hr per email (architecture Section 14)
- Session invalidation: mass delete by user_id
- Endpoints: `POST /auth/password-reset`, `POST /auth/password-reset/verify`
- UI screens: `docs/figma/auth/spec.md` — Password Reset screens

---

## Story 1.5: Profile Settings (Name, Email, Password, Language)

As a signed-in user,
I want to update my profile information,
So that my account reflects my current details and preferences.

**FRs:** FR6, FR7, FR8, FR10 | **NFRs:** NFR14

**Acceptance Criteria:**

**Given** a signed-in user on /home/profile
**When** they update their display name
**Then** the name is saved and reflected across the UI immediately

**Given** a user changing their email address
**When** they submit the new email (requires re-authentication within last 10 minutes)
**Then** a verification code is sent to the NEW email address
**And** the email is updated only after the code is verified
**And** the session token is rotated (new token issued)

**Given** a user changing their password
**When** they submit current password + new password (min 8 chars)
**Then** the current password is verified, new password saved (bcrypt cost 12)
**And** all OTHER sessions are invalidated (current session preserved with rotated token)

**Given** a user selecting a language preference
**When** they choose from available options
**Then** the language preference is saved on their user record

**Edge Cases:**
- New email already taken → error message, no change
- Current password incorrect for password change → reject with error
- Re-authentication required for email/password changes (10-min window since last auth)
- Language options: English only at MVP (structure supports post-MVP expansion)

**Technical Context:**
- Sensitive Action Re-authentication: architecture Section 7 — password re-entry or Google re-auth within 10 min
- Endpoints: `PUT /home/profile/name`, `PUT /home/profile/email`, `PUT /home/profile/password`, `PUT /home/profile/language`
- UI screens: `docs/figma/settings/spec.md` — Profile settings page

---

## Story 1.6: Avatar Upload

As a signed-in user,
I want to upload a profile picture,
So that my account has a recognizable avatar across the platform.

**FRs:** FR9

**Acceptance Criteria:**

**Given** a signed-in user on /home/profile
**When** they upload an image file (JPG, PNG, GIF; max 5MB)
**Then** the image is stored in object storage
**And** avatar_url is updated on their user record
**And** the new avatar is displayed in the profile page and sidebar

**Edge Cases:**
- Invalid file type (not image) → reject with clear message
- File exceeds size limit → reject with size limit shown
- Upload fails (storage error) → keep existing avatar, show error message
- No existing avatar → show default placeholder until uploaded

**Technical Context:**
- Storage: DigitalOcean Spaces (S3-compatible) — pre-signed upload or server-side upload
- Endpoint: `POST /home/profile/avatar`
- UI screens: `docs/figma/settings/spec.md` — Avatar section of profile page
- Consider: resize/optimize on server before storage to keep consistent dimensions

---

## Story 1.7: Account Deletion with Grace Period

As a user,
I want to delete my account with a recovery window,
So that my data is removed but I have time to change my mind.

**FRs:** FR11, FR12 | **NFRs:** Related to GDPR (architecture Section 14)

**Acceptance Criteria:**

**Given** a signed-in user requesting account deletion on /home/profile
**When** they re-authenticate (password or Google OAuth within last 10 minutes)
**And** confirm intent via 6-digit email verification code
**Then** a 30-day grace period begins
**And** the user is notified of the grace period and how to cancel (by logging in)

**Given** a user in the deletion grace period
**When** they log in during the 30 days
**Then** the pending deletion is cancelled automatically
**And** a confirmation email is sent
**And** the account is fully restored — no partial anonymization occurs

**Given** 30 days have elapsed since the deletion request
**When** the anonymization job runs
**Then** email is replaced with `deleted_{uuid}@anonymized.local`
**And** name, avatar_url, google_id, password_hash are set to NULL
**And** verification_results.email_checked is replaced with SHA-256 hash (non-reversible)
**And** api_keys, sessions, webhooks are CASCADE deleted
**And** bulk_jobs result files are deleted from DO Spaces
**And** credit_events are retained with anonymized user_id (financial audit compliance)
**And** user record marked with deleted_at timestamp, email_verified=false

**Edge Cases:**
- Active subscription during grace period → billing continues (subscription cancellation is separate)
- User tries to sign up with same email during grace period → blocked until anonymized
- GDPR data export requested before deletion completes → must be served
- Multiple deletion requests → latest one resets the 30-day timer

**Technical Context:**
- Architecture Section 14 — GDPR & Account Deletion + Account Recovery During Grace Period
- Endpoint: `DELETE /home/profile`
- Cron job: daily check for expired grace periods → run anonymization
- GDPR data export: `GET /home/profile/export` — profile, verification history, credit history, API key metadata, webhooks
- UI screens: `docs/figma/settings/spec.md` — Delete Account section
