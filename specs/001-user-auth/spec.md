# Feature Specification: User Authentication & Profile Management

**Feature Branch**: `001-user-auth`
**Created**: 2026-01-31
**Status**: Draft
**Input**: User description: "Epic 1: Auth & Profile - Authentication system with sign-in, sign-up, Google OAuth, email verification, password reset, profile management, session management, billing info form, data retention form, SSO connections."

## Clarifications

### Session 2026-01-31

- Q: How should Google-only users re-authenticate for sensitive operations (email change, password change, account deletion)? → A: Re-authenticate via a fresh Google OAuth prompt (re-consent).
- Q: What is the default API data retention period for new accounts? → A: 30 days.
- Q: How long should the account lock last after 5 failed sign-in attempts? → A: 30 minutes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Email/Password Account Creation (Priority: P1)

A new user visits EmailKit, creates an account with their name, email, and password, verifies their email via a 6-digit code, and lands on the verification dashboard with free starter credits ready to use.

**Why this priority**: Without account creation, no other feature is accessible. This is the foundation for all platform access.

**Independent Test**: Can be fully tested by submitting the sign-up form, receiving a verification code, entering it, and confirming the user is redirected to the dashboard with credits allocated.

**Acceptance Scenarios**:

1. **Given** a visitor on the sign-up page, **When** they submit valid first name, last name, email, password (8+ chars), and accept terms, **Then** a 6-digit verification code is sent to their email and they are redirected to the verify-email page.
2. **Given** a user on the verify-email page with a valid code, **When** they enter the correct 6-digit code within 15 minutes, **Then** their email is verified, a session is established, free credits are allocated, and they are redirected to the dashboard.
3. **Given** a user tries to sign up with an already-registered email, **When** they submit the form, **Then** an error message informs them the email is already registered.
4. **Given** a user enters a weak password (fewer than 8 characters), **When** they submit the form, **Then** validation errors are shown before submission.
5. **Given** a user enters an expired or incorrect verification code, **When** they submit, **Then** an error is shown with the option to resend the code.
6. **Given** a user has entered 5 incorrect codes, **When** they try again, **Then** the code is invalidated and they must request a new one.

---

### User Story 2 - Email/Password Sign-In (Priority: P1)

A returning user signs in with their email and password and is taken to their dashboard.

**Why this priority**: Returning users must be able to access their accounts. Equally critical as account creation.

**Independent Test**: Can be tested by signing in with valid credentials and confirming the user reaches the dashboard with their data loaded.

**Acceptance Scenarios**:

1. **Given** a registered user with a verified email, **When** they enter correct email and password, **Then** a session is established and they are redirected to the dashboard.
2. **Given** incorrect credentials (wrong password or non-existent email), **When** the user submits, **Then** a generic "Invalid credentials" error is shown (no email enumeration).
3. **Given** a user with an unverified email, **When** they try to sign in, **Then** they are redirected to the verify-email page to complete verification.
4. **Given** 5 failed sign-in attempts within 15 minutes for the same email, **When** another attempt is made, **Then** the account is locked for 30 minutes with a retry-after message.
5. **Given** a user whose account is in the 30-day deletion grace period, **When** they sign in successfully, **Then** the deletion is cancelled, the account is restored, and they proceed to the dashboard.

---

### User Story 3 - Google OAuth Sign-Up & Sign-In (Priority: P1)

A user clicks "Sign Up/In with Google", authenticates via Google, and is either signed up (new) or signed in (returning) seamlessly. Their Google account is linked for future access.

**Why this priority**: Google OAuth is a primary authentication method that significantly reduces friction for onboarding.

**Independent Test**: Can be tested by clicking the Google button, completing Google consent, and confirming account creation (new) or sign-in (returning) with redirect to dashboard.

**Acceptance Scenarios**:

1. **Given** a new visitor, **When** they click "Sign Up Using Google" and complete Google consent, **Then** an account is created with their Google profile info, email is auto-verified, free credits are allocated, a session is established, and they are redirected to the dashboard.
2. **Given** a returning Google user, **When** they click "Sign In with Google", **Then** they are signed in with an existing session and redirected to the dashboard.
3. **Given** an existing email/password user whose email matches a Google account, **When** they sign in with Google, **Then** the Google account is linked to their existing account and they are signed in.
4. **Given** the user cancels or an error occurs during Google OAuth, **When** they are redirected back, **Then** an error message is displayed on the sign-in page.

---

### User Story 4 - Password Reset (Priority: P2)

A user who forgot their password requests a reset code via email, enters the code along with a new password, and regains access to their account.

**Why this priority**: Essential for account recovery but not needed for initial access. Blocked users will contact support without this.

**Independent Test**: Can be tested by requesting a reset, receiving a code, entering it with a new password, and signing in with the new password.

**Acceptance Scenarios**:

1. **Given** a user on the password-reset page, **When** they submit their email, **Then** a success message is always shown (regardless of whether the email exists) and a 6-digit code is sent if the account exists.
2. **Given** a user with a valid reset code, **When** they enter the code and a new password (8+ chars), **Then** the password is updated, all existing sessions are invalidated, a new session is created, and they are redirected to the dashboard.
3. **Given** an expired or incorrect reset code, **When** the user submits, **Then** an error is shown with the option to request a new code.
4. **Given** 3 reset requests within an hour for the same email, **When** another request is made, **Then** the request is rate-limited.

---

### User Story 5 - Route Protection & Session Management (Priority: P1)

The platform protects dashboard routes from unauthenticated access and redirects authenticated users away from auth pages. Sessions persist across browser refreshes and expire after 30 days.

**Why this priority**: Foundational infrastructure — without this, the platform has no access control.

**Independent Test**: Can be tested by navigating to a protected route while unauthenticated (expect redirect to sign-in), and navigating to sign-in while authenticated (expect redirect to dashboard).

**Acceptance Scenarios**:

1. **Given** an unauthenticated user, **When** they navigate to any dashboard route (`/home/*`), **Then** they are redirected to the sign-in page.
2. **Given** an authenticated user, **When** they navigate to any auth route (`/auth/*`), **Then** they are redirected to the dashboard.
3. **Given** an authenticated user, **When** they refresh the browser, **Then** their session is preserved and they remain signed in.
4. **Given** a session that has expired (30 days), **When** the user makes any request, **Then** they are redirected to sign-in.
5. **Given** an authenticated user, **When** they click "Sign Out", **Then** their session is destroyed and they are redirected to the sign-in page.

---

### User Story 6 - Profile Name & Language Update (Priority: P2)

A signed-in user updates their first name, last name, or language preference on the profile page.

**Why this priority**: Profile management is expected but not blocking for core product usage.

**Independent Test**: Can be tested by editing the name fields, saving, and confirming the updated name appears in the sidebar and profile page.

**Acceptance Scenarios**:

1. **Given** a user on the profile settings page, **When** they update their first name and/or last name and save, **Then** the changes are persisted and reflected across the interface (sidebar, header).
2. **Given** a user changes their language preference, **When** they save, **Then** the preference is stored (currently only English is supported).

---

### User Story 7 - Email Change (Priority: P3)

A signed-in user changes their account email address through a verified two-step process: provide the new email and current password, then enter a verification code sent to the new email.

**Why this priority**: Less common operation. Users rarely change their email. Important for completeness but not critical path.

**Independent Test**: Can be tested by initiating email change, receiving a code at the new email, entering it, and confirming the profile shows the new email.

**Acceptance Scenarios**:

1. **Given** a user on the profile page, **When** they enter a new email and their current password, **Then** a verification code is sent to the new email address.
2. **Given** a valid verification code for the new email, **When** the user enters it, **Then** the email is updated and the session token is rotated.
3. **Given** the new email is already registered to another account, **When** the user submits, **Then** an error is shown.
4. **Given** an incorrect current password, **When** the user submits, **Then** an error is shown.

---

### User Story 8 - Password Change (Priority: P3)

A signed-in user changes their password by providing their current password and a new one.

**Why this priority**: Security maintenance feature. Less frequent than sign-in/sign-up flows.

**Independent Test**: Can be tested by entering current and new password, saving, and confirming the old password no longer works.

**Acceptance Scenarios**:

1. **Given** a user on the profile page, **When** they enter their current password and a new password (8+ chars), **Then** the password is updated, all other sessions are invalidated, and a confirmation is shown.
2. **Given** an incorrect current password, **When** the user submits, **Then** an error is shown.

---

### User Story 9 - Avatar Upload (Priority: P3)

A signed-in user uploads a profile picture that appears in the sidebar and profile page.

**Why this priority**: Cosmetic feature. Nice to have but not functionally critical.

**Independent Test**: Can be tested by uploading an image, confirming it appears in the sidebar avatar and profile page.

**Acceptance Scenarios**:

1. **Given** a user on the profile page, **When** they upload a valid image (JPG, PNG, or GIF, max 5MB), **Then** the avatar is stored, resized, and displayed across the interface.
2. **Given** an invalid file type or oversized file, **When** the user tries to upload, **Then** an appropriate error message is shown.

---

### User Story 10 - Account Deletion with Grace Period (Priority: P3)

A user deletes their account after re-authentication and email verification. A 30-day grace period allows recovery by signing back in. After 30 days, data is anonymized.

**Why this priority**: Required for compliance and user rights, but infrequently used.

**Independent Test**: Can be tested by initiating deletion, confirming the user is signed out, signing back in within 30 days to cancel, and verifying anonymization occurs after 30 days.

**Acceptance Scenarios**:

1. **Given** a user who confirms account deletion (password + verification code), **When** deletion is confirmed, **Then** a 30-day grace period begins, the user is signed out, and a confirmation email is sent.
2. **Given** a user in the deletion grace period, **When** they sign in, **Then** the deletion is cancelled and the account is restored.
3. **Given** 30 days have elapsed since deletion was requested, **When** the daily cleanup process runs, **Then** the user's personal data is anonymized while financial records (credit events) are retained.

---

### User Story 11 - Data Export (Priority: P3)

A signed-in user exports all their personal data as a downloadable file.

**Why this priority**: Compliance requirement (GDPR). Rarely used but legally necessary.

**Independent Test**: Can be tested by clicking "Export My Data" and confirming a file downloads containing profile, verification history, credit history, and API key metadata.

**Acceptance Scenarios**:

1. **Given** a user on the profile page, **When** they click "Export My Data", **Then** a file is downloaded containing their profile data, verification history, credit history, API key metadata, and webhook configurations.

---

### User Story 12 - Billing Info Form (Priority: P3)

A user updates their billing address details (address, city, country, state, postal code) on the profile Account tab.

**Why this priority**: Needed for invoicing but not blocking core product usage.

**Independent Test**: Can be tested by filling in billing fields, saving, and confirming they persist on page reload.

**Acceptance Scenarios**:

1. **Given** a user on the profile Account tab, **When** they enter or update billing address fields and save, **Then** the billing information is persisted.
2. **Given** an existing billing address, **When** the form loads, **Then** the saved billing data is pre-populated.

---

### User Story 13 - Data Retention Preference (Priority: P3)

A user configures how long their API verification data is retained (7 to 90 days) on the profile Account tab.

**Why this priority**: Privacy control feature. Important for compliance-conscious users but not blocking.

**Independent Test**: Can be tested by changing the retention period, saving, and confirming it persists on reload.

**Acceptance Scenarios**:

1. **Given** a user on the profile Account tab, **When** they select a data retention period (7, 14, 30, 60, or 90 days), **Then** the preference is saved and verification data older than the selected period is eligible for cleanup.

---

### User Story 14 - SSO Connections Display (Priority: P3)

A user views their connected authentication providers (Google status) and sees available future integrations on the profile page.

**Why this priority**: Informational feature. Most value is in showing Google link status.

**Independent Test**: Can be tested by viewing the SSO section and confirming Google shows as "Connected" or "Not connected" based on account state.

**Acceptance Scenarios**:

1. **Given** a user with a linked Google account, **When** they view the SSO section, **Then** Google shows as "Connected".
2. **Given** a user without a linked Google account, **When** they view the SSO section, **Then** a "Link Google Account" option is available.
3. **Given** other integration providers (e.g., ReachInbox), **When** displayed, **Then** they are shown as "Coming Soon" or unavailable until backend integrations exist.

---

### User Story 15 - Profile Billing Tab (Priority: P3)

A user views their credit balance and subscription status on the Billing tab within the profile page.

**Why this priority**: Read-only display that depends on billing infrastructure (Epic 3). Low risk, low effort.

**Independent Test**: Can be tested by navigating to the Billing tab and confirming credits and plan info are displayed.

**Acceptance Scenarios**:

1. **Given** a user on the profile Billing tab, **When** the tab loads, **Then** it displays their current plan name, remaining credits, and subscription status.
2. **Given** a free-tier user with no subscription, **When** the Billing tab loads, **Then** it shows "Free" plan with credit balance and an upgrade prompt.

---

### Edge Cases

- **Concurrent sessions**: A user signed in on multiple devices — signing out on one should not affect others (only sign-out destroys the current session; password change invalidates all others).
- **Network failures during multi-step flows**: If verification code submission fails due to network error, the user can retry without requesting a new code (until the code expires).
- **OAuth popup blocked**: If the browser blocks the Google OAuth redirect, the user is informed to allow popups or redirects.
- **Email delivery failures**: If the verification or reset code email fails to deliver, the user can request a resend.
- **Account recovery during deletion grace period with active subscription**: The subscription billing continues during the grace period; signing back in restores the account without affecting the subscription.
- **Re-authentication timeout**: Sensitive operations (email change, password change, account deletion) require re-authentication if the last authentication was more than 10 minutes ago.
- **Google-only users and sensitive operations**: Users who signed up via Google OAuth (no password) re-authenticate via a fresh Google OAuth prompt. Password change is not applicable to Google-only users.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to create accounts with first name, last name, email, and password (minimum 8 characters).
- **FR-002**: System MUST send a 6-digit verification code via email upon registration, valid for 15 minutes.
- **FR-003**: System MUST verify email addresses before granting full account access.
- **FR-004**: System MUST allocate free starter credits upon successful email verification (new accounts).
- **FR-005**: System MUST support Google OAuth 2.0 sign-up and sign-in with automatic email verification for Google accounts.
- **FR-006**: System MUST link Google accounts to existing email/password accounts when the email matches.
- **FR-007**: System MUST authenticate returning users via email/password with session-based persistence (30-day sessions).
- **FR-008**: System MUST prevent email enumeration — sign-in errors and password reset responses must not reveal whether an email is registered.
- **FR-009**: System MUST enforce rate limits on authentication endpoints: 3 sign-ups/hr per IP, 5 sign-ins/15min per email, 3 password resets/hr per email.
- **FR-010**: System MUST temporarily lock accounts after 5 failed sign-in attempts within 15 minutes. Lock duration: 30 minutes.
- **FR-011**: System MUST support password reset via a 6-digit code sent to the user's email.
- **FR-012**: System MUST invalidate all existing sessions when a password is reset or changed.
- **FR-013**: System MUST protect all dashboard routes from unauthenticated access.
- **FR-014**: System MUST redirect authenticated users away from authentication pages.
- **FR-015**: Users MUST be able to update their first name, last name, and language preference.
- **FR-016**: Users MUST be able to change their email through a verified two-step process (password re-authentication + verification code to new email).
- **FR-017**: Users MUST be able to change their password by providing the current password.
- **FR-018**: Users MUST be able to upload a profile avatar (JPG, PNG, GIF; max 5MB).
- **FR-019**: Users MUST be able to request account deletion with a 30-day recovery grace period.
- **FR-020**: System MUST anonymize user data after the 30-day grace period expires (email, name, avatar removed; financial records retained).
- **FR-021**: Users MUST be able to cancel account deletion by signing in during the grace period.
- **FR-022**: Users MUST be able to export all their personal data as a downloadable file.
- **FR-023**: System MUST require re-authentication (within 10 minutes) for sensitive operations: email change, password change, account deletion. For password-based users, re-authentication is via current password. For Google-only users, re-authentication is via a fresh Google OAuth prompt.
- **FR-024**: Users MUST be able to update billing address information (address, city, country, state, postal code).
- **FR-025**: Users MUST be able to configure API data retention period (7, 14, 30, 60, or 90 days). Default for new accounts: 30 days.
- **FR-026**: Users MUST be able to view their connected authentication providers and their link status.
- **FR-027**: Users MUST be able to view credit balance and subscription status from the profile Billing tab.
- **FR-028**: System MUST rotate session tokens after sensitive operations (email change, password reset).
- **FR-029**: Users MUST accept terms of use during registration.

### Key Entities

- **User**: Represents a platform account holder. Key attributes: name (first, last), email, plan tier, credit balance, avatar, language preference, email verification status, Google link status, deletion request timestamp, creation date.
- **Session**: Represents an active authenticated session. Key attributes: user reference, token (hashed), creation date, expiry date. One user can have multiple sessions across devices.
- **Verification Code**: A time-limited code used for email verification and password reset. Key attributes: user reference, code (hashed), purpose (email verification or password reset), expiry time, attempt count.
- **Credit Event**: Records credit transactions for audit purposes. Key attributes: user reference, type (signup bonus, purchase, usage, refund), amount, balance after, timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete account creation (sign-up through email verification) in under 3 minutes.
- **SC-002**: 95% of sign-in attempts with valid credentials succeed on the first try (no false rejections).
- **SC-003**: Google OAuth sign-up/sign-in completes in under 10 seconds from button click to dashboard.
- **SC-004**: Password reset flow (request code through new password set) completes in under 5 minutes.
- **SC-005**: All protected routes redirect unauthenticated users within 500ms.
- **SC-006**: No authentication endpoint reveals whether a specific email is registered (verified by penetration testing).
- **SC-007**: Account deletion grace period and data anonymization execute correctly 100% of the time (verified by automated tests).
- **SC-008**: Profile updates (name, email, password, avatar) reflect across the entire interface immediately after save.
- **SC-009**: System supports 1,000 concurrent authenticated users without session management degradation.
- **SC-010**: Rate limiting correctly blocks abusive requests while allowing legitimate users to retry after the cooldown period.

## Assumptions

- Email delivery service (Resend) is reliable with delivery rates above 99%.
- Google OAuth client credentials are pre-configured in the environment.
- Only English (`en`) is supported as a language option at MVP.
- Free credit amount for new signups is configured server-side (not specified in this feature — determined by business configuration).
- Avatar storage uses cloud object storage (S3-compatible) with CDN delivery.
- The daily anonymization job for expired deletion requests is a background process managed by the platform's job scheduling infrastructure.
- Billing address fields are free-form text (no address validation service at MVP).
- Data retention preference affects only API verification results, not account data or credit history.
