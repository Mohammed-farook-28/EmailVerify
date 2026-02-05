# Feature Specification: Public API & Webhooks

**Feature Branch**: `005-api-webhooks`
**Created**: 2026-02-04
**Status**: Draft
**Input**: Epic 5 - Public API & Webhooks for developers to integrate via REST API

## User Scenarios & Testing *(mandatory)*

### User Story 1 - API Key Management (Priority: P1)

A developer wants to create and manage API keys so they can authenticate their applications against the EmailKit API. They need to create keys with custom names and expiration periods, view their existing keys (with sensitive portions masked), and revoke keys when no longer needed.

**Why this priority**: API keys are the foundation for all API access. Without key management, developers cannot authenticate to use any API endpoints. This is the gateway to all other API functionality.

**Independent Test**: Can be fully tested by creating an API key, viewing the masked key list, and deleting a key. Delivers immediate value by enabling developers to generate credentials.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the API keys page, **When** they create a new key with name "Production App" and 1-year expiration after re-authenticating (password or OAuth), **Then** the full key is displayed once with a copy button and a warning that it won't be shown again
2. **Given** a user with existing API keys, **When** they view the API keys page, **Then** all keys are listed with masked values (e.g., `ek_Ue7HpvL9...`), status, creation date, last used date, and expiration
3. **Given** a user viewing their API keys, **When** they delete a key and confirm the action, **Then** the key is immediately revoked and any API calls using that key return unauthorized
4. **Given** a user with 10 API keys (maximum), **When** they attempt to create another key, **Then** they see an error message about reaching the limit

---

### User Story 2 - Single Email Verification via API (Priority: P1)

A developer wants to verify individual email addresses programmatically through the API, receiving the same verification results as the web interface. They also need to check their credit balance via the API.

**Why this priority**: Single verification is the core value proposition for API users. Combined with API keys, this enables the most common integration use case.

**Independent Test**: Can be fully tested by making an API call with a valid Bearer token to verify an email and checking credit balance. Delivers immediate verification capability.

**Acceptance Scenarios**:

1. **Given** a developer with a valid API key and sufficient credits, **When** they POST to `/api/v1/verify` with an email address, **Then** they receive the full verification result including status, score, and attributes
2. **Given** a developer with a valid API key, **When** they GET `/api/v1/credits`, **Then** they receive their current credit balance and last updated timestamp
3. **Given** a developer with an invalid or expired API key, **When** they make any API request, **Then** they receive a 401 error with an appropriate message
4. **Given** a developer with zero credits, **When** they attempt to verify an email, **Then** they receive a 402 error indicating insufficient credits
5. **Given** a developer with a valid API key and sufficient credits, **When** they POST to `/api/v1/verify/batch` with up to 100 emails, **Then** they receive an array of verification results synchronously
6. **Given** a developer with a test mode key (ek_test_), **When** they make a verification request, **Then** they receive a mock successful response without consuming credits

---

### User Story 3 - Bulk Verification via API (Priority: P2)

A developer wants to submit bulk email verification jobs programmatically, check their progress, and download results when complete. This allows them to integrate bulk verification into their automated workflows.

**Why this priority**: Bulk verification extends the API's value for high-volume users. Depends on single verification being available first.

**Independent Test**: Can be fully tested by submitting a bulk job via API, polling for status, and downloading results. Delivers batch processing capability.

**Acceptance Scenarios**:

1. **Given** a developer with a valid API key and sufficient credits, **When** they POST a CSV file or JSON array to `/api/v1/verify/bulk`, **Then** they receive a job ID with status "processing"
2. **Given** a developer on Starter tier with 1 running job, **When** they attempt to submit another bulk job, **Then** they receive an error about concurrent job limit (tier-based: Starter: 1, Growth: 2, Pro: 3, Scale: 5, Titan: 10)
3. **Given** a developer submitting a bulk job exceeding their tier limit, **When** they POST to `/api/v1/verify/bulk`, **Then** they receive an error about size limit (Starter: 10K, Growth: 25K, Pro: 50K, Scale: 100K, Titan: 500K)
4. **Given** a developer with an in-progress bulk job, **When** they GET `/api/v1/verify/bulk/:jobId`, **Then** they receive the current status, progress percentage, and results summary
5. **Given** a developer with a completed bulk job, **When** they GET `/api/v1/verify/bulk/:jobId/results`, **Then** they receive the results CSV with header row included
6. **Given** a developer attempting to access a job from another user, **When** they request the job status, **Then** they receive a 403 forbidden error
7. **Given** a developer whose subscription downgrades, **When** they have bulk jobs in progress, **Then** jobs are cancelled and unused credits are refunded

---

### User Story 4 - Webhook Notifications (Priority: P2)

A developer wants to receive real-time notifications when verification events occur, so their application can react without polling. They need to create webhooks, receive signed payloads, and manage their webhook endpoints.

**Why this priority**: Webhooks enable event-driven integrations, reducing the need for polling. This is a value-add feature after core API functionality.

**Independent Test**: Can be fully tested by creating a webhook, triggering a verification, and receiving the signed notification. Delivers real-time event capability.

**Acceptance Scenarios**:

1. **Given** a developer with a valid API key, **When** they POST to `/api/v1/webhooks` with a URL and event types, **Then** the system sends a test ping and if successful, returns a signing secret (shown once) and the webhook becomes active
2. **Given** a developer creating a webhook with an unreachable URL, **When** the test ping fails, **Then** they receive an error explaining the webhook could not be verified
3. **Given** a configured webhook for `verification.completed`, **When** a single verification completes, **Then** the webhook receives a signed payload with event details (full or summary based on configuration)
4. **Given** a configured webhook for `bulk.completed`, **When** a bulk job finishes, **Then** the webhook receives a notification with the job results summary
5. **Given** a webhook that fails delivery multiple times, **When** all retry attempts are exhausted (30s timeout per attempt), **Then** the webhook is paused and the user is notified via email
6. **Given** a user viewing webhook details in the web UI, **When** they check delivery logs, **Then** they can see recent delivery attempts with status codes and timing

---

### User Story 5 - Per-User Rate Limiting (Priority: P2)

The platform needs to enforce rate limits based on subscription tier to ensure fair usage and protect upstream resources. Developers should receive clear feedback when limits are exceeded.

**Why this priority**: Rate limiting protects system stability and ensures fair access. Essential for production readiness but not blocking initial API usage.

**Independent Test**: Can be tested by making requests up to the tier limit and verifying 429 responses with Retry-After headers.

**Acceptance Scenarios**:

1. **Given** a user on any subscription tier making API requests, **When** they exceed their tier's rate limit, **Then** they receive a 429 response with a Retry-After header
2. **Given** a user making any API request, **When** the response is returned, **Then** it includes X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset headers
3. **Given** a user who upgrades their subscription, **When** they make API requests after upgrade, **Then** the new higher limits apply immediately
4. **Given** global traffic exceeding 2,000 requests per second, **When** system load is critical, **Then** the global rate limiter activates to protect upstream services

---

### User Story 6 - API Key Management UI Integration (Priority: P3)

The frontend API keys page needs to be connected to the backend endpoints so users can manage their API keys through the web interface.

**Why this priority**: UI integration improves user experience but developers can use API keys via API calls even without UI.

**Independent Test**: Can be tested by loading the API keys page and verifying data loads from the backend.

**Acceptance Scenarios**:

1. **Given** a user navigating to the API keys page, **When** the page loads, **Then** their existing API keys are fetched and displayed in a table
2. **Given** a user creating a new API key via the UI, **When** creation succeeds, **Then** a modal shows the full key with copy button and "won't show again" warning
3. **Given** a user deleting a key via the UI, **When** they confirm deletion, **Then** the key is removed from the list immediately

---

### User Story 7 - Usage History & Export (Priority: P3)

Users want to view their verification history with filtering and search capabilities, and export data for auditing or integration with their systems.

**Why this priority**: Usage history is important for auditing but not essential for core API functionality.

**Independent Test**: Can be tested by loading usage history, applying filters, and exporting to CSV.

**Acceptance Scenarios**:

1. **Given** a user on the usage history page, **When** the page loads, **Then** their verification history is displayed with pagination
2. **Given** a user viewing usage history, **When** they filter by status or method, **Then** results are filtered accordingly
3. **Given** a user with verification history, **When** they request an export, **Then** a CSV file downloads with all matching records

---

### Edge Cases

- What happens when an API key expires mid-request? The current request completes, subsequent requests fail
- How does the system handle webhook endpoint returning non-2xx repeatedly? After 4 failed attempts (immediate, 1min, 5min, 30min), webhook is paused
- What happens when a user deletes their account with active webhooks? All webhooks are deactivated immediately
- How are duplicate webhook deliveries handled? Each event has a unique ID; recipients should deduplicate
- What happens when bulk job results expire? Returns 410 Gone after 14 days; users notified at 7 days and 3 days before expiry
- How does rate limiting apply across multiple API keys? Limits are per-user, not per-key
- When does `credits.low` webhook fire? When balance drops below 10% of last purchase amount (e.g., if last purchase was 1,000 credits, triggers at <100 credits)
- What happens when webhook test ping fails during creation? Webhook is not created; user receives error with response details
- What happens when subscription downgrades with bulk jobs in progress? Jobs are cancelled and unused credits are refunded
- How are deleted API keys handled? Soft-deleted immediately (returns 401), hard-deleted after 90 days for audit trail
- What happens with test mode keys (ek_test_)? Return mock successful responses without consuming credits
- How does batch verify handle partial failures? Returns array with individual results; successful verifications consume credits
- What if webhook delivery takes longer than 30 seconds? Marked as failed, enters retry queue
- How is idempotency handled for duplicate requests? Same Idempotency-Key within 24 hours returns cached response

## Requirements *(mandatory)*

### Functional Requirements

**API Key Management**
- **FR-001**: System MUST require re-authentication (password or OAuth verification within last 10 minutes) before allowing API key creation
- **FR-001a**: System MUST allow users to create API keys with a name and configurable expiration (1 month, 3 months, 6 months, 1 year, or never)
- **FR-002**: System MUST generate API keys with `ek_` prefix followed by 32 cryptographically random bytes encoded as Base64 URL-safe (43 characters total)
- **FR-002a**: System MUST support test mode keys with `ek_test_` prefix that return mock responses without consuming credits
- **FR-003**: System MUST display the full API key only once at creation time
- **FR-004**: System MUST store only the hashed version of API keys
- **FR-005**: System MUST limit users to a maximum of 10 API keys
- **FR-006**: System MUST allow users to view a list of their keys showing masked values, status, and usage statistics
- **FR-007**: System MUST soft-delete API keys with immediate revocation, with hard deletion after 90 days

**Public API - Verification**
- **FR-008**: System MUST authenticate API requests using Bearer token (API key) in the Authorization header
- **FR-008a**: System MUST require Idempotency-Key header (UUID v4) for POST requests with 24-hour TTL for cached results
- **FR-009**: System MUST provide a single email verification endpoint returning the same results as web verification
- **FR-009a**: System MUST provide a batch verification endpoint (POST /api/v1/verify/batch) for up to 100 emails synchronously
- **FR-009b**: System MUST verify email addresses as-is without normalizing plus addressing (user+tag@example.com)
- **FR-010**: System MUST provide an endpoint to check current credit balance
- **FR-011**: System MUST provide bulk verification endpoints for job submission, status checking, and results download
- **FR-011a**: System MUST enforce tier-based bulk job size limits (Starter: 10K, Growth: 25K, Pro: 50K, Scale: 100K, Titan: 500K emails)
- **FR-011b**: System MUST enforce tier-based concurrent job limits (Starter: 1, Growth: 2, Pro: 3, Scale: 5, Titan: 10 jobs)
- **FR-011c**: System MUST cancel in-progress bulk jobs and refund unused credits when subscription downgrades or expires
- **FR-012**: System MUST accept bulk submissions as CSV files or JSON arrays
- **FR-012a**: System MUST include header row in all CSV result downloads

**Webhook System**
- **FR-013**: System MUST allow users to create webhooks with a target HTTPS URL (localhost exempt for development) and selected event types
- **FR-013a**: System MUST validate webhook URLs by sending a test ping (5-second timeout) and verifying 2xx response before activation
- **FR-013b**: System MUST allow users to configure webhook payload size (full result or summary with link to fetch details)
- **FR-014**: System MUST generate webhook signing secrets with `whsec_` prefix, displayed once at creation
- **FR-015**: System MUST sign webhook payloads using HMAC-SHA256 with timestamp and body
- **FR-016**: System MUST support four event types: verification.completed, bulk.completed, bulk.failed, credits.low
- **FR-016a**: System MUST trigger `credits.low` event when user's balance drops below 10% of their last purchase amount
- **FR-017**: System MUST retry failed webhook deliveries with exponential backoff (immediate, 1min, 5min, 30min)
- **FR-017a**: System MUST use 30-second timeout for webhook deliveries before marking as failed
- **FR-018**: System MUST pause webhooks and notify users after 4 consecutive failures
- **FR-018a**: System MUST provide webhook delivery logs viewable in web UI (not via API)
- **FR-019**: System MUST limit users to a maximum of 10 webhooks

**Rate Limiting**
- **FR-020**: System MUST enforce per-user rate limits based on subscription tier:
  - Starter: 10 req/sec, 5 concurrent
  - Growth: 15 req/sec, 10 concurrent
  - Pro: 25 req/sec, 15 concurrent
  - Scale: 50 req/sec, 30 concurrent
  - Titan: 100 req/sec, 50 concurrent
  (Note: Values may be adjusted post-load testing)
- **FR-021**: System MUST return 429 responses with Retry-After header when limits are exceeded
- **FR-021a**: System MUST include X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset headers on all API responses
- **FR-022**: System MUST enforce a global rate limit of 2,000 requests per second across all users

**Usage History**
- **FR-023**: System MUST provide usage history with filtering by email, status, and method
- **FR-023a**: System MUST retain usage history according to user's data retention setting (30/60/90 days)
- **FR-024**: System MUST support cursor-based pagination for all list endpoints
- **FR-025**: System MUST allow users to export usage history as CSV with date range filtering

**API Infrastructure**
- **FR-026**: System MUST include X-Request-ID in response headers and body for all API requests
- **FR-027**: System MUST provide a public health check endpoint (GET /api/v1/health) that returns minimal status without authentication
- **FR-028**: System MUST use URL path versioning for API endpoints (/api/v1/)
- **FR-029**: System MUST NOT support CORS (API is server-side only)
- **FR-030**: System MUST use UTF-8 encoding for all API responses
- **FR-031**: System MUST send email notifications at 7 days and 3 days before bulk job results expire

### Key Entities

- **API Key**: Represents authentication credentials for API access. Has name, masked key (ek_ prefix + Base64 URL-safe), status (active/expired/revoked), creation date, last used date, expiration date, usage statistics, and is_test flag for sandbox keys (ek_test_ prefix). Soft-deleted keys retain record for 90 days before hard deletion.
- **Webhook**: Represents an endpoint for event notifications. Has URL (HTTPS only, validated on creation), subscribed event types, signing secret (whsec_ prefix, hashed), status (active/failing/paused), failure count, last delivery timestamp, and payload_mode (full/summary) for configuring response detail level.
- **Webhook Delivery**: Represents an individual delivery attempt. Has event ID, event type, payload, delivery status, response code, retry count, and duration_ms. Viewable in web UI only.
- **Usage Record**: Represents a single verification action. Has email checked, status, method (web/api/batch), timestamp, request_id, and optional bulk job reference. Retention follows user's data retention setting.
- **Idempotency Record**: Represents a cached response for duplicate request prevention. Has idempotency_key (UUID v4), request hash, cached response, and expires_at (24 hours from creation).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can create an API key and make their first successful verification within 5 minutes
- **SC-002**: API verification requests return results within the same time as web verification (accounting for network latency)
- **SC-003**: Webhook notifications are delivered within 5 seconds of event occurrence for successful endpoints
- **SC-004**: 99% of valid API requests complete successfully without rate limiting for users within their tier limits
- **SC-005**: Users can view and manage all their API keys and webhooks through both API and web interface
- **SC-006**: Bulk job status queries return current progress with less than 2-second staleness
- **SC-007**: Usage export generates downloadable CSV within 30 seconds for up to 10,000 records
- **SC-008**: Batch verification endpoint (up to 100 emails) returns all results synchronously within 30 seconds
- **SC-009**: Health check endpoint responds within 100ms under normal load
- **SC-010**: Users receive result expiry notifications at both 7 days and 3 days before deletion

## Assumptions

- Users have completed email verification and have an active account before creating API keys
- The verification engine (Epic 2) and billing system (Epic 3) are already implemented and operational
- The existing bulk verification system (Epic 4) can be extended to support API-based submission
- HTTPS is required for all webhook URLs (no HTTP endpoints allowed)
- Webhook recipients are responsible for implementing replay protection using timestamp validation
- API key re-authentication timeout of 10 minutes follows the existing security pattern from user authentication
- Specific rate limits per tier will be determined through load testing before production release
- Clients will provide valid UUID v4 values for Idempotency-Key headers
- Webhook endpoints can handle large payloads (no size limit enforced, documented recommendation)
- Email addresses with plus addressing (user+tag@example.com) are treated as distinct addresses

## Dependencies

- **Epic 2**: Verification engine must be operational for API verification endpoints
- **Epic 3**: Billing and subscription system must be operational for tier-based rate limiting
- **Epic 4**: Bulk verification system provides the foundation for API bulk endpoints

## Out of Scope

- Webhook management UI (webhooks CRUD is API-only for initial release; however, webhook delivery logs ARE viewable in web UI per FR-018a)
- Custom rate limit configurations beyond subscription tiers
- API versioning beyond v1
- OAuth2 token-based authentication (using API keys instead)
- Verification history API endpoint (only available via web at `/home/usage`)
- CORS support (API is server-side only; API keys should never be exposed in browser code)
- IP whitelist for API keys (may be added as premium feature in future)
- API key scopes/permissions (all keys have full access)
- Webhook delivery logs via API (only available in web UI)

## Clarifications

### Session 2026-02-04

- Q: Should API key creation require re-authentication? → A: Yes, require re-authentication (password or OAuth) before creating API keys
- Q: When should the `credits.low` webhook event trigger? → A: When balance drops below 10% of last purchase amount
- Q: What are the rate limits for each subscription tier? → A: Initial values set (Starter: 10/s, Growth: 15/s, Pro: 25/s, Scale: 50/s, Titan: 100/s); may adjust post-load testing
- Q: Should webhook URLs be validated with a test ping before activation? → A: Yes, send test ping on creation and verify endpoint returns 2xx
- Q: What's the maximum number of emails in a single bulk job via API? → A: Tier-based limits (Starter: 10K, Growth: 25K, Pro: 50K, Scale: 100K, Titan: 500K)
- Q: Can users run multiple bulk jobs concurrently? → A: Tier-based concurrency (Starter: 1, Growth: 2, Pro: 3, Scale: 5, Titan: 10 concurrent jobs)
- Q: Should API keys support scopes/permissions? → A: No scopes - all keys have full access
- Q: How long should API usage history be retained? → A: Follow user's data retention setting (30/60/90 days from profile)
- Q: What pagination style should list endpoints use? → A: Cursor-based pagination (after cursor)
- Q: What HTTP status for insufficient credits? → A: 402 Payment Required (already in spec)
- Q: Should users be notified before bulk job results expire? → A: Yes, email notifications at 7 days and 3 days before expiry
- Q: Should API include request IDs for debugging? → A: Yes, X-Request-ID header and in response body
- Q: What format for API key after ek_ prefix? → A: Base64 URL-safe encoding (43 characters total)
- Q: Should webhook payloads be full or summary? → A: Configurable per webhook (full result or summary with link)
- Q: Should API keys have IP whitelist? → A: No IP restrictions
- Q: What happens to in-progress bulk jobs on subscription downgrade? → A: Cancel jobs and refund unused credits
- Q: Should API support idempotency keys? → A: Yes, required/encouraged Idempotency-Key header with UUID v4 value, 24-hour TTL for cached results
- Q: Should webhook delivery logs be available? → A: Yes, but only via web UI (not API)
- Q: Should API support batch single-verification? → A: Yes, POST /api/v1/verify/batch for up to 100 emails synchronously
- Q: How to handle plus addressing (user+tag@example.com)? → A: Verify as-is without normalization
- Q: Should there be test mode API keys? → A: Yes, ek_test_ prefix for sandbox keys that return mock responses without using credits
- Q: Maximum webhook payload size? → A: No limit, but document that endpoints should handle large payloads
- Q: Should responses include rate limit headers? → A: Yes, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset on all responses
- Q: How to handle deleted API keys? → A: Soft delete with 'revoked' status, hard delete after 90 days
- Q: Webhook delivery timeout? → A: 30 seconds before marking delivery as failed
- Q: Should API support CORS? → A: No CORS, server-side only (API keys should not be in browser code)
- Q: API versioning style? → A: URL path versioning (/api/v1/)
- Q: Should CSV results include headers? → A: Yes, always include header row
- Q: Character encoding for responses? → A: UTF-8 only
- Q: Public health check endpoint? → A: Yes, GET /api/v1/health returns minimal status without auth
