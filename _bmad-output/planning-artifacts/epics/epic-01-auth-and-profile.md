# Epic 1: User Authentication & Profile Management

## Epic Goal

Users can create accounts (email/password or Google OAuth), verify their email, sign in, manage their profile (name, email, password, avatar, language), link Google accounts, and delete their account with a 30-day recovery grace period. New users receive free credits upon signup to begin verifying immediately.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR65
**Dependencies:** None — this is the foundation epic.

---

# Backend Stories

## Story 1.1: Email/Password Registration with Email Verification

As a new user,
I want to create an account with my email and password and verify my email,
So that I can access the platform and start verifying emails with free credits.

**FRs:** FR1, FR3, FR65 | **NFRs:** NFR10, NFR12, NFR15, NFR16

**Acceptance Criteria:**

**Given** a POST request to `/auth/sign-up` with valid email, first_name, last_name, and password (min 8 chars)
**When** the email is not already registered
**Then** a user record is created with `email_verified=false`, password hashed (bcrypt cost 12), first_name, last_name stored separately
**And** a 6-digit verification code is generated (stored hashed, 15-min expiry) and emailed via Resend
**And** the response returns 201 with `{ message, userId }`

**Given** a POST request to `/auth/verify-email` with valid userId and correct code
**When** the code is valid and not expired
**Then** `email_verified` is set to true
**And** a session is created (256-bit random token, SHA-256 hashed, stored in `sessions` table)
**And** `Set-Cookie: ev_session` is set (httpOnly, Secure, SameSite=Strict, 30-day expiry)
**And** free credits are allocated (Redis `INCRBY user:{userId}:credits` + `credit_events` INSERT type='signup_bonus')
**And** response returns 200 with `{ user }` object

**Edge Cases:**
- Duplicate email → 409 Conflict with `{ error: "Email already registered" }`
- Weak password (< 8 chars) → 422 with validation errors
- Expired verification code → 410 Gone, prompt to resend
- 5 wrong code attempts → code invalidated, must request new code via `/auth/resend-verification`
- Same email already exists via Google OAuth → 409 with `{ error: "Account exists via Google. Please sign in with Google or link later." }`

**Technical Context:**
- Tables created: `users` (with first_name, last_name columns), `sessions`, `credit_events` (schema in architecture Section 12)
- Redis key: `user:{userId}:credits` — set to initial free credit amount
- Auth rate limits: 3 signups/hr per IP (architecture Section 14)
- Email service: Resend with React Email template for verification code
- Endpoints: `POST /auth/sign-up`, `POST /auth/verify-email`, `POST /auth/resend-verification`

---

## Story 1.2: Google OAuth Sign-Up & Sign-In with Account Linking

As a user,
I want to sign up or sign in using my Google account,
So that I can access EmailKit without managing another password.

**FRs:** FR2, FR13 | **NFRs:** NFR8

**Acceptance Criteria:**

**Given** a GET request to `/auth/google`
**When** the server redirects to Google OAuth 2.0 (Authorization Code flow, scopes: openid, email, profile)
**Then** the user completes Google consent
**And** Google redirects back to `/auth/callback/google` with an authorization code

**Given** a GET/POST callback to `/auth/callback/google` with valid authorization code
**When** the server exchanges the code for tokens and extracts email, name, avatar from id_token
**Then** a user is found by `google_id` or created (with `email_verified=true`)
**And** new users receive free credits (same as Story 1.1)
**And** a session is created, `Set-Cookie: ev_session` is set
**And** the user is redirected to the frontend callback URL (e.g., `/auth/callback?success=true`)

**Given** an existing email/password user
**When** the Google callback finds no `google_id` match but the email matches an existing user
**Then** `google_id` is linked to the existing user record
**And** the user is signed in with a new session

**Edge Cases:**
- Google auth callback error or user cancels → redirect to frontend with `?error=oauth_cancelled`
- OAuth callback rate limit: 10 attempts/min per IP
- User revokes Google access externally → next sign-in fails gracefully, user can still use email/password
- State parameter validation to prevent CSRF

**Technical Context:**
- Google OAuth 2.0 Authorization Code Flow (architecture Section 7)
- Google client ID/secret in environment variables
- Endpoints: `GET /auth/google` (initiate), `GET /auth/callback/google` (callback)
- Account linking: match on `users.email` when `google_id` not found but email exists

---

## Story 1.3: Email/Password Sign-In

As a returning user,
I want to sign in with my email and password,
So that I can access my account.

**FRs:** FR4 | **NFRs:** NFR10, NFR12, NFR14

**Acceptance Criteria:**

**Given** a POST request to `/auth/sign-in` with correct email and password
**When** the user exists and `email_verified=true`
**Then** bcrypt comparison succeeds
**And** a session is created with `Set-Cookie: ev_session` (httpOnly, Secure, SameSite=Strict, 30-day)
**And** response returns 200 with `{ user }` object

**Given** a user with `email_verified=false`
**When** they POST to `/auth/sign-in`
**Then** response returns 403 with `{ error: "Email not verified", action: "verify_email", userId }`

**Edge Cases:**
- Wrong password → 401 generic `{ error: "Invalid credentials" }` (no email enumeration)
- Account doesn't exist → same 401 `{ error: "Invalid credentials" }`
- 5 failed attempts in 15 minutes per email → 429 with `{ error: "Account temporarily locked", retryAfter: 1800 }`
- Account in deletion grace period → cancel deletion, restore account, sign in normally

**Technical Context:**
- Auth rate limits: 5 attempts/15min per email (architecture Section 14)
- CSRF token required on all POST requests
- Endpoint: `POST /auth/sign-in`

---

## Story 1.4: Password Reset

As a user who forgot their password,
I want to reset it via a code sent to my email,
So that I can regain access to my account.

**FRs:** FR5 | **NFRs:** NFR10

**Acceptance Criteria:**

**Given** a POST to `/auth/password-reset` with an email address
**When** the request is processed
**Then** if the email exists and is verified, a 6-digit reset code is emailed (15-min expiry)
**And** the response always returns 200 `{ message: "If an account exists, a code has been sent" }` (no enumeration)

**Given** a POST to `/auth/password-reset/verify` with email, code, and new password (min 8 chars)
**When** the code is valid and not expired
**Then** the password is updated (bcrypt cost 12)
**And** all existing sessions are invalidated (`DELETE FROM sessions WHERE user_id = X`)
**And** a new session is created with `Set-Cookie: ev_session`
**And** response returns 200 with `{ user }`

**Edge Cases:**
- Non-existent email → same 200 success response (no enumeration)
- Expired code → 410 Gone, prompt to request new
- 5 wrong code attempts → code invalidated, must request new
- Rate limit: 3 reset requests/hr per email → 429

**Technical Context:**
- Auth rate limits: 3 requests/hr per email (architecture Section 14)
- Session invalidation: mass delete by user_id
- Endpoints: `POST /auth/password-reset`, `POST /auth/password-reset/verify`

---

## Story 1.5: Profile Settings (Name, Email, Password, Language)

As a signed-in user,
I want to update my profile information,
So that my account reflects my current details and preferences.

**FRs:** FR6, FR7, FR8, FR10 | **NFRs:** NFR14

**Acceptance Criteria:**

**Given** a PUT to `/home/profile/name` with `{ firstName, lastName }`
**When** the user is authenticated (valid ev_session)
**Then** name fields are updated and response returns 200 with updated `{ user }`

**Given** a PUT to `/home/profile/email` with `{ newEmail, password }` (re-authentication)
**When** the password is correct and was verified within the last 10 minutes
**Then** a verification code is sent to the NEW email address
**And** response returns 200 with `{ message: "Verification code sent to new email" }`

**Given** a POST to `/home/profile/email/verify` with `{ code }`
**When** the code is correct
**Then** the email is updated, session token is rotated
**And** response returns 200 with updated `{ user }`

**Given** a PUT to `/home/profile/password` with `{ currentPassword, newPassword }`
**When** currentPassword is verified
**Then** new password is saved (bcrypt cost 12)
**And** all OTHER sessions are invalidated (current session preserved with rotated token)
**And** response returns 200 with `{ message: "Password updated" }`

**Given** a PUT to `/home/profile/language` with `{ language }`
**When** the language is supported
**Then** the preference is saved and response returns 200 with updated `{ user }`

**Edge Cases:**
- New email already taken → 409 with error
- Current password incorrect → 401 with error
- Re-authentication window expired (>10 min) → 403 requiring re-auth
- Language options: `en` only at MVP (validate against allowed list)

**Technical Context:**
- Sensitive Action Re-authentication: architecture Section 7
- Endpoints: `PUT /home/profile/name`, `PUT /home/profile/email`, `POST /home/profile/email/verify`, `PUT /home/profile/password`, `PUT /home/profile/language`
- Session token rotation on sensitive changes

---

## Story 1.6: Avatar Upload

As a signed-in user,
I want to upload a profile picture,
So that my account has a recognizable avatar.

**FRs:** FR9

**Acceptance Criteria:**

**Given** a POST to `/home/profile/avatar` with a multipart file upload
**When** the file is a valid image (JPG, PNG, GIF; max 5MB)
**Then** the image is stored in DigitalOcean Spaces
**And** `avatar_url` is updated on the user record
**And** response returns 200 with `{ avatarUrl }`

**Edge Cases:**
- Invalid file type (not image) → 415 Unsupported Media Type
- File exceeds 5MB → 413 Payload Too Large
- Upload fails (storage error) → 500 with error, existing avatar preserved
- Resize/optimize on server before storage (consistent dimensions, e.g., 200x200)

**Technical Context:**
- Storage: DigitalOcean Spaces (S3-compatible) — server-side upload
- Endpoint: `POST /home/profile/avatar`
- Consider sharp or similar for image resizing

---

## Story 1.7: Account Deletion with Grace Period

As a user,
I want to delete my account with a recovery window,
So that my data is removed but I have time to change my mind.

**FRs:** FR11, FR12 | **NFRs:** Related to GDPR (architecture Section 14)

**Acceptance Criteria:**

**Given** a DELETE to `/home/profile` with re-authentication (password or recent Google OAuth)
**When** the user confirms intent via 6-digit email verification code
**Then** `deletion_requested_at` is set on the user record (30-day grace period begins)
**And** the user is signed out (session destroyed)
**And** a confirmation email is sent explaining the grace period and how to cancel

**Given** a user in the deletion grace period
**When** they successfully sign in (Story 1.3)
**Then** `deletion_requested_at` is set to NULL (deletion cancelled)
**And** a confirmation email is sent: "Your account has been restored"

**Given** 30 days have elapsed since `deletion_requested_at`
**When** the daily anonymization cron job runs
**Then** email → `deleted_{uuid}@anonymized.local`, first_name/last_name/avatar_url/google_id/password_hash → NULL
**And** verification_results.email_checked → SHA-256 hash (non-reversible)
**And** api_keys, sessions, webhooks CASCADE deleted
**And** bulk_jobs result files deleted from DO Spaces
**And** credit_events retained with anonymized user_id (financial audit)
**And** user record marked with `deleted_at` timestamp, `email_verified=false`

**Given** a GET to `/home/profile/export`
**When** the user is authenticated
**Then** return a JSON/ZIP archive of: profile data, verification history, credit history, API key metadata, webhook configs

**Edge Cases:**
- Active subscription during grace period → subscription billing continues (cancellation is separate)
- Sign-up attempt with same email during grace period → 409 blocked until anonymized
- GDPR data export during grace period → must be served
- Multiple deletion requests → latest one resets the 30-day timer

**Technical Context:**
- Architecture Section 14 — GDPR & Account Deletion + Account Recovery
- Endpoints: `DELETE /home/profile`, `GET /home/profile/export`
- Cron: daily check for expired grace periods → run anonymization
- Resend email for deletion confirmation and restoration notification

---

# API Contract

> These contracts define the request/response schemas that both backend and frontend must agree on. The backend implements these; the frontend consumes them.

## Authentication Endpoints

### `POST /auth/sign-up`

**Auth:** None
**Rate Limit:** 3/hr per IP

```json
// Request
{
  "firstName": "string (required)",
  "lastName": "string (required)",
  "email": "string (required, valid email)",
  "password": "string (required, min 8 chars)",
  "terms": "boolean (required, must be true)"
}

// Response 201
{
  "message": "Verification code sent to your email",
  "userId": "string (uuid)"
}

// Error 409
{ "error": "Email already registered" }

// Error 422
{ "error": "Validation failed", "details": { "password": "Must be at least 8 characters" } }
```

### `POST /auth/verify-email`

**Auth:** None
**Rate Limit:** 5/15min per userId

```json
// Request
{
  "userId": "string (uuid)",
  "code": "string (6 digits)"
}

// Response 200
{
  "user": {
    "id": "string",
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "plan": "string (tier name, e.g. 'Free')",
    "credits": "number",
    "avatarUrl": "string | null"
  }
}
// Set-Cookie: ev_session=<token>; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000

// Error 410
{ "error": "Code expired", "action": "resend" }

// Error 401
{ "error": "Invalid code", "attemptsRemaining": 3 }
```

### `POST /auth/resend-verification`

**Auth:** None
**Rate Limit:** 3/hr per userId

```json
// Request
{ "userId": "string (uuid)" }

// Response 200
{ "message": "If the account exists and is unverified, a new code has been sent" }
```

### `POST /auth/sign-in`

**Auth:** None
**Rate Limit:** 5/15min per email

```json
// Request
{
  "email": "string (required)",
  "password": "string (required)"
}

// Response 200
{
  "user": { /* same User shape as verify-email */ }
}
// Set-Cookie: ev_session=<token>; ...

// Error 401
{ "error": "Invalid credentials" }

// Error 403
{ "error": "Email not verified", "action": "verify_email", "userId": "string" }

// Error 429
{ "error": "Account temporarily locked", "retryAfter": 1800 }
```

### `GET /auth/google`

**Auth:** None
**Response:** 302 redirect to Google OAuth consent screen

### `GET /auth/callback/google`

**Auth:** None (Google OAuth callback)
**Response:** 302 redirect to frontend:
- Success: `/auth/callback?success=true` (with `Set-Cookie: ev_session`)
- Error: `/auth/callback?error=oauth_cancelled`

### `POST /auth/sign-out`

**Auth:** Session cookie
```json
// Response 200
{ "message": "Signed out" }
// Set-Cookie: ev_session=; Max-Age=0
```

### `POST /auth/password-reset`

**Auth:** None
**Rate Limit:** 3/hr per email

```json
// Request
{ "email": "string (required)" }

// Response 200 (always, no enumeration)
{ "message": "If an account exists, a reset code has been sent" }
```

### `POST /auth/password-reset/verify`

**Auth:** None
**Rate Limit:** 5/15min per email

```json
// Request
{
  "email": "string",
  "code": "string (6 digits)",
  "newPassword": "string (min 8 chars)"
}

// Response 200
{
  "user": { /* User shape */ }
}
// Set-Cookie: ev_session=<token>; ...

// Error 410
{ "error": "Code expired" }

// Error 401
{ "error": "Invalid code", "attemptsRemaining": 3 }
```

## Profile Endpoints

### `GET /home/profile`

**Auth:** Session cookie

```json
// Response 200
{
  "user": {
    "id": "string",
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "plan": "string (tier name)",
    "credits": "number",
    "avatarUrl": "string | null",
    "language": "string",
    "emailVerified": "boolean",
    "googleLinked": "boolean",
    "deletionRequestedAt": "string | null",
    "createdAt": "string (ISO 8601)"
  }
}
```

### `PUT /home/profile/name`

**Auth:** Session cookie

```json
// Request
{ "firstName": "string", "lastName": "string" }

// Response 200
{ "user": { /* updated User */ } }
```

### `PUT /home/profile/email`

**Auth:** Session cookie + re-authentication

```json
// Request
{ "newEmail": "string", "password": "string" }

// Response 200
{ "message": "Verification code sent to new email" }

// Error 409
{ "error": "Email already in use" }

// Error 401
{ "error": "Incorrect password" }
```

### `POST /home/profile/email/verify`

**Auth:** Session cookie

```json
// Request
{ "code": "string (6 digits)" }

// Response 200
{ "user": { /* updated User with new email */ } }
// Set-Cookie: ev_session=<rotated-token>; ...
```

### `PUT /home/profile/password`

**Auth:** Session cookie

```json
// Request
{ "currentPassword": "string", "newPassword": "string (min 8 chars)" }

// Response 200
{ "message": "Password updated" }
// Set-Cookie: ev_session=<rotated-token>; ...

// Error 401
{ "error": "Incorrect current password" }
```

### `PUT /home/profile/language`

**Auth:** Session cookie

```json
// Request
{ "language": "string (e.g. 'en')" }

// Response 200
{ "user": { /* updated User */ } }
```

### `POST /home/profile/avatar`

**Auth:** Session cookie
**Content-Type:** multipart/form-data

```json
// Request: file field "avatar" (JPG, PNG, GIF; max 5MB)

// Response 200
{ "avatarUrl": "string (CDN URL)" }

// Error 415
{ "error": "Unsupported file type. Allowed: JPG, PNG, GIF" }

// Error 413
{ "error": "File too large. Maximum: 5MB" }
```

### `DELETE /home/profile`

**Auth:** Session cookie + re-authentication

```json
// Request
{ "password": "string", "confirmationCode": "string (6 digits)" }

// Response 200
{ "message": "Account deletion scheduled. You have 30 days to cancel by signing in." }
// Set-Cookie: ev_session=; Max-Age=0
```

### `GET /home/profile/export`

**Auth:** Session cookie

```json
// Response 200
// Content-Type: application/json (or application/zip)
{
  "profile": { /* user data */ },
  "verifications": [ /* verification history */ ],
  "credits": [ /* credit events */ ],
  "apiKeys": [ /* key metadata (no secrets) */ ],
  "webhooks": [ /* webhook configs */ ]
}
```

## Frontend Type Mismatches

> The following mismatches between the frontend TypeScript types and the backend schema must be reconciled:

| Frontend Type | Current Value | Backend Value | Resolution |
|---------------|--------------|---------------|------------|
| `User.plan` | `"Basic" \| "Pro" \| "Enterprise"` | 9 tiers + Free | **Frontend must update** to match backend tier names: `"Free" \| "Starter" \| "Popular" \| "Professional" \| "Business" \| "Enterprise" \| "Premium" \| "Ultimate" \| "Mega" \| "Titan"` |
| `User.firstName` / `User.lastName` | Separate fields | Backend `users.name` (single) | **Backend must update** to store `first_name`, `last_name` separately (matches frontend forms) |
| `User.credits` | `number` | Redis balance (number) | Compatible |
| `User.avatarUrl` | `string?` | `avatar_url` (nullable) | Compatible (camelCase in API response) |
| `User` missing fields | N/A (not in type) | `language`, `emailVerified`, `googleLinked`, `deletionRequestedAt`, `createdAt` | **Frontend must add** these 5 fields to `User` type in `src/lib/types/index.ts` |
| `verifyEmailSchema` | `{ code }` only | `{ userId, code }` required by API | **Frontend must add** `userId` field to schema in `src/lib/validations/auth.ts:20-22` |

> **Architecture gaps to resolve:**
> - `users.name` (single column in architecture) must be split into `first_name` + `last_name` to match frontend forms and this epic's design. Update `docs/architecture.md` Section 12.
> - `users` table is missing `deletion_requested_at` column needed by Story 1.7 (30-day grace period). Add to architecture schema.
> - `GET /auth/callback/google` uses GET (standard OAuth redirect), but architecture Section 7 says POST. Architecture should be corrected to GET.

---

# Frontend Integration Stories

## Story 1.8: Auth Provider & Protected Routes

As a frontend developer,
I want to set up authentication state management and route protection,
So that the frontend can determine if a user is logged in and protect dashboard routes.

**Depends on:** Backend Stories 1.1–1.3 deployed

**Acceptance Criteria:**

**Given** the frontend app loads
**When** the app initializes
**Then** a `GET /home/profile` request is made to check auth status
**And** if the session cookie is valid, the user object is stored in a React context/TanStack Query cache
**And** if the cookie is invalid/missing (401), the user is treated as unauthenticated

**Given** an unauthenticated user navigates to any `/home/*` route
**When** the Next.js middleware runs
**Then** they are redirected to `/auth/sign-in`

**Given** an authenticated user navigates to `/auth/*` routes
**When** the middleware runs
**Then** they are redirected to `/home`

**Given** the user signs out
**When** `POST /auth/sign-out` returns success
**Then** the auth state is cleared, TanStack Query cache is reset, and the user is redirected to `/auth/sign-in`

**Edge Cases:**
- Session expires mid-use → 401 from any API call → redirect to sign-in with return URL
- Network error checking auth → show error state, don't redirect (avoid flashing)
- Race condition: multiple tabs, one signs out → other tabs detect on next API call

**Technical Context:**
- Frontend repo: `/Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/`
- Next.js middleware: `src/middleware.ts` — check `ev_session` cookie presence for route protection
- Auth context: TanStack Query `useQuery(['user'], fetchProfile)` with `staleTime: 5min`
- API client: create `src/lib/api.ts` — base fetch wrapper with credentials: 'include', error interceptor
- No NextAuth.js needed — backend manages sessions via httpOnly cookies

---

## Story 1.9: Auth Form Integration

As a frontend developer,
I want to wire the existing auth forms to the backend API,
So that users can register, sign in, verify email, and reset passwords.

**Depends on:** Story 1.8 (auth provider), Backend Stories 1.1–1.4

**Acceptance Criteria:**

**Given** the sign-up form at `/auth/sign-up`
**When** the user submits valid data (firstName, lastName, email, password, terms)
**Then** `POST /auth/sign-up` is called
**And** on success (201), the user is redirected to `/auth/verify-email` with userId in state/query
**And** on error (409/422), the error message is displayed on the form

**Given** the verify-email form at `/auth/verify-email`
**When** the user enters the 6-digit code
**Then** `POST /auth/verify-email` is called with userId and code
**And** on success (200), TanStack Query cache is updated with user data, redirect to `/home`
**And** on error (401/410), show error and "Resend code" option

**Given** the sign-in form at `/auth/sign-in`
**When** the user submits email and password
**Then** `POST /auth/sign-in` is called
**And** on success (200), cache updated, redirect to `/home`
**And** on 403 (unverified), redirect to `/auth/verify-email`
**And** on 401/429, show appropriate error

**Given** the "Sign in with Google" button
**When** clicked
**Then** redirect to `GET /auth/google` (backend initiates OAuth)
**And** after OAuth, backend redirects to `/auth/callback` with success/error params
**And** `/auth/callback` page reads params, fetches user profile, redirects to `/home` or shows error

**Given** the password-reset flow at `/auth/password-reset`
**When** the user submits email, then code + new password
**Then** `POST /auth/password-reset` then `POST /auth/password-reset/verify` are called
**And** on success, redirect to `/home` (new session established)

**Edge Cases:**
- Form re-submission prevention (disable button during loading)
- Network timeout → show generic error, allow retry
- Google OAuth popup blocked → inform user to allow popups

**Frontend Reality Notes (verified against source):**
- **verify-email page is a placeholder only** — grey rectangle at line 19, no code input form, no 6-digit entry. Two buttons ("Change E-mail Address", "Resend Verification E-mail") have no `onClick` handlers. Must be built from scratch.
- **password reset is single-step only** — step 2 (code entry + new password) has no UI at all. Only the email entry form exists.
- **password reset copy error** — `password-reset/page.tsx:33` says "send you a **link**" but the API sends a 6-digit code. Must be corrected.
- **sign-up submit button text bug** — `sign-up/page.tsx:144` says "Sign in with Google" (copy-paste error from Google OAuth button). The actual form submit button should say "Sign Up".
- **all auth forms use inline `{ required: true }`** — despite Zod schemas existing in `src/lib/validations/auth.ts` and `@hookform/resolvers` being installed, no form connects via `zodResolver(schema)`. All validation is inline.
- **all `onSubmit` handlers are `console.log` only** — `sign-in:17-18`, `sign-up:17-18`, `password-reset:16-17` all do `console.log("...", data)` with no API calls.
- **Google OAuth buttons have no `onClick` handlers** — just visual elements with no behavior.

**Technical Context:**
- Existing form components: `src/app/(auth)/auth/sign-in/page.tsx`, `auth/sign-up/page.tsx`, `auth/verify-email/page.tsx`, `auth/password-reset/page.tsx`
- **New page needed:** `src/app/(auth)/auth/callback/page.tsx` — handles Google OAuth redirect (`/auth/callback?success=true` or `?error=...`)
- Existing Zod schemas: `src/lib/validations/auth.ts`
- React Hook Form already integrated — add `onSubmit` handlers that call API
- Replace mock handlers (`console.log`) with real API calls
- Use `sonner` toast for success/error feedback (installed but `<Toaster />` not mounted in any layout — must be added in Story 1.8)

---

## Story 1.10: Profile & Settings Integration

As a frontend developer,
I want to wire the profile settings page to backend endpoints,
So that users can update their name, email, password, avatar, and delete their account.

**Depends on:** Story 1.8 (auth provider), Backend Stories 1.5–1.7

**Acceptance Criteria:**

**Given** the profile page at `/home/profile`
**When** it loads
**Then** user data is displayed from the TanStack Query cache (populated by auth provider)

**Given** the name edit form
**When** the user updates firstName/lastName and saves
**Then** `PUT /home/profile/name` is called
**And** on success, the query cache is updated and the sidebar user card reflects the change

**Given** the email change form
**When** the user enters new email + current password
**Then** `PUT /home/profile/email` is called
**And** on success, a verification code modal appears for the new email
**And** after code verification via `POST /home/profile/email/verify`, the cache is updated

**Given** the password change form
**When** the user enters current password + new password
**Then** `PUT /home/profile/password` is called
**And** on success, show toast confirmation

**Given** the avatar upload
**When** the user selects an image
**Then** `POST /home/profile/avatar` is called with multipart form data
**And** on success, the avatar URL in the cache is updated (sidebar + profile page)
**And** on error (415/413), show appropriate message

**Given** the "Delete Account" button
**When** the user confirms with re-authentication + verification code
**Then** `DELETE /home/profile` is called
**And** on success, auth state is cleared, redirect to landing page with toast

**Given** the "Export My Data" button
**When** the user clicks it
**Then** `GET /home/profile/export` is called
**And** the response is downloaded as a JSON/ZIP file

**Edge Cases:**
- Avatar preview before upload (client-side only)
- Optimistic update for name change (revert on failure)
- Re-authentication modal for email/password/deletion changes
- Large data export → show loading indicator

**Technical Context:**
- Existing components: `src/components/settings/profile-form.tsx`, `billing-info-form.tsx`, `sso-connections.tsx`
- Existing modals: `src/components/modals/delete-account-modal.tsx`
- Replace mock data in `src/lib/data/mock.ts` with real API calls via TanStack Query mutations
- Cache invalidation: `queryClient.invalidateQueries(['user'])` after mutations

---

## Story 1.11: Billing Info Form Integration

As a frontend developer,
I want to wire the billing info form on the profile Account tab to the backend,
So that users can update their billing address details.

**Depends on:** Story 1.8 (auth provider)

**Acceptance Criteria:**

**Given** the profile page Account tab
**When** the billing info form loads
**Then** existing billing data (address, city, country, state, postal code) is displayed from user profile

**Given** the user edits billing info fields and saves
**When** the form is submitted
**Then** `PUT /home/profile/billing-info` is called (or included in profile update endpoint)
**And** on success, show toast confirmation

**Technical Context:**
- Existing component: `src/components/settings/billing-info-form.tsx` — fields: address, city, country, state, postal code
- Currently renders with empty/mock data
- May need a new backend endpoint or extend `PUT /home/profile/name` to include billing fields

---

## Story 1.12: Data Retention Form Integration

As a frontend developer,
I want to wire the API data retention preference form to the backend,
So that users can configure how long their verification data is retained.

**Depends on:** Story 1.8 (auth provider)

**Acceptance Criteria:**

**Given** the profile Account tab
**When** the data retention form loads
**Then** the current retention period setting is displayed (7-90 days)

**Given** the user changes the retention period
**When** the form is submitted
**Then** the preference is saved via an appropriate API endpoint
**And** on success, show toast confirmation

**Technical Context:**
- Existing component: `src/components/settings/billing-info-form.tsx` (same file, includes retention section)
- Retention periods: 7, 14, 30, 60, 90 days
- May need extension of architecture to support per-user retention preferences

---

## Story 1.13: Profile Billing Tab Integration

As a frontend developer,
I want to wire the Billing tab on the profile page to display credit information,
So that users can see their credit balance and subscription status from the profile page.

**Depends on:** Story 1.8 (auth provider), Story 3.5 (billing integration)

**Acceptance Criteria:**

**Given** the profile page Billing tab
**When** it loads
**Then** `GET /home/billing` data drives a `CreditsCard` component showing: current plan, credits remaining, subscription status

**Edge Cases:**
- Free tier user → show "Free" plan with credit balance
- No subscription → show credit balance only with "Upgrade" CTA

**Technical Context:**
- Existing page: `src/app/(dashboard)/home/profile/page.tsx` — has a Billing tab that renders `CreditsCard`
- Reuses `src/components/billing/credits-card.tsx` component
- Data from same `GET /home/billing` endpoint used by billing page

---

## Story 1.14: SSO Connections Integration

As a frontend developer,
I want to wire the SSO connections section to display Google link status,
So that users can see and manage their linked authentication providers.

**Depends on:** Story 1.8 (auth provider), Backend Story 1.2

**Acceptance Criteria:**

**Given** the profile page SSO section
**When** it loads
**Then** Google connection status shows as "Connected" or "Not connected" based on `user.googleLinked`
**And** if not connected, a "Link Google Account" button initiates OAuth flow

**Given** the SSO section
**When** it displays other providers (e.g., "Sign In Using Reachinbox" with "100 Credits Free" badge)
**Then** these are shown as available but non-functional until integration backends exist

**Edge Cases:**
- Google already linked → show "Connected" status, no action button
- OAuth link flow fails → show error toast, don't break existing auth

**Technical Context:**
- Existing component: `src/components/settings/sso-connections.tsx`
- Lines 28-46: "Sign In Using Reachinbox" option with "100 Credits Free" badge — keep as UI but mark as "Coming Soon" or hide until integration is available
- Google connection status from `user.googleLinked` field in auth context
