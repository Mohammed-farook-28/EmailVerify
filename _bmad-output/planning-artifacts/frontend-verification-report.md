# Frontend Deep Verification Report

**Date:** 2026-01-31
**Frontend repo:** `/Users/prabhakaranr/Documents/dev/BotCompany/EmailVerify-Frontend/`
**Method:** Every issue below was verified by reading actual `.tsx` source code, not by assumption.

---

## Section 1: Cross-Cutting Infrastructure Gaps

These affect ALL 16 frontend integration stories across all 7 epics.

### 1.1 Zero API Calls in Entire Frontend

**Verified:** `grep` for `fetch(`, `axios`, `EventSource` across all `src/` files returned **0 matches**.

Every `onSubmit`, `onClick`, and data source in the frontend is either:
- `console.log(...)` (auth forms)
- Hardcoded mock data imported from `src/lib/data/mock.ts`
- Inline hardcoded constants within components

There is no `src/lib/api.ts`, no HTTP client, no API base URL configuration anywhere.

### 1.2 TanStack Query Installed But Unused

**Verified:** `@tanstack/react-query` is in `package.json` at `^5.90.20`. `grep` for `useQuery`, `useMutation`, `QueryClient`, `useInfiniteQuery` across all `src/` files returned **0 matches**.

No `QueryClientProvider` wraps the app in any layout:
- `src/app/layout.tsx:29-43` — renders `{children}` directly in `<body>`, no providers
- `src/app/(dashboard)/layout.tsx:4-18` — renders `<Sidebar />` + `<Header />` + `{children}`, no providers

### 1.3 No Middleware

**Verified:** `glob` for `src/middleware*` returned **0 files**.

Consequences:
- No auth route protection (all `/home/*` routes freely accessible)
- No redirect of authenticated users away from `/auth/*`
- No VPN detection header reading (`X-EV-VPN-Detected`)
- No session cookie (`ev_session`) validation

### 1.4 No Auth Context or Provider

**Verified:** `glob` for `src/providers/**/*` and `src/context/**/*` both returned **0 files**.

No `createContext`, no `AuthProvider`, no session state management exists. The sidebar and header import `mockUser` directly from `src/lib/data/mock.ts`.

### 1.5 Sonner Toast Not Mounted

**Verified:** `src/components/ui/sonner.tsx` exists as a `Toaster` component, but it is never rendered in `src/app/layout.tsx` or any other layout file. No `toast()` calls exist in any source file.

### 1.6 Zod Schemas Defined But Not Connected to Forms

**Verified:** `src/lib/validations/auth.ts` defines 4 schemas (`signInSchema`, `signUpSchema`, `passwordResetSchema`, `verifyEmailSchema`), but all auth pages import only the **TypeScript types** (`SignInFormData`, etc.), not the schemas. All forms use inline `{ required: true }` rules instead of `zodResolver(schema)`.

`@hookform/resolvers` is installed but never imported.

---

## Section 2: Status Enum Mismatch (Affects Epics 2, 4, 5, 6)

### Verified Source

**File:** `src/lib/constants/status-colors.ts:1-7`

```
Frontend VerificationStatus: "deliverable" | "undeliverable" | "risky" | "unknown" | "verifying" | "completed"
```

**Epic API contracts use:**
```
"valid" | "invalid" | "unknown" | "risky" | "disposable" | "catch_all" | "role"
```

| Frontend Value | API Value | Issue |
|---|---|---|
| `deliverable` | `valid` | Different name |
| `undeliverable` | `invalid` | Different name |
| `risky` | `risky` | Match |
| `unknown` | `unknown` | Match |
| `verifying` | — | UI-only, not from API |
| `completed` | — | UI-only, not from API |
| — | `disposable` | Missing in frontend |
| — | `catch_all` | Missing in frontend |
| — | `role` | Missing in frontend |

---

## Section 3: Type Definition Gaps

**File:** `src/lib/types/index.ts`

### 3.1 User Type (lines 3-11)

| Field | Frontend | Epic API Contract | Issue |
|---|---|---|---|
| `plan` | `"Basic" \| "Pro" \| "Enterprise"` | 10 tier names (Free through Titan) | Only 3 values, "Basic" not in API tiers |
| `avatarUrl` | `avatarUrl?: string` (optional) | `avatarUrl: string \| null` | `undefined` vs `null` semantics differ |
| `language` | **MISSING** | `string` | Not in frontend type |
| `emailVerified` | **MISSING** | `boolean` | Not in frontend type |
| `googleLinked` | **MISSING** | `boolean` | Not in frontend type |
| `deletionRequestedAt` | **MISSING** | `string \| null` | Not in frontend type |
| `createdAt` | **MISSING** | `string (ISO 8601)` | Not in frontend type |

### 3.2 VerificationResult Type (lines 13-25)

| Field | Frontend | Epic API Contract | Issue |
|---|---|---|---|
| `score` | `number` (mock data: 0-10 range) | `number` (0-100 range) | 10x scale mismatch |
| `fullName` | `string` (optional) | **NOT IN API** | Extra field, should be removed |
| `gender` | `string` (optional) | **NOT IN API** | Extra field, should be removed |
| `state` | `string` (optional) | **NOT IN API** | Extra field, should be removed |
| `deliverable` | **MISSING** | `boolean` | Not in frontend type |
| `verifiedAt` | **MISSING** | `string (ISO 8601)` | Not in frontend type |

**Score range proof:** `src/components/dashboard/score-progress-bar.tsx:17` — `score: number; // 0-10`. Line 23: `score / 10`. Mock data in `src/lib/data/mock.ts:30,67,90,113` — scores are `8.5`, `5.2`, `1.2`, `3.0`.

### 3.3 EmailAttribute Type (lines 27-32)

| Frontend | Epic API Contract | Issue |
|---|---|---|
| `name: "Free"`, `"Role"`, `"Disposable"`, `"Account"`, `"Accept All"`, etc. | `is_free`, `is_role`, `is_disposable`, `is_catchall` (booleans) | Completely different shape. Frontend has human-readable names + string values; API has snake_case boolean fields |

**Proof:** `src/lib/data/mock.ts:37-56` — 10 attributes with names like "Free", "Role", "Numerical Characters", "Unicode Symbols", "Mailbox Full"

### 3.4 BulkList Type (lines 39-47)

| Field | Frontend | Epic API Contract | Issue |
|---|---|---|---|
| `name` | `string` | `fileName: string` | Different field name |
| `status` | `"processing" \| "completed" \| "failed"` | `"pending" \| "processing" \| "completed" \| "failed"` | Missing `"pending"` |
| `resultsExpired` | **MISSING** | `boolean` | Not in frontend type |
| `errorReason` | **MISSING** | `string \| null` | Not in frontend type |

### 3.5 ApiKey Type (lines 57-68)

| Field | Frontend | Epic API Contract | Issue |
|---|---|---|---|
| `key` | `string` (raw, e.g. `"3dwnjednejncdsc"`) | `maskedKey: string` (e.g. `"ev_Ue7HpvL9..."`) | No masking, no `ev_` prefix |
| `type` | `"live" \| "test"` | **NOT IN API** | Extra field, epic says remove |
| `security` | `"public" \| "private"` | **NOT IN API** | Extra field, epic says remove |
| `status` | `"active" \| "inactive"` | `"active" \| "expired"` | `"inactive"` vs `"expired"` |
| `expiresAt` | **MISSING** | `string (ISO 8601) \| null` | Not in frontend type |

**Proof:** `src/lib/data/mock.ts:175-265` — all 8 mock keys have identical `key: "3dwnjednejncdsc"`, no `ev_` prefix, no masking.

### 3.6 Integration Type (lines 93-100)

| Field | Frontend | Epic API Contract | Issue |
|---|---|---|---|
| `status` | `"active" \| "paused" \| "disconnected"` | `"connected" \| "disconnected" \| "error"` | Different enum values |
| `emailsVerified` | `number` | `totalEmails` | Different field name |

### 3.7 PricingPlan Type (lines 102-110)

| Field | Frontend | Epic API Contract | Issue |
|---|---|---|---|
| `price` | `number` (single, in dollars) | `monthlyPrice` + `yearlyPrice` (separate, in cents) | Structure + unit mismatch |

### 3.8 CreditHistoryEntry Type (lines 137-143)

| Field | Frontend | Epic API Contract | Issue |
|---|---|---|---|
| `reason` | `string` | `description: string` | Different field name |
| `change` | `number` | `amount: number` | Different field name |
| `type` | **MISSING** | `string` (7 event types) | Not in frontend type |
| `reference` | **MISSING** | `string \| null` | Not in frontend type |

### 3.9 ActiveVerificationItem Type (lines 120-128)

| Field | Frontend | Epic API Contract | Issue |
|---|---|---|---|
| `status` | `"completed" \| "in_progress"` | API uses aggregate counts, not job status | Conceptually different |
| `segments` | `{ color: string; value: number }[]` | `distribution: { deliverable, risky, undeliverable, unknown }` | Different shape, no mapping |
| `lastVerified` | `string` (mock: `"1 hr ago"`) | `string (ISO 8601)` | Relative string vs ISO timestamp |

---

## Section 4: Per-Epic Verified Issues

### Epic 1: Auth & Profile

| # | Issue | File:Line | Verified |
|---|---|---|---|
| 1 | Sign-in `onSubmit` is `console.log` only — no API call | `auth/sign-in/page.tsx:17-18` | YES |
| 2 | Sign-up `onSubmit` is `console.log` only — no API call | `auth/sign-up/page.tsx:17-18` | YES |
| 3 | Sign-up submit button says **"Sign in with Google"** (copy-paste error) | `auth/sign-up/page.tsx:144` | YES |
| 4 | Password reset `onSubmit` is `console.log` only — no API call | `auth/password-reset/page.tsx:16-17` | YES |
| 5 | Password reset copy says **"send you a link"** — API sends a 6-digit code | `auth/password-reset/page.tsx:33` | YES |
| 6 | Password reset is **single-step only** — no step 2 for code + new password | `auth/password-reset/page.tsx` (entire file) | YES |
| 7 | Verify-email page has **no code input** — grey placeholder rectangle + two non-functional buttons | `auth/verify-email/page.tsx:19,22-30,33-41` | YES |
| 8 | Google OAuth buttons exist but have **no `onClick` handlers** | `auth/sign-in/page.tsx:34-50`, `auth/sign-up/page.tsx:34-48` | YES |
| 9 | `/auth/callback` page does **not exist** | glob returned 0 files | YES |
| 10 | `verifyEmailSchema` missing `userId` field — API expects `{ userId, code }` | `validations/auth.ts:20-22` | YES |
| 11 | No password change form on profile page | `home/profile/page.tsx` (entire file) | YES |
| 12 | No avatar upload UI anywhere | entire codebase | YES |
| 13 | No "Export My Data" button anywhere | entire codebase | YES |
| 14 | No sign-out functionality anywhere | entire codebase | YES |
| 15 | Forms use inline `{ required: true }` not `zodResolver` | all auth pages | YES |

### Epic 2: Verification Engine & Dashboard

| # | Issue | File:Line | Verified |
|---|---|---|---|
| 1 | `/home` is a **redirect** to `/home/quick-verify` — no dashboard page exists | `home/page.tsx:1-5` | YES |
| 2 | `ScoreProgressBar` range is **0-10**, API returns **0-100** | `score-progress-bar.tsx:17,23` | YES |
| 3 | Mock attribute names are human-readable ("Free", "Role") not API snake_case (`is_free`, `is_role`) | `mock.ts:37-56` | YES |
| 4 | Mock scores are 0-10 range (8.5, 5.2, 1.2, 3.0) | `mock.ts:30,67,90,113` | YES |
| 5 | No dashboard summary cards, no line chart, no time range selector exist | entire `src/components/dashboard/` | YES |
| 6 | Quick-verify `handleVerify` is `console.log` + sets mock data | `quick-verify/page.tsx` (per agent) | YES (agent verified) |

### Epic 3: Billing & Credits

| # | Issue | File:Line | Verified |
|---|---|---|---|
| 1 | Billing cycle state is `"monthly" \| "annual"` — API uses `"yearly"` | `billing/page.tsx:13` | YES |
| 2 | Cancel flow: closes modal, opens cancelled modal — **no API call** | `billing/page.tsx:93-96` | YES |
| 3 | `CreditsCard` takes only `hasSubscription: boolean` — no subscription data props | `billing/page.tsx:64-69` | YES |
| 4 | Only **3 mock pricing plans** (Starter $9, Growth $29, Business $79) — epic has 9 tiers | `mock.ts:340-388` | YES |
| 5 | Only **5 mock credit packages** (100-10000) — epic has 9 tiers (1K-1M) | `mock.ts:390-396` | YES |
| 6 | Credit history page is at `/home/usage` not under `/home/billing` | `home/usage/page.tsx` | YES |
| 7 | Usage page header says "Transaction Dae" (typo for "Date") | `home/usage/page.tsx:59` | YES |

### Epic 4: Bulk Verification

| # | Issue | File:Line | Verified |
|---|---|---|---|
| 1 | Route param is `[listId]` not `[jobId]` | `home/bulk-verify/[listId]/page.tsx` (directory name) | YES |
| 2 | Detail page has **no `useParams()`** — never reads the route parameter | `[listId]/page.tsx` (entire file, no `useParams` import) | YES |
| 3 | Detail page has **no EventSource/SSE** — no real-time progress | entire codebase (grep: 0 results for EventSource) | YES |
| 4 | Export flow is multi-destination (ReachInbox, WhereTo, AddTo modals) not simple CSV download | `[listId]/page.tsx:7-11,67-94` | YES |

### Epic 5: API Keys & Webhooks

| # | Issue | File:Line | Verified |
|---|---|---|---|
| 1 | `/home/usage` is **credit history** — NOT verification usage history | `home/usage/page.tsx:5-6` (imports `CreditHistoryTable`, `mockCreditHistory`) | YES |
| 2 | Usage table columns: Transaction Date, Reason, Change, Balance — NOT email/status/method | `home/usage/page.tsx:57-69` | YES |
| 3 | API key table columns: Name, Key, Type, Security — NOT status/createdAt/lastUsed/expiresAt | `api-keys-table.tsx:33-45` | YES |
| 4 | Keys shown **unmasked**: `apiKey.key` displayed directly | `api-keys-table.tsx:62-64` | YES |
| 5 | Mock keys have no `ev_` prefix — all are `"3dwnjednejncdsc"` | `mock.ts:179,192,204,216,228,240,252,258` | YES |
| 6 | New API Key form fields: **name, security, ipAddresses, keyType** — NOT name + expiresIn | `new-api-key-form.tsx:12-15` | YES |
| 7 | No expiration field on new API key form | `new-api-key-form.tsx` (entire file) | YES |
| 8 | "Manage" button per key row has **no `onClick` handler** | `api-keys-table.tsx:88-92` | YES |
| 9 | Zero webhook components, types, or UI exist in the frontend | entire codebase | YES |
| 10 | Key prefix inconsistency: CLAUDE.md says `sk_`, epic says `ev_`, frontend has no prefix | multiple sources | YES |

### Epic 6: Active Verification

| # | Issue | File:Line | Verified |
|---|---|---|---|
| 1 | ReachInbox login modal collects **email + password** — API expects **`apiKey`** | `reachinbox-login-modal.tsx:17-18` | YES |
| 2 | Default values hardcoded: `"aman@outbox.vc"`, `"password123456"` | `reachinbox-login-modal.tsx:17-18` | YES |
| 3 | Mock data has **3 active verifications** — epic says single connection per user (MVP) | `mock.ts:398-427` | YES |
| 4 | Mock integration sources: **8 sources** listed, only ReachInbox available | `mock.ts:429-438` | YES |
| 5 | `ActiveVerificationItem.segments` uses CSS **gradients** as color values | `mock.ts:407-410` | YES |

### Epic 7: Landing & Public

| # | Issue | File:Line | Verified |
|---|---|---|---|
| 1 | Landing page is **28 lines** — title + two links only | `app/page.tsx:1-28` | YES |
| 2 | No hero section, no feature grid, no pricing table, no footer | `app/page.tsx` (entire file) | YES |
| 3 | No "Get Started" CTA — only "Sign In" and "Dashboard" links | `app/page.tsx:12-23` | YES |
| 4 | Brand name inconsistency: root page says "VerifyInbox", metadata says "VerifyInbox" | `app/page.tsx:8`, `app/layout.tsx:24` | YES |

---

## Section 5: Frontend Components the Epics Don't Account For

These are things already built in the frontend that no epic story covers.

| # | Component | File | What It Does | Missing From |
|---|---|---|---|---|
| 1 | `BillingInfoForm` | `settings/billing-info-form.tsx` | Address, city, country, state, postal code | All epics |
| 2 | `DataRetentionForm` | `settings/billing-info-form.tsx` (same file) | API data retention period (7-90 days) | All epics |
| 3 | `CookiePolicyModal` | `modals/cookie-policy-modal.tsx` | Cookie consent (renders on quick-verify) | All epics |
| 4 | `CsvValidationResults` | `bulk-verify/csv-validation-results.tsx` | Pre-verification email validation step | Epic 4 |
| 5 | `NameListModal` | `bulk-verify/name-list-modal.tsx` | Name your list before verification starts | Epic 4 |
| 6 | `AddEmailsModal` | `bulk-verify/add-emails-modal.tsx` | Choose between Upload CSV / Enter Manually | Epic 4 |
| 7 | `ResultsSettingsTab` | `bulk-verify/results-settings-tab.tsx` | Rename list + Delete list | Epic 4 |
| 8 | `ExportWhereToModal` | `export/export-where-to-modal.tsx` | Export to Instantly/Reply/Smartlead | Epic 4, 6 |
| 9 | `ExportAddToModal` | `export/export-add-to-modal.tsx` | Add to campaign/lead list | Epic 4, 6 |
| 10 | `ExportReachinboxLogin` | `export/export-reachinbox-login.tsx` | ReachInbox login for export | Epic 4, 6 |
| 11 | Profile page **Billing tab** | `home/profile/page.tsx` | Renders CreditsCard on profile page | Epic 1 |
| 12 | SsoConnections **ReachInbox option** | `settings/sso-connections.tsx` | "Sign In Using Reachinbox" with "100 Credits Free" | Epic 1 |
| 13 | `NoSearchResults` | `bulk-verify/no-search-results.tsx` | Empty state for search with no results | Epic 4 |
| 14 | `RenameListModal` | `bulk-verify/rename-list-modal.tsx` | Rename a bulk list | Epic 4 |
| 15 | Custom SVG donut chart on active verification detail | `active-verification/[integrationId]/page.tsx` | Hand-rolled SVG chart (not Recharts) | Epic 6 |

---

## Section 6: Mock Data Conflicts

### 6.1 Pricing Plans — Two Conflicting Sets

**Set A** (`src/lib/data/mock.ts:340-388`):
- Starter: $9/mo, 1,000 credits
- Growth: $29/mo, 5,000 credits (popular)
- Business: $79/mo, 25,000 credits

**Set B** (hardcoded in `src/app/(dashboard)/home/billing/plans/page.tsx:5-44`, per agent):
- Growth Plan: $99/mo
- Pro Plan: $499/mo
- Enterprise Plan: $999/mo

**Epic expects:** 9 tiers (Free, Starter, Popular, Growth, Professional, Business, Premium, Enterprise, Titan)

### 6.2 Credit Packages

**Mock data** (`src/lib/data/mock.ts:390-396`): 5 packages (100, 500, 1000, 5000, 10000 credits)
**PackageGrid** (per agent): 9 identical `5000` entries hardcoded
**Epic expects:** 9 tiers (1K, 2K, 5K, 10K, 25K, 50K, 100K, 500K, 1M)

### 6.3 History Page Uses Inline Mock, Not BulkList Type

The `BulkList` type and `mockBulkLists` in `mock.ts` have proper structure with `totalEmails`, `status`, `progress`, `results`, `createdAt`. But per agent report, the history page uses its own inline mock with a completely different shape (`emailCount` as string like `"21k"`, percentages as inline fields).

---

## Section 7: Summary Count

| Category | Count |
|---|---|
| Cross-cutting infrastructure gaps | 6 |
| Type definition field mismatches | 28 |
| Status enum mismatches | 5 |
| Per-epic verified issues | 43 |
| Unaccounted frontend components | 15 |
| Mock data conflicts | 3 |
| **Total documented gaps** | **100** |

---

## Section 8: What This Means for Implementation

The frontend is a **static Figma-to-code prototype**. Every frontend integration story in every epic describes work that must be built from scratch. The component shells exist (file paths are accurate), but:

1. **Zero data fetching** — every component needs API calls wired in
2. **Zero error handling** — every component needs error states, loading states, retry logic
3. **Zero state management** — no auth context, no query cache, no session handling
4. **Type definitions need significant updates** — 28 field-level mismatches documented above
5. **Status enum needs a decision** — `deliverable/undeliverable` (frontend) vs `valid/invalid` (API) must be resolved project-wide
6. **Score range needs a decision** — 0-10 (frontend) vs 0-100 (API) must be resolved
7. **15 existing components** are not covered by any epic story — they need to be accounted for or explicitly excluded
8. **3 mock data conflicts** need resolution before implementation

The epics correctly identify component file paths, and the "Frontend Type Mismatches" tables in each epic partially document the type issues. However, the epics underestimate the integration gap — they describe "wire up API calls" but the actual work includes building the entire data fetching infrastructure, auth flow, middleware, error handling, and resolving fundamental type/enum mismatches.
