# Tasks: User Authentication & Profile Management

**Input**: Design documents from `/specs/001-user-auth/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/auth.yaml, contracts/profile.yaml, research.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Includes exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/`, `backend/migrations/`, `backend/tests/`
- **Frontend**: Existing repo at `/Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/src/`

---

## Phase 1: Setup

**Purpose**: Backend project initialization and basic structure

- [ ] T001 Create backend project structure: `backend/` with `src/config/`, `src/middleware/`, `src/routes/`, `src/services/`, `src/models/`, `src/lib/`, `migrations/`, `tests/unit/`, `tests/integration/`, `tests/fixtures/`
- [ ] T002 Initialize backend `backend/package.json` with dependencies: express, @node-rs/bcrypt, resend, sharp, passport, passport-google-oauth20, zod, ioredis, pg, dotenv, cors, helmet, cookie-parser, multer, @aws-sdk/client-s3
- [ ] T003 [P] Configure TypeScript in `backend/tsconfig.json` with strict mode, ES2022 target, path aliases
- [ ] T004 [P] Create environment config loader in `backend/src/config/env.ts` reading all env vars from `specs/001-user-auth/quickstart.md`
- [ ] T005 [P] Create database connection pool in `backend/src/config/database.ts` using pg Pool with DATABASE_URL
- [ ] T006 [P] Create Redis client in `backend/src/config/redis.ts` using ioredis with REDIS_URL
- [ ] T007 [P] Create Resend email client in `backend/src/config/email.ts` with FROM_EMAIL setting
- [ ] T008 [P] Create DO Spaces (S3) client in `backend/src/config/storage.ts` with bucket and CDN URL config

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

### Database Migrations

- [ ] T009 Create migration 001: `users` table in `backend/migrations/001_create_users.sql` per `data-model.md` Users entity (id, email, first_name, last_name, avatar_url, google_id, password_hash, email_verified, payment_customer_id, language, data_retention_days, deletion_requested_at, created_at, updated_at) with indexes
- [ ] T010 Create migration 002: `sessions` table in `backend/migrations/002_create_sessions.sql` per `data-model.md` Sessions entity (id, user_id FK CASCADE, token_hash UNIQUE, expires_at, last_authenticated_at DEFAULT NOW(), created_at) with indexes
- [ ] T011 Create migration 003: `verification_codes` table in `backend/migrations/003_create_verification_codes.sql` per `data-model.md` Verification Codes entity (id, user_id FK CASCADE, code_hash, purpose, attempts, expires_at, consumed_at, created_at) with partial index
- [ ] T012 Create migration 004: `credit_events` table in `backend/migrations/004_create_credit_events.sql` per `data-model.md` Credit Events entity (id BIGSERIAL, user_id FK, type, amount, balance_after, reference_type, reference_id, idempotency_key UNIQUE, created_at) with indexes
- [ ] T013 Create migration 005: `billing_info` table in `backend/migrations/005_create_billing_info.sql` per `data-model.md` Billing Info entity (user_id PK FK CASCADE, address, city, state, postal_code, country, updated_at)
- [ ] T014 Create migration runner in `backend/src/config/migrate.ts` that executes SQL files in order and tracks applied migrations

### Database Models

- [ ] T015 [P] Create User model in `backend/src/models/user.ts` with functions: findById, findByEmail, findByGoogleId, create, updateName, updateEmail, updatePassword, updateLanguage, updateAvatar, updateGoogleId, setDeletionRequested, cancelDeletion, anonymize, getDataRetentionDays, updateDataRetentionDays
- [ ] T016 [P] Create Session model in `backend/src/models/session.ts` with functions: create (generate 256-bit token, store SHA-256 hash), findByTokenHash, deleteById, deleteByUserId, deleteAllExceptCurrent, deleteExpired, rotateToken, updateLastAuthenticated(sessionId)
- [ ] T017 [P] Create VerificationCode model in `backend/src/models/verification-code.ts` with functions: create (generate 6-digit code, store SHA-256 hash), findActiveByUserAndPurpose, incrementAttempts, markConsumed, invalidateByUserAndPurpose
- [ ] T018 [P] Create CreditEvent model in `backend/src/models/credit-event.ts` with functions: create (with idempotency), findByUserId, allocateSignupBonus
- [ ] T019 [P] Create BillingInfo model in `backend/src/models/billing-info.ts` with functions: findByUserId, upsert

### Shared Libraries

- [ ] T020 [P] Create crypto utilities in `backend/src/lib/crypto.ts`: generateSessionToken (256-bit), hashToken (SHA-256), generateVerificationCode (6-digit), hashPassword (bcrypt cost 12), verifyPassword (bcrypt compare)
- [ ] T021 [P] Create Zod validation schemas in `backend/src/lib/schemas.ts`: signUpSchema, signInSchema, verifyEmailSchema, passwordResetSchema, passwordResetVerifySchema, updateNameSchema, updateEmailSchema, updatePasswordSchema, updateLanguageSchema, updateDataRetentionSchema, updateBillingInfoSchema, deletionCodeSchema, deleteAccountSchema
- [ ] T022 [P] Create error classes in `backend/src/lib/errors.ts`: AppError (base), ValidationError (422), AuthError (401), ForbiddenError (403), ConflictError (409), GoneError (410), RateLimitError (429), NotFoundError (404), PayloadTooLargeError (413), UnsupportedMediaError (415)
- [ ] T023 [P] Create User response serializer in `backend/src/lib/serializers.ts` that converts DB row (snake_case) to API response (camelCase) per `contracts/auth.yaml` User schema, including computed `googleLinked` boolean

### Middleware

- [ ] T024 Create auth middleware in `backend/src/middleware/auth.ts`: extract `ev_session` cookie, lookup session by token hash, attach `req.user` and `req.session`, return 401 if invalid/expired
- [ ] T025 [P] Create rate limit middleware factory in `backend/src/middleware/rate-limit.ts`: Redis sliding window implementation per `data-model.md` Redis keys, configurable by (key pattern, max attempts, window seconds, lockout duration)
- [ ] T026 [P] Create CSRF middleware in `backend/src/middleware/csrf.ts`: generate per-session CSRF token, attach it to responses via `X-CSRF-Token` response header on all authenticated GET requests, validate `X-CSRF-Token` request header on POST/PUT/DELETE, exempt API key-authenticated routes
- [ ] T027 [P] Create error handler middleware in `backend/src/middleware/error-handler.ts`: catch AppError subclasses, return appropriate HTTP status + JSON body, log unexpected errors
- [ ] T028 [P] Create validation middleware factory in `backend/src/middleware/validate.ts`: accepts Zod schema, validates req.body, returns 422 with details on failure
- [ ] T085 [P] Create re-auth middleware in `backend/src/middleware/require-reauth.ts`: check `req.session.last_authenticated_at`, if older than 10 minutes return 403 with `{ error: "Re-authentication required", action: "reauth", method: req.user.password_hash ? "password" : "google" }`. Used on sensitive routes: PUT /home/profile/email, PUT /home/profile/password, DELETE /home/profile, POST /home/profile/deletion-code

### Express App

- [ ] T029 Create Express application in `backend/src/app.ts`: helmet, cors (FRONTEND_URL origin, credentials: true), cookie-parser, JSON body parser, mount route files, error handler middleware. Create `backend/src/server.ts` entry point.

### Email Service

- [ ] T030 Create email service in `backend/src/services/email.ts`: sendVerificationCode(email, code), sendPasswordResetCode(email, code), sendDeletionConfirmation(email), sendDeletionCancelled(email), sendEmailChangeCode(newEmail, code) — using Resend client with React Email templates

### Frontend Auth Infrastructure

- [ ] T031 Create API client in `frontend/src/lib/api.ts`: base fetch wrapper with `credentials: 'include'`, JSON content-type, read `X-CSRF-Token` from GET response headers and cache it in module-level variable, send cached token as `X-CSRF-Token` request header on POST/PUT/DELETE, error interceptor (401 → redirect to sign-in, 403 with action=reauth → trigger re-auth prompt), generic request/response handling
- [ ] T032 Create auth provider in `frontend/src/lib/auth-provider.tsx`: React context wrapping TanStack Query `useQuery(['user'], () => api.get('/home/profile'))` with `staleTime: 5min`, `useAuth()` hook returning `{ user, isLoading, isAuthenticated, signOut, invalidate }`
- [ ] T033 Create Next.js middleware in `frontend/src/middleware.ts`: check `ev_session` cookie presence, redirect unauthenticated users from `/home/*` to `/auth/sign-in`, redirect authenticated users from `/auth/*` to `/home`
- [ ] T034 Mount `QueryClientProvider` and `<Toaster />` (sonner) in `frontend/src/app/layout.tsx`, wrap `(dashboard)/layout.tsx` with auth provider
- [ ] T086 Create re-auth prompt component in `frontend/src/components/auth/reauth-prompt.tsx`: modal dialog triggered when API client receives 403 with `action: "reauth"`. If `method: "password"` → show password input, call `POST /auth/sign-in` with email from auth context + entered password (which updates session's last_authenticated_at), then retry original request. If `method: "google"` → show "Re-authenticate with Google" button, redirect to `GET /auth/google?reauth=true`, on callback update last_authenticated_at and retry. Integrate with API client error interceptor from T031.

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Email/Password Account Creation (Priority: P1) MVP

**Goal**: New users can create an account, verify their email, and land on the dashboard with free credits.

**Independent Test**: Submit sign-up form → receive verification code → enter code → redirected to dashboard with credits.

### Implementation for User Story 1

- [ ] T035 [US1] Implement sign-up service in `backend/src/services/auth.ts`: `signUp(data)` — validate email uniqueness, hash password, create user, generate verification code, send email, return userId. Handle 409 (duplicate email), 422 (validation).
- [ ] T036 [US1] Implement verify-email service in `backend/src/services/auth.ts`: `verifyEmail(userId, code)` — validate code (hash compare, expiry, attempts), set email_verified=true, allocate signup bonus credits (Redis + credit_events), create session, return user + session token.
- [ ] T037 [US1] Implement resend-verification service in `backend/src/services/auth.ts`: `resendVerification(userId)` — invalidate existing code, generate new code, send email. Anti-enumeration: always return success.
- [ ] T038 [US1] Create auth routes in `backend/src/routes/auth.ts`: mount `POST /auth/sign-up` (rate limit: 3/hr per IP), `POST /auth/verify-email` (rate limit: 5/15min per userId), `POST /auth/resend-verification` (rate limit: 3/hr per userId) with validation middleware and service calls
- [ ] T039 [US1] Wire sign-up form in `frontend/src/app/(auth)/auth/sign-up/page.tsx`: replace `console.log` with `POST /auth/sign-up` API call, handle 201 (redirect to verify-email with userId), 409 (show error), 422 (show validation errors). Connect Zod schema via `zodResolver`.
- [ ] T040 [US1] Build verify-email form in `frontend/src/app/(auth)/auth/verify-email/page.tsx`: replace grey placeholder with 6-digit code input, wire to `POST /auth/verify-email` with userId from query/state, handle success (update auth cache, redirect to /home), handle 401/410 errors, wire "Resend" button to `POST /auth/resend-verification`

**Checkpoint**: User Story 1 fully functional — sign up → verify → dashboard

---

## Phase 4: User Story 2 — Email/Password Sign-In (Priority: P1)

**Goal**: Returning users sign in with email/password and reach their dashboard.

**Independent Test**: Sign in with valid credentials → redirected to dashboard with user data loaded.

### Implementation for User Story 2

- [ ] T041 [US2] Implement sign-in service in `backend/src/services/auth.ts`: `signIn(email, password)` — find user by email, verify password (bcrypt compare), check email_verified, check lockout (Redis `lockout:{email}`), create session with `last_authenticated_at` set to NOW(). Handle account-locked (429, retryAfter:1800), unverified (403 with userId), deletion grace period recovery (cancel deletion on successful sign-in). Anti-enumeration: generic 401 for wrong password or missing email.
- [ ] T042 [US2] Add sign-in route to `backend/src/routes/auth.ts`: mount `POST /auth/sign-in` with rate limit (5/15min per email), validation, lockout check (Redis `lockout:{email}` key with 30min TTL set after 5 failures)
- [ ] T043 [US2] Wire sign-in form in `frontend/src/app/(auth)/auth/sign-in/page.tsx`: replace `console.log` with `POST /auth/sign-in` API call, handle 200 (update auth cache, redirect to /home), 401 (show error), 403 (redirect to verify-email with userId), 429 (show lockout message with retry timer). Connect Zod schema via `zodResolver`.

**Checkpoint**: User Stories 1 and 2 functional — sign up, verify, sign in

---

## Phase 5: User Story 5 — Route Protection & Session Management (Priority: P1)

**Goal**: Dashboard routes are protected, auth routes redirect authenticated users, sign-out works.

**Independent Test**: Navigate to /home unauthenticated → redirect to sign-in. Navigate to /auth while authenticated → redirect to /home. Click sign out → session destroyed, redirect to sign-in.

### Implementation for User Story 5

- [ ] T044 [US5] Implement sign-out service in `backend/src/services/auth.ts`: `signOut(sessionId)` — delete session from DB, clear `ev_session` cookie (Max-Age=0)
- [ ] T045 [US5] Add sign-out route to `backend/src/routes/auth.ts`: mount `POST /auth/sign-out` with auth middleware, call signOut service
- [ ] T046 [US5] Add GET /home/profile route in `backend/src/routes/profile.ts`: auth middleware, return serialized user from `req.user`. This is the endpoint the frontend auth provider calls to check session validity.
- [ ] T047 [US5] Wire sign-out in frontend sidebar: add onClick handler to sign-out button in `frontend/src/components/layout/sidebar.tsx` that calls `POST /auth/sign-out`, clears TanStack Query cache, redirects to `/auth/sign-in`
- [ ] T048 [US5] Replace `mockUser` imports with auth context in `frontend/src/components/layout/sidebar-user-card.tsx` and `frontend/src/components/layout/sidebar.tsx` — use `useAuth()` hook to get real user data

**Checkpoint**: Full auth lifecycle functional — sign up, verify, sign in, route protection, sign out

---

## Phase 6: User Story 3 — Google OAuth Sign-Up & Sign-In (Priority: P1)

**Goal**: Users can sign up/in via Google OAuth. Existing accounts auto-link.

**Independent Test**: Click "Sign Up Using Google" → complete Google consent → redirected to dashboard.

### Implementation for User Story 3

- [ ] T049 [US3] Configure Passport Google strategy in `backend/src/config/passport.ts`: passport-google-oauth20 strategy with GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, scopes: openid + email + profile
- [ ] T050 [US3] Implement OAuth service in `backend/src/services/auth.ts`: `handleGoogleCallback(profile, isReauth?)` — find user by google_id OR by email (link if exists), create new user if not found (email_verified=true, allocate credits), create session with `last_authenticated_at` set to NOW(). If `isReauth=true`, update existing session's `last_authenticated_at` instead of creating new session. Return redirect URL with session cookie.
- [ ] T051 [US3] Add OAuth routes to `backend/src/routes/auth.ts`: mount `GET /auth/google` (initiate with state parameter for CSRF), `GET /auth/callback/google` (rate limit: 10/min per IP, handle success → redirect to frontend `/auth/callback?success=true` with Set-Cookie, handle error → redirect to `/auth/callback?error=oauth_cancelled`)
- [ ] T052 [US3] Create OAuth callback page at `frontend/src/app/(auth)/auth/callback/page.tsx`: read `success`/`error` query params, if success → fetch profile via auth provider → redirect to /home, if error → redirect to /auth/sign-in with error toast
- [ ] T053 [US3] Wire Google OAuth buttons in `frontend/src/app/(auth)/auth/sign-in/page.tsx` and `frontend/src/app/(auth)/auth/sign-up/page.tsx`: add onClick handler that redirects to `GET /auth/google` (full page redirect, not popup)
- [ ] T087 [US3] Implement Google OAuth re-auth variant: update `GET /auth/google` route (T051) to accept `?reauth=true` query param — when present, pass `prompt: 'consent'` to Passport strategy to force Google re-consent. Update `handleGoogleCallback` (T050) — when `isReauth=true`, update existing session's `last_authenticated_at` instead of creating new session, then redirect to frontend `/auth/callback?reauth=true`. Update frontend callback page (T052) to handle `reauth=true` param by closing re-auth flow and retrying the original request.

**Checkpoint**: All P1 stories complete — email/password sign-up, sign-in, Google OAuth, route protection, sign-out

---

## Phase 7: User Story 4 — Password Reset (Priority: P2)

**Goal**: Users can reset their forgotten password via a 6-digit code.

**Independent Test**: Request reset → enter code + new password → sign in with new password.

### Implementation for User Story 4

- [ ] T054 [US4] Implement password-reset service in `backend/src/services/auth.ts`: `requestPasswordReset(email)` — find user, generate code, send email. Anti-enumeration: always return success. `verifyPasswordReset(email, code, newPassword)` — validate code, update password (bcrypt), invalidate ALL sessions, create new session, return user.
- [ ] T055 [US4] Add password-reset routes to `backend/src/routes/auth.ts`: mount `POST /auth/password-reset` (rate limit: 3/hr per email), `POST /auth/password-reset/verify` (rate limit: 5/15min per email) with validation middleware
- [ ] T056 [US4] Wire password-reset form step 1 in `frontend/src/app/(auth)/auth/password-reset/page.tsx`: replace `console.log` with `POST /auth/password-reset`, on success show step 2 form
- [ ] T057 [US4] Build password-reset step 2 in same page: code input (6-digit) + new password field + submit → `POST /auth/password-reset/verify`, on success update auth cache and redirect to /home

**Checkpoint**: Password recovery works end-to-end

---

## Phase 8: User Story 6 — Profile Name & Language Update (Priority: P2)

**Goal**: Users can update their name and language preference on the profile page.

**Independent Test**: Edit name → save → sidebar and profile page reflect new name.

### Implementation for User Story 6

- [ ] T058 [US6] Add profile update routes in `backend/src/routes/profile.ts`: mount `PUT /home/profile/name` (validate updateNameSchema), `PUT /home/profile/language` (validate updateLanguageSchema) with auth middleware
- [ ] T059 [US6] Wire profile form in `frontend/src/components/settings/profile-form.tsx`: replace `mockUser` with auth context data, wire form submit to `PUT /home/profile/name` via TanStack Query mutation, invalidate user cache on success, show sonner toast

**Checkpoint**: Profile name editing works

---

## Phase 9: User Story 7 — Email Change (Priority: P3)

**Goal**: Users can change their email through a two-step verified process.

**Independent Test**: Enter new email + password → receive code at new email → enter code → profile shows new email.

### Implementation for User Story 7

- [ ] T060 [US7] Implement email-change service in `backend/src/services/user.ts`: `requestEmailChange(userId, newEmail, password)` — verify password, check email uniqueness, generate verification code (purpose: email_change), send code to newEmail. `confirmEmailChange(userId, code)` — validate code, update email, rotate session token.
- [ ] T061 [US7] Add email-change routes in `backend/src/routes/profile.ts`: mount `PUT /home/profile/email` (auth middleware, require-reauth middleware from T085), `POST /home/profile/email/verify` (auth middleware) with validation
- [ ] T062 [US7] Build email change UI in profile page: add email change form to `frontend/src/components/settings/profile-form.tsx` or a new section, with password re-entry field, then verification code modal after first step succeeds

**Checkpoint**: Email change works end-to-end

---

## Phase 10: User Story 8 — Password Change (Priority: P3)

**Goal**: Users can change their password from the profile page.

**Independent Test**: Enter current + new password → save → old password stops working.

### Implementation for User Story 8

- [ ] T063 [US8] Implement password-change service in `backend/src/services/user.ts`: `changePassword(userId, currentPassword, newPassword)` — verify current password, hash new password, invalidate all OTHER sessions, rotate current session token
- [ ] T064 [US8] Add password-change route in `backend/src/routes/profile.ts`: mount `PUT /home/profile/password` (auth middleware, require-reauth middleware from T085) with validation
- [ ] T065 [US8] Build password change form on profile page: add to existing settings UI or new component, wire to `PUT /home/profile/password`, show success toast, handle 401 (wrong current password)

**Checkpoint**: Password change works

---

## Phase 11: User Story 9 — Avatar Upload (Priority: P3)

**Goal**: Users can upload a profile picture visible in sidebar and profile.

**Independent Test**: Upload JPG → avatar appears in sidebar and profile page.

### Implementation for User Story 9

- [ ] T066 [US9] Implement avatar service in `backend/src/services/avatar.ts`: `uploadAvatar(userId, file)` — validate file type (JPG/PNG/GIF) and size (max 5MB), resize to 200x200 via sharp, upload to DO Spaces, update user.avatar_url with CDN URL, return URL
- [ ] T067 [US9] Add avatar route in `backend/src/routes/profile.ts`: mount `POST /home/profile/avatar` (auth middleware, multer middleware for file upload, 5MB limit), call avatar service. Return 413/415 for invalid files.
- [ ] T068 [US9] Build avatar upload UI on profile page: add file input/drop zone to profile form, preview before upload, call `POST /home/profile/avatar` with FormData, update auth cache on success so sidebar avatar updates. Handle errors: 413 → "File too large. Maximum size is 5MB.", 415 → "Unsupported file type. Please upload a JPG, PNG, or GIF image."

**Checkpoint**: Avatar upload works

---

## Phase 12: User Story 10 — Account Deletion with Grace Period (Priority: P3)

**Goal**: Users can delete their account with 30-day recovery grace period.

**Independent Test**: Confirm deletion → signed out → sign back in within 30 days → account restored.

### Implementation for User Story 10

- [ ] T088 [US10] Add deletion code endpoint: implement `POST /home/profile/deletion-code` route in `backend/src/routes/profile.ts` (auth middleware, require-reauth middleware from T085). Service in `backend/src/services/user.ts`: `requestDeletionCode(userId)` — generate 6-digit verification code (purpose: 'account_deletion'), send code to user's email via email service. Rate limit: 3/hr per userId. Contract: `contracts/profile.yaml` POST /home/profile/deletion-code.
- [ ] T069 [US10] Implement account deletion service in `backend/src/services/user.ts`: `requestDeletion(userId, code)` — validate confirmation code (from T088's deletion-code endpoint), set deletion_requested_at, destroy all sessions, send confirmation email. Re-authentication is enforced by require-reauth middleware (T085) on the route. `cancelDeletion(userId)` — clear deletion_requested_at, send restoration email (called from sign-in service on grace period login).
- [ ] T070 [US10] Implement anonymization cron job in `backend/src/services/anonymization.ts`: daily job that finds users with `deletion_requested_at` older than 30 days, anonymizes per `data-model.md` spec (email → deleted_uuid, NULL name/avatar/google_id/password, delete api_keys/sessions/webhooks, hash verification emails, delete bulk job files)
- [ ] T071 [US10] Wire delete account modal in `frontend/src/components/modals/delete-account-modal.tsx`: Step 1 — call `POST /home/profile/deletion-code` (T088) with password to send 6-digit code to user's email. Step 2 — enter code + confirm with `DELETE /home/profile`. Handle 401 (wrong password), 403 (re-auth required → trigger re-auth prompt). Clear auth state on success, redirect to landing page with toast.

**Checkpoint**: Account deletion with grace period works

---

## Phase 13: User Story 11 — Data Export (Priority: P3)

**Goal**: Users can export all their personal data as a downloadable file.

**Independent Test**: Click "Export My Data" → file downloads with profile, verifications, credits, API keys.

### Implementation for User Story 11

- [ ] T072 [US11] Implement data export service in `backend/src/services/user.ts`: `exportData(userId)` — gather profile data, verification history, credit events, API key metadata (no secrets), webhook configs → return as JSON object
- [ ] T073 [US11] Add export route in `backend/src/routes/profile.ts`: mount `GET /home/profile/export` (auth middleware), call export service, return JSON (or create ZIP with Content-Disposition header)
- [ ] T074 [US11] Wire "Export My Data" button on profile page: add click handler that calls `GET /home/profile/export`, trigger browser download of response as JSON/ZIP file

**Checkpoint**: Data export works

---

## Phase 14: User Story 12 — Billing Info Form (Priority: P3)

**Goal**: Users can update billing address on profile Account tab.

**Independent Test**: Fill billing fields → save → reload → fields pre-populated.

### Implementation for User Story 12

- [ ] T075 [US12] Add billing info routes in `backend/src/routes/profile.ts`: mount `PUT /home/profile/billing-info` (auth middleware, validate updateBillingInfoSchema), also add `GET /home/profile/billing-info` to fetch existing data. Call BillingInfo model upsert/findByUserId.
- [ ] T076 [US12] Wire billing info form in `frontend/src/components/settings/billing-info-form.tsx`: fetch existing billing data on mount, wire form submit to `PUT /home/profile/billing-info`, show success toast

**Checkpoint**: Billing info form works

---

## Phase 15: User Story 13 — Data Retention Preference (Priority: P3)

**Goal**: Users can set their API data retention period (7-90 days).

**Independent Test**: Change retention to 14 days → save → reload → shows 14 days.

### Implementation for User Story 13

- [ ] T077 [US13] Add data retention route in `backend/src/routes/profile.ts`: mount `PUT /home/profile/data-retention` (auth middleware, validate updateDataRetentionSchema with enum [7,14,30,60,90]), update user.data_retention_days
- [ ] T078 [US13] Wire data retention form in frontend: fetch current setting from user profile, provide dropdown/select with options [7,14,30,60,90], wire submit to `PUT /home/profile/data-retention`, show success toast

**Checkpoint**: Data retention preference works

---

## Phase 16: User Story 14 — SSO Connections Display (Priority: P3)

**Goal**: Users see Google connection status and available providers on profile page.

**Independent Test**: View SSO section → Google shows "Connected" or "Not connected" based on account.

### Implementation for User Story 14

- [ ] T079 [US14] Wire SSO connections in `frontend/src/components/settings/sso-connections.tsx`: replace static data with auth context `user.googleLinked` to show Google as "Connected" or "Not Connected". Add "Link Google Account" button for unlinked users (redirects to `GET /auth/google`). Mark ReachInbox and other providers as "Coming Soon".

**Checkpoint**: SSO connections display works

---

## Phase 17: User Story 15 — Profile Billing Tab (Priority: P3)

**Goal**: Users see credit balance and subscription status on the profile Billing tab.

**Independent Test**: Navigate to Billing tab → shows plan name, credit balance, subscription status.

### Implementation for User Story 15

- [ ] T080 [US15] Wire Billing tab in `frontend/src/app/(dashboard)/home/profile/page.tsx`: connect CreditsCard component to auth context user data (plan, credits). For free-tier users show "Free" with upgrade CTA. Full billing page data depends on Epic 3 — for now use user.plan and user.credits from auth context.

**Checkpoint**: Billing tab shows real data

---

## Phase 18: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T081 [P] Create session cleanup cron in `backend/src/services/session-cleanup.ts`: hourly job that deletes expired sessions (`DELETE FROM sessions WHERE expires_at < NOW()`)
- [ ] T082 [P] Add request logging middleware in `backend/src/middleware/logger.ts`: log method, path, status, duration for all requests (structured JSON)
- [ ] T083 Security audit: verify all auth endpoints return generic errors (no email enumeration), verify bcrypt cost 12, verify session tokens are 256-bit, verify rate limits match architecture Section 14 table
- [ ] T084 Run quickstart.md validation: follow setup steps end-to-end, verify all 20 endpoints respond correctly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–17)**: All depend on Foundational phase completion
  - P1 stories (US1, US2, US5, US3) should be completed first, in order
  - P2 stories (US4, US6) can start after P1 stories
  - P3 stories (US7–US15) can proceed in any order after P1/P2
- **Polish (Phase 18)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (Sign-Up)**: After Foundational — no other story dependencies
- **US2 (Sign-In)**: After US1 (reuses auth service, user model)
- **US5 (Route Protection)**: After US2 (needs sign-in to test auth redirects)
- **US3 (Google OAuth)**: After US5 (needs route protection for redirect flow)
- **US4 (Password Reset)**: After Foundational — T055 appends routes to `backend/src/routes/auth.ts` (created by US1's T038), so US1 must complete first or T038 must be extracted as a shared foundational task
- **US6 (Profile Name)**: After US5 (needs auth context in frontend)
- **US7–US15**: After US5 (needs authenticated session to test profile endpoints)

### Within Each User Story

- Backend service before backend route
- Backend route before frontend wiring
- All tasks in a story complete before checkpoint

### Parallel Opportunities

Within Phase 2 (Foundational):
- T009–T013 (migrations) can run in parallel
- T015–T019 (models) can run in parallel after migrations
- T020–T023 (shared libs) can run in parallel
- T024–T028, T085 (middleware) can run in parallel
- T031–T034, T086 (frontend infra) can run in parallel with backend tasks

Across user stories (after Foundational):
- US4 (Password Reset) can run in parallel with US1/US2/US5/US3
- US7–US15 (P3 stories) can all run in parallel with each other
- T081–T082 (Polish) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# Launch all migrations in parallel:
T009: Create users migration
T010: Create sessions migration
T011: Create verification_codes migration
T012: Create credit_events migration
T013: Create billing_info migration

# Then all models in parallel:
T015: User model
T016: Session model
T017: VerificationCode model
T018: CreditEvent model
T019: BillingInfo model

# And all shared libs in parallel:
T020: Crypto utilities
T021: Zod schemas
T022: Error classes
T023: Serializers
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (Sign-Up + Verify)
4. **STOP and VALIDATE**: Test sign-up → verify → dashboard flow end-to-end
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Sign-Up) → Test → Deploy (MVP!)
3. US2 (Sign-In) → Test → Deploy
4. US5 (Route Protection) + US3 (Google OAuth) → Test → Deploy
5. US4 (Password Reset) + US6 (Profile Name) → Test → Deploy
6. US7–US15 (P3 stories) → Test → Deploy
7. Polish → Final validation → Ship

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable after its checkpoint
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Frontend repo is at `/Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/`
- Backend repo will be created at `backend/` within the current repository root
