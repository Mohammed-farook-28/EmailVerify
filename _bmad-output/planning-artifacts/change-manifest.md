# Change Manifest: Epics vs Frontend

**Date:** 2026-01-31
**Based on:** frontend-verification-report.md (100 verified gaps) + 13 decisions

Every item below was verified against actual source code. Items marked **(agent)** were verified by deep-read agents; all others were verified by direct file reads.

---

## Part 1: Changes Required in Epics

These are documentation changes to make the epics accurately describe reality and incorporate the 13 decisions. Done before implementation begins.

### Epic 1: Auth & Profile

**File:** `_bmad-output/planning-artifacts/epics/epic-01-auth-and-profile.md`

| # | What to Change | Why |
|---|---|---|
| 1 | Add to type mismatch table: `User` missing 5 fields (`language`, `emailVerified`, `googleLinked`, `deletionRequestedAt`, `createdAt`) | Table is incomplete — only notes `plan` mismatch |
| 2 | Add to type mismatch table: `User.plan` allows only 3 values, needs expanding to match tiers | Currently undocumented |
| 3 | Add to type mismatch table: `verifyEmailSchema` missing `userId` field | `validations/auth.ts:20-22` |
| 4 | Note in Story 1.9: verify-email page is a **placeholder only** — grey rectangle, no code input, no form, two non-functional buttons | Epic assumes a functional form exists |
| 5 | Note in Story 1.9: password reset is **single-step only** — step 2 (code + new password) has no UI | Epic assumes two-step flow exists |
| 6 | Note in Story 1.9: password reset copy says **"send you a link"** (`password-reset/page.tsx:33`) — contradicts API which sends a code | Frontend copy error |
| 7 | Note in Story 1.9: sign-up submit button text is **"Sign in with Google"** (`sign-up/page.tsx:144`) — copy-paste error | Frontend bug |
| 8 | Note in Story 1.9: all forms use inline `{ required: true }` not `zodResolver(schema)` despite schemas existing and `@hookform/resolvers` being installed | Affects integration approach |
| 9 | Add story for **BillingInfoForm** (`settings/billing-info-form.tsx`) — address, city, country, state, postal code on profile Account tab | Component exists, no story covers it |
| 10 | Add story for **DataRetentionForm** (same file) — API data retention period (7-90 days) on profile Account tab | Component exists, no story covers it |
| 11 | Add story for **Profile Billing tab** — renders `CreditsCard` within profile page | Component exists at `home/profile/page.tsx`, not mentioned in epic |
| 12 | Add story for **SsoConnections ReachInbox option** — "Sign In Using Reachinbox" with "100 Credits Free" badge | Component exists at `settings/sso-connections.tsx:28-46`, not mentioned |

### Epic 2: Verification Engine & Dashboard

**File:** `_bmad-output/planning-artifacts/epics/epic-02-verification-engine.md`

| # | What to Change | Why |
|---|---|---|
| 1 | **Remove Story 2.7** (Dashboard Metrics & Charts) entirely | Decision #6: no dashboard page, keep `/home` as redirect to `/home/quick-verify` |
| 2 | Update any cross-references to Story 2.7 in other stories | Dependency cleanup |
| 3 | Add to type mismatch table: `VerificationResult` missing `deliverable` (boolean) and `verifiedAt` (ISO 8601) | `types/index.ts:13-25` |
| 4 | Add to type mismatch table: `VerificationResult` has extra fields `fullName`, `gender`, `state` — not in API | `types/index.ts:18-20` |
| 5 | Add to type mismatch table: `EmailAttribute` shape is completely different — frontend has `{ name: "Free", value: "Yes", score: ".95X", checked: true }`, API has `is_free: boolean` | `types/index.ts:27-32`, `mock.ts:37-56` |
| 6 | Update API contract: status values must use `valid/invalid` + `disposable`, `catch_all`, `role` consistently | Decision #1 |
| 7 | Update API contract: score range must say 0-100 explicitly | Decision #2 |
| 8 | Add story for **CookiePolicyModal** (`modals/cookie-policy-modal.tsx`) — renders on quick-verify page load | Component exists, no story covers it |

### Epic 3: Billing & Credits

**File:** `_bmad-output/planning-artifacts/epics/epic-03-billing.md`

| # | What to Change | Why |
|---|---|---|
| 1 | Update API contract: change `"yearly"` to `"annual"` everywhere | Decision #4: billing cycle term is `annual` |
| 2 | Update API contract: use `payment_customer_id` not `stripe_customer_id` | Decision #5: abstract payment provider |
| 3 | Update API contract: use `payment_session_id` not `stripe_session_id` | Decision #5 |
| 4 | Note in Story 3.5: `PriceSummary` component is entirely static — all prices hardcoded **(agent)** | Epic assumes dynamic pricing component |
| 5 | Note in Story 3.5: `PaymentSuccessModal` exists but is **never rendered** on any billing page **(agent)** | Epic assumes modal is wired |
| 6 | Note in Story 3.5: `PaymentFailedModal` retry button has **no onClick handler** **(agent)** | Epic assumes retry works |
| 7 | Add to type mismatch table: `PricingPlan` has single `price` (dollars) — API needs `monthlyPrice` + `annualPrice` (cents) | `types/index.ts:102-110` |
| 8 | Add to type mismatch table: `CreditHistoryEntry` missing `type` and `reference` fields; uses `reason`/`change` instead of `description`/`amount` | `types/index.ts:137-143` |
| 9 | Note: two conflicting pricing plan sets exist in frontend — `mock.ts` (3 plans) vs `plans/page.tsx` inline (3 different plans) **(agent)** | Developers need to know which to replace |

### Epic 4: Bulk Verification

**File:** `_bmad-output/planning-artifacts/epics/epic-04-bulk-verification.md`

| # | What to Change | Why |
|---|---|---|
| 1 | Update API contract: status values must use `valid/invalid` not `deliverable/undeliverable` | Decision #1 |
| 2 | Note in frontend stories: frontend has a **6-step modal flow** (AddEmails → CsvUpload → CsvMapping → CsvValidation → NameList → close), not the 2-step API flow the epic describes | `bulk-verify/page.tsx` (agent verified) |
| 3 | Note in frontend stories: `CsvUploadModal.onFileUploaded` receives **filename string only** — discards actual `File` object | `csv-upload-modal.tsx:27` (agent verified) |
| 4 | Note in frontend stories: `CsvColumnMapping` dropdown is **purely decorative** — no column selection state | `csv-column-mapping.tsx:103-108` (agent verified) |
| 5 | Note in frontend stories: `CreditsWarningBanner` is **always rendered** unconditionally, not on 402 error | `bulk-verify/page.tsx:139` (agent verified) |
| 6 | Note in frontend stories: history page search input has **no onChange handler** — non-functional **(agent)** | Developer needs to know |
| 7 | Note in frontend stories: history page uses **inline mock data** with different shape than `BulkList` type **(agent)** | Two conflicting data shapes |
| 8 | Add to type mismatch table: `BulkList.name` should be `fileName`; missing `resultsExpired`, `errorReason`; missing `"pending"` status | `types/index.ts:39-47` |
| 9 | Add story for **AddEmailsModal** — chooser between Upload CSV / Enter Manually | Component exists at `bulk-verify/add-emails-modal.tsx` |
| 10 | Add story for **CsvValidationResults** — pre-verification email validation step | Component exists at `bulk-verify/csv-validation-results.tsx` |
| 11 | Add story for **NameListModal** — name your list before verification starts | Component exists at `bulk-verify/name-list-modal.tsx` |
| 12 | Add story for **ResultsSettingsTab** — rename list + delete list | Component exists at `bulk-verify/results-settings-tab.tsx` |
| 13 | Add story for **RenameListModal** | Component exists at `bulk-verify/rename-list-modal.tsx` |
| 14 | Add story for **NoSearchResults** — empty state for search | Component exists at `bulk-verify/no-search-results.tsx` |
| 15 | Add story for **export-to-integration flow** — ExportWhereToModal, ExportAddToModal (Instantly, Reply, Smartlead destinations) | 3 components exist in `export/` |

### Epic 5: API Keys & Webhooks

**File:** `_bmad-output/planning-artifacts/epics/epic-05-api-and-webhooks.md`

| # | What to Change | Why |
|---|---|---|
| 1 | **Rewrite Story 5.8**: change from "verification usage history" to **credit history** at route `/home/credit-history` | Decision #7: `/home/usage` is credit history, Decision #13: rename to `/home/credit-history` |
| 2 | Update Story 5.8 columns: Transaction Date, Reason, Change, Balance (matching actual frontend) | `usage/page.tsx:57-69` |
| 3 | Update API key prefix from `ev_` to `ek_` (`ek_live_`, `ek_test_`) everywhere | Decision #3 |
| 4 | Note in Story 5.7: API key table currently shows columns **Name, Key, Type, Security** — needs changing to name, masked key, status, createdAt, lastUsed, expiresAt | `api-keys-table.tsx:33-45` |
| 5 | Note in Story 5.7: New API Key form currently has fields **name, security, ipAddresses, keyType** — needs changing to name + expiresIn | `new-api-key-form.tsx:12-15` |
| 6 | Note in Story 5.7: "Manage" button has **no onClick handler** | `api-keys-table.tsx:88-92` |
| 7 | Add to type mismatch table: `ApiKey` missing `expiresAt`; has extra `type`, `security`; `status` uses `"inactive"` not `"expired"`; `key` is raw string not `maskedKey` with `ek_` prefix | `types/index.ts:57-68` |
| 8 | Add or explicitly exclude: **webhook management frontend story** — backend has CRUD endpoints but zero webhook UI exists | No webhook components in frontend |

### Epic 6: Active Verification (Deliverability)

**File:** `_bmad-output/planning-artifacts/epics/epic-06-active-verification.md`

| # | What to Change | Why |
|---|---|---|
| 1 | **Remove all ReachInbox-specific references** — make integration source generic/pluggable | Decision #11 |
| 2 | Change feature label from "Active Verification" to **"Deliverability"** in navigation references | Decision #12 |
| 3 | Update auth method: remove email/password and API key specifics — document as "auth method depends on integration source, TBD per provider" | Decision #11 |
| 4 | Note: frontend assumes **multiple integrations** (3 mock items, "New Active Verification" button) but epic says single connection (MVP) — clarify which model | `mock.ts:398-427` |
| 5 | Note: detail page lives on **sub-route `[integrationId]`** with 5 tabs (Overview, Email, Cleanup, Settings, Schedule) — epic doesn't describe this route | `active-verification/[integrationId]/page.tsx` (agent verified) |
| 6 | Note: email tab columns are **Email, Reason, Score, State** — need changing to email, status, lastVerified, listSource **(agent)** | Different from API contract |
| 7 | Note: schedule tab is **"coming soon" placeholder** — no UI built **(agent)** | Epic assumes functional UI |
| 8 | Note: overview uses **custom SVG donut chart**, not Recharts **(agent)** | Implementation detail for developers |
| 9 | Update API contract: status values must use `valid/invalid` not `deliverable/undeliverable` | Decision #1 |
| 10 | Add to type mismatch table: `Integration.status` uses `"active"/"paused"` not `"connected"/"error"`; `emailsVerified` should be `totalEmails` | `types/index.ts:93-100` |
| 11 | Add to type mismatch table: `ActiveVerificationItem.segments` shape (`{color, value}[]`) differs from API `distribution` object | `types/index.ts:120-128` |
| 12 | Add story for **export-to-integration flow** components (if not already covered by Epic 4 stories) | 5 components in `export/` |
| 13 | Add story for **category breakdown cards** — Invalid/Risky/Unknown sub-categories on detail page **(agent)** | Component exists, no API equivalent |

### Epic 7: Landing & Public

**File:** `_bmad-output/planning-artifacts/epics/epic-07-landing-and-public.md`

| # | What to Change | Why |
|---|---|---|
| 1 | Fix description: landing page is a **28-line placeholder** (title + two links), NOT "already built with mock data" | `app/page.tsx:1-28` |
| 2 | Update brand name to **EmailKit** in all references | Decision #9 |
| 3 | Note: no hero section, no feature grid, no pricing table, no integration logos, no footer exist — all must be built from scratch | `app/page.tsx` entire file |
| 4 | Note: no "Get Started" CTA exists — only "Sign In" and "Dashboard" links | `app/page.tsx:12-23` |
| 5 | Note: error pages link to `/support` which **does not exist** as a route **(agent)** | Dead link |
| 6 | Note: VPN page copy is vague — "Please Close to use application" **(agent)** | Needs better copy |

### Epics Index

**File:** `_bmad-output/planning-artifacts/epics.md`

| # | What to Change | Why |
|---|---|---|
| 1 | Update story count after adding ~15 new stories and removing Story 2.7 | Count changes |
| 2 | Add "Decisions Record" section with all 13 decisions | Central reference |
| 3 | Update "Architecture Updates Required" table with new decisions (key prefix `ek_`, payment abstraction, `annual`, status enum, score range) | 8 existing items + new decisions |

---

## Part 2: Changes Required in Frontend

These are code changes that happen during implementation when developers execute the stories. Listed by file.

### Infrastructure (built once, used by all stories)

| # | File to Create/Modify | Change | Relevant Story |
|---|---|---|---|
| 1 | `src/app/layout.tsx` | Wrap `{children}` with `QueryClientProvider`, mount `<Toaster />` from sonner | Story 1.8 |
| 2 | **Create** `src/middleware.ts` | Auth route guards, VPN detection, session cookie validation | Story 1.8 |
| 3 | **Create** auth context/provider | Session state, `useAuth()` hook, sign-out, auth redirects | Story 1.8 |
| 4 | **Create** `src/lib/api.ts` (or similar) | Base fetch wrapper with auth headers, error interceptor, 401 redirect | Story 1.8 |
| 5 | `src/app/(dashboard)/layout.tsx` | Wrap with auth provider, conditional rendering based on auth state | Story 1.8 |

### Type Definitions

| # | File | Change | Current → Target |
|---|---|---|---|
| 6 | `src/lib/types/index.ts` | `User.plan` — expand enum | `"Basic" \| "Pro" \| "Enterprise"` → all tier names |
| 7 | `src/lib/types/index.ts` | `User` — add 5 fields | Add `language`, `emailVerified`, `googleLinked`, `deletionRequestedAt`, `createdAt` |
| 8 | `src/lib/types/index.ts` | `VerificationResult` — remove 3 fields | Remove `fullName`, `gender`, `state` |
| 9 | `src/lib/types/index.ts` | `VerificationResult` — add 2 fields | Add `deliverable: boolean`, `verifiedAt: string` |
| 10 | `src/lib/types/index.ts` | `EmailAttribute` — restructure | `{ name, value, score, checked }` → `is_free: boolean`, `is_role: boolean`, etc. |
| 11 | `src/lib/types/index.ts` | `BulkList.name` → `fileName` | Rename field |
| 12 | `src/lib/types/index.ts` | `BulkList.status` — add `"pending"` | `"processing" \| "completed" \| "failed"` → add `"pending"` |
| 13 | `src/lib/types/index.ts` | `BulkList` — add 2 fields | Add `resultsExpired: boolean`, `errorReason: string \| null` |
| 14 | `src/lib/types/index.ts` | `ApiKey` — remove `type`, `security` | Extra fields not in API |
| 15 | `src/lib/types/index.ts` | `ApiKey` — add `maskedKey`, `expiresAt` | Replace `key` with `maskedKey` (with `ek_` prefix) |
| 16 | `src/lib/types/index.ts` | `ApiKey.status` | `"inactive"` → `"expired"` |
| 17 | `src/lib/types/index.ts` | `Integration.status` | `"active" \| "paused"` → `"connected" \| "error"` (keep `"disconnected"`) |
| 18 | `src/lib/types/index.ts` | `Integration.emailsVerified` → `totalEmails` | Rename field |
| 19 | `src/lib/types/index.ts` | `PricingPlan` — restructure price | Single `price` → `monthlyPrice` + `annualPrice` (in cents) |
| 20 | `src/lib/types/index.ts` | `PricingPlan.period` | `"yearly"` → `"annual"` |
| 21 | `src/lib/types/index.ts` | `CreditHistoryEntry` — add 2 fields, rename 2 | Add `type`, `reference`; rename `reason` → `description`, `change` → `amount` |
| 22 | `src/lib/types/index.ts` | `ActiveVerificationItem.segments` — restructure | `{ color, value }[]` → `{ deliverable, risky, undeliverable, unknown }` |
| 23 | `src/lib/types/index.ts` | `ActiveVerificationItem.status` — rethink | `"completed" \| "in_progress"` → align with API aggregate model |

### Status & Score System

| # | File | Change |
|---|---|---|
| 24 | `src/lib/constants/status-colors.ts` | Replace `deliverable` → `valid`, `undeliverable` → `invalid`; add `disposable`, `catch_all`, `role`; remove `verifying`, `completed` |
| 25 | `src/components/dashboard/score-progress-bar.tsx:17,23` | Change range from 0-10 to 0-100 (`score / 100` instead of `score / 10`) |
| 26 | `src/components/dashboard/verification-row.tsx:6-11` | Update `avatarGradients` keys from `deliverable/undeliverable` to `valid/invalid` |
| 27 | All components using `StatusBadge` or `statusConfig` | Update to use new status values |

### Auth Pages

| # | File:Line | Change |
|---|---|---|
| 28 | `src/app/(auth)/auth/sign-in/page.tsx:17-18` | Replace `console.log` with `POST /auth/sign-in` API call |
| 29 | `src/app/(auth)/auth/sign-in/page.tsx:34-50` | Add `onClick` handler to Google OAuth button → redirect to `GET /auth/google` |
| 30 | `src/app/(auth)/auth/sign-up/page.tsx:17-18` | Replace `console.log` with `POST /auth/sign-up` API call |
| 31 | `src/app/(auth)/auth/sign-up/page.tsx:144` | Fix text: `"Sign in with Google"` → `"Sign Up"` |
| 32 | `src/app/(auth)/auth/sign-up/page.tsx:34-48` | Add `onClick` handler to Google OAuth button |
| 33 | `src/app/(auth)/auth/password-reset/page.tsx:16-17` | Replace `console.log` with `POST /auth/password-reset` API call |
| 34 | `src/app/(auth)/auth/password-reset/page.tsx:33` | Fix copy: `"send you a link"` → `"send you a code"` |
| 35 | `src/app/(auth)/auth/password-reset/page.tsx` | Build **step 2**: code input + new password form + `POST /auth/password-reset/verify` |
| 36 | `src/app/(auth)/auth/verify-email/page.tsx:19` | Replace grey placeholder rectangle with **6-digit code input** form |
| 37 | `src/app/(auth)/auth/verify-email/page.tsx:22-30` | Wire "Change E-mail Address" button |
| 38 | `src/app/(auth)/auth/verify-email/page.tsx:33-41` | Wire "Resend Verification E-mail" button to API |
| 39 | **Create** `src/app/(auth)/auth/callback/page.tsx` | OAuth callback page — handle redirect from Google |
| 40 | `src/lib/validations/auth.ts:20-22` | Add `userId` field to `verifyEmailSchema` |
| 41 | **Create** password reset step 2 schema | `{ email, code, newPassword }` |
| 42 | All auth pages | Connect Zod schemas via `zodResolver` instead of inline `{ required: true }` |

### Profile Page

| # | File | Change |
|---|---|---|
| 43 | `src/app/(dashboard)/home/profile/page.tsx` | Wire profile form to `PUT /home/profile/name` |
| 44 | `src/components/settings/profile-form.tsx` | Replace `mockUser` imports with auth context data |
| 45 | `src/components/settings/sso-connections.tsx` | Wire Google connection status to `user.googleLinked` from API |
| 46 | `src/components/layout/sidebar-user-card.tsx` | Replace `mockUser` import with auth context |
| 47 | `src/components/layout/sidebar.tsx` | Replace `mockUser` import with auth context |
| 48 | Profile page | **Build** password change form (`PUT /home/profile/password`) |
| 49 | Profile page | **Build** avatar upload (`POST /home/profile/avatar`) |
| 50 | Profile page | **Build** "Export My Data" button (`GET /home/profile/export`) |
| 51 | Profile page | **Build** sign-out functionality (`POST /auth/sign-out`) |
| 52 | `src/components/modals/delete-account-modal.tsx` | Add password input + verification code input fields; wire to `DELETE /home/profile` |

### Dashboard / Quick Verify

| # | File | Change |
|---|---|---|
| 53 | `src/app/(dashboard)/home/quick-verify/page.tsx` | Replace `console.log` + mock data with `POST /home/quick-verify` API call |
| 54 | `src/components/dashboard/score-progress-bar.tsx` | Update score display for 0-100 range |
| 55 | `src/components/dashboard/email-detail-panel.tsx` | Update attribute rendering for new `is_*` boolean shape |
| 56 | `src/lib/data/mock.ts:25-132` | Update mock scores from 0-10 to 0-100; update attribute names to `is_*` format (or remove mocks once API is wired) |

### Billing

| # | File | Change |
|---|---|---|
| 57 | `src/app/(dashboard)/home/billing/page.tsx:93-96` | Wire cancel flow to `POST /home/billing/subscription/cancel` |
| 58 | `src/components/billing/credits-card.tsx` | Add props for subscription data (plan name, credits, period, status) |
| 59 | `src/components/billing/price-summary.tsx` | Replace hardcoded prices with dynamic props **(agent)** |
| 60 | `src/components/billing/package-grid.tsx` | Replace 9 hardcoded `5000` entries with real package data **(agent)** |
| 61 | `src/components/modals/payment-success-modal.tsx` | Add dynamic props (amount, plan, transaction ID); render it on billing page **(agent)** |
| 62 | `src/components/modals/payment-failed-modal.tsx` | Add `onClick` to retry button **(agent)** |
| 63 | `src/app/(dashboard)/home/billing/plans/page.tsx` | Replace inline 3-plan array with API data; add billing cycle toggle **(agent)** |
| 64 | `src/components/billing/pricing-plan-card.tsx` | Update props to match `PricingPlan` type (monthlyPrice, annualPrice, credits) **(agent)** |

### Credit History (renamed from Usage)

| # | File | Change |
|---|---|---|
| 65 | **Rename** `src/app/(dashboard)/home/usage/` → `src/app/(dashboard)/home/credit-history/` | Decision #13 |
| 66 | `credit-history/page.tsx:59` | Fix typo: `"Transaction Dae"` → `"Transaction Date"` |
| 67 | `credit-history/page.tsx` | Replace `mockCreditHistory` with API call to `GET /home/billing/transactions` |
| 68 | `src/components/credit-history/change-badge.tsx` | Add type-based coloring (not just positive/negative sign) |

### Bulk Verification

| # | File | Change |
|---|---|---|
| 69 | **Rename** `src/app/(dashboard)/home/bulk-verify/[listId]/` → `[jobId]/` | Decision #10 |
| 70 | `[jobId]/page.tsx` | Add `useParams()` to read `jobId` route parameter |
| 71 | `[jobId]/page.tsx` | Add `EventSource` for SSE progress updates |
| 72 | `src/components/bulk-verify/csv-upload-modal.tsx:27` | Capture actual `File` object, not just filename string |
| 73 | `src/components/bulk-verify/csv-column-mapping.tsx:103-108` | Add real column selection state and `emailColumn` capture |
| 74 | `src/components/bulk-verify/credits-warning-banner.tsx` | Make rendering conditional on 402 error, add billing link handler |
| 75 | `src/app/(dashboard)/home/history/page.tsx` | Replace inline mock with API call; add pagination, status filter, working search **(agent)** |

### API Keys

| # | File | Change |
|---|---|---|
| 76 | `src/components/api/api-keys-table.tsx:33-45` | Change columns: Name, Key, Type, Security → Name, Masked Key, Status, Created, Last Used, Expires |
| 77 | `src/components/api/api-keys-table.tsx:62-64` | Show `maskedKey` (with `ek_` prefix) instead of raw `key` |
| 78 | `src/components/api/api-keys-table.tsx:88-92` | Wire "Manage" button or replace with delete button + confirmation |
| 79 | `src/components/api/new-api-key-form.tsx:12-15` | Remove `security`, `ipAddresses`, `keyType` fields; add `expiresIn` selector |
| 80 | `src/components/api/new-api-key-form.tsx` | After save: show full key in modal with copy button + "never shown again" warning |
| 81 | `src/components/api/api-usage-chart.tsx:70` | Fix label: "Warmup emails sent" → appropriate label **(agent)** |
| 82 | `src/components/api/api-usage-chart.tsx:29-58` | Wire filter dropdowns (currently non-functional) **(agent)** |
| 83 | `src/components/api/api-stats-row.tsx:9-15` | Replace hardcoded `120` values with API data **(agent)** |

### Active Verification (Deliverability)

| # | File | Change |
|---|---|---|
| 84 | `src/components/active-verification/reachinbox-login-modal.tsx:17-18` | Replace email/password with generic integration auth (per provider) |
| 85 | `src/components/active-verification/reachinbox-login-modal.tsx:17-18` | Remove hardcoded default values (`"aman@outbox.vc"`, `"password123456"`) |
| 86 | `src/components/active-verification/connect-source-modal.tsx` | Make generic — currently shows 8 hardcoded sources |
| 87 | Active verification detail page email tab **(agent)** | Change columns: Reason, Score, State → status, lastVerified, listSource |
| 88 | Active verification detail page filter buttons **(agent)** | Wire `activeFilter` state to actually filter the email list |

### Landing Page

| # | File | Change |
|---|---|---|
| 89 | `src/app/page.tsx` | **Build from scratch**: hero section, feature grid, pricing table, integration logos, footer, "Get Started" CTA |
| 90 | `src/app/page.tsx:8` | Change "VerifyInbox" → "EmailKit" |
| 91 | `src/app/layout.tsx:24` | Change metadata title: "VerifyInbox" → "EmailKit" |
| 92 | `src/components/layout/logo.tsx` | Update brand name to "EmailKit" consistently |

### Error Pages

| # | File | Change |
|---|---|---|
| 93 | `src/app/not-found.tsx` | Fix `/support` link — either create route or change to email **(agent)** |
| 94 | `src/app/error.tsx` | Same `/support` link fix **(agent)** |
| 95 | `src/app/vpn-detected/page.tsx` | Improve copy: explain why VPN is restricted, add disable instructions **(agent)** |

### Navigation

| # | File | Change |
|---|---|---|
| 96 | `src/lib/constants/navigation.ts` | Update `/home/usage` → `/home/credit-history`; verify "Deliverability" label for active verification; update any "Usage" → "Credit History" labels |
| 97 | `src/components/layout/header.tsx` | Update breadcrumb mapping for renamed routes |

---

## Part 3: Changes Required in Other Docs

| # | File | Change |
|---|---|---|
| 1 | `CLAUDE.md` | API key prefix: `sk_` → `ek_` (`ek_live_`, `ek_test_`) |
| 2 | `CLAUDE.md` | Brand references → EmailKit |
| 3 | `CLAUDE.md` | Route table: remove dashboard description from `/home`, rename `/home/usage` → `/home/credit-history` |
| 4 | `docs/architecture.md` | 8 discrepancies from previous session (users.name split, deletion_requested_at, payment_customer_id, bulk_jobs columns, integrations tables, OAuth callback, rate limit tiers, remove /api/v1/usage) |
| 5 | `docs/architecture.md` | API key prefix → `ek_` |
| 6 | `docs/architecture.md` | Status enum → `valid/invalid` + 5 more |
| 7 | `docs/architecture.md` | Score range → 0-100 |
| 8 | `docs/architecture.md` | Billing cycle → `annual` |
| 9 | `docs/architecture.md` | Payment provider → abstract |
| 10 | `docs/architecture.md` | No dashboard page (keep redirect) |
| 11 | `docs/architecture.md` | Integration → generic (no ReachInbox-specific) |
| 12 | `_bmad-output/planning-artifacts/prd.md` | Note: dashboard page removed from MVP |
| 13 | `_bmad-output/planning-artifacts/prd.md` | Note: ReachInbox integration skipped — generic/pluggable |

---

## Summary Counts

| Target | Items |
|---|---|
| **Epic changes** (before implementation) | ~65 items across 7 epics + index |
| **Frontend changes** (during implementation) | 97 items across ~40 files |
| **Other doc changes** | 13 items across 3 files |
| **Total** | **~175 action items** |

Of the 97 frontend items:
- ~5 are infrastructure (create once)
- ~18 are type definition updates (one file)
- ~4 are status/score system updates
- ~70 are per-component wiring, bug fixes, and feature builds
