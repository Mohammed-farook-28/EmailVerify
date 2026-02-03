# Feature Specification: Bulk Email Verification

**Feature Branch**: `004-bulk-verification`
**Created**: 2026-02-02
**Status**: Draft
**Input**: Epic 4: Bulk Email Verification - Users can upload CSV/Excel files or paste email lists for batch verification with real-time progress updates and downloadable results

## Clarifications

### Session 2026-02-02

- Q: Can users cancel a bulk verification job that's already in progress? → A: No cancellation allowed - jobs must complete once started
- Q: How can users retry failed emails from a partially completed job? → A: No individual retry - users must re-upload failed emails in a new job
- Q: Can a user have multiple bulk verification jobs processing at the same time? → A: Only 1 job at a time - users must wait for completion before starting another
- Q: When a user uploads a CSV/Excel file for bulk verification, should the original input file be stored, and if so, for how long? → A: Don't store input files - only process and discard
- Q: If a user uploads an Excel file with multiple sheets, which sheet should be processed for email verification? → A: Always use the first sheet
- Q: When a user maps a column to emails, should the system validate that the column actually contains email-like data before starting the job? → A: Yes - warn but allow if less than 50% are valid
- Q: How frequently should real-time progress updates be sent to the user's browser during bulk verification? → A: Every 1% progress or every 5 seconds (whichever comes first)

## User Scenarios & Testing

### User Story 1 - Upload CSV for Bulk Verification (Priority: P1)

A user needs to verify thousands of email addresses from a spreadsheet. They upload their CSV or Excel file, map the email column, and start verification. The system processes all emails in batches and shows real-time progress.

**Why this priority**: This is the core bulk verification capability. Without it, users cannot process large email lists efficiently, which is the primary value proposition of bulk verification.

**Independent Test**: Upload a 1000-row CSV file, map the email column, start verification, and verify all emails are processed with downloadable results. This can be fully tested without any other bulk features and delivers immediate value.

**Acceptance Scenarios**:

1. **Given** a user has a CSV file with 5000 email addresses, **When** they upload the file and map the email column, **Then** the system parses the file, displays column preview, and allows confirmation
2. **Given** the user confirms the column mapping, **When** they start verification, **Then** the system deducts 5000 credits and begins processing emails in batches
3. **Given** verification is in progress, **When** the user views the job page, **Then** they see real-time progress including percentage complete, processing rate, and estimated time remaining
4. **Given** verification completes successfully, **When** the user clicks download, **Then** they receive a CSV with all verification results including email status, deliverability, and risk scores

---

### User Story 2 - Paste Emails for Quick Verification (Priority: P2)

A user copies a list of emails from any source (email, document, website) and wants to verify them quickly without creating a file. They paste the emails directly into the interface and start verification.

**Why this priority**: This provides flexibility for ad-hoc verification without file preparation. It's a convenience feature that improves user experience but isn't essential for MVP.

**Independent Test**: Copy 100 emails from various sources (comma-separated, newline-separated), paste into the interface, and verify all emails are processed correctly. Works independently of file upload.

**Acceptance Scenarios**:

1. **Given** a user has copied 200 email addresses from various sources, **When** they paste the list into the verification form, **Then** the system extracts valid emails regardless of separator format (newlines, commas, semicolons)
2. **Given** the pasted list is validated, **When** the user starts verification, **Then** credits are deducted and processing begins immediately without file storage
3. **Given** paste verification completes, **When** the user views results, **Then** they can download the results but the job does not appear in history (as specified - paste jobs are transient)

---

### User Story 3 - Track Bulk Verification History (Priority: P2)

A user wants to review their past bulk verification jobs to re-download results or track what they've verified over time. They access their history page and search for specific jobs by filename or status.

**Why this priority**: History tracking provides audit trail and convenience but isn't required for the primary verification workflow. Users can still verify emails without history.

**Independent Test**: Upload multiple CSV files over time, then access history page to view all past jobs with their statuses and re-download results. Works independently as long as file upload (P1) exists.

**Acceptance Scenarios**:

1. **Given** a user has completed 10 bulk verification jobs over the past month, **When** they access the history page, **Then** they see all file upload jobs listed with filename, date, status, and result counts
2. **Given** the user searches for a specific filename, **When** they enter the search term, **Then** only matching jobs are displayed
3. **Given** a job is less than 14 days old, **When** the user clicks download, **Then** they receive the full results CSV
4. **Given** a job is older than 14 days, **When** the user views it in history, **Then** the download button is disabled with "Results expired" message

---

### User Story 4 - Monitor Real-Time Verification Progress (Priority: P3)

A user submits a large bulk verification job and wants to monitor its progress in real-time without refreshing the page. They see live updates of emails processed, current processing rate, and estimated completion time.

**Why this priority**: Real-time updates improve user experience and reduce uncertainty, but static progress display with manual refresh would still work. This is a polish feature.

**Independent Test**: Start a 10,000 email bulk job and observe that progress updates automatically every few seconds without page refresh, showing accurate metrics. Requires bulk upload (P1) but adds enhanced monitoring.

**Acceptance Scenarios**:

1. **Given** a bulk job is processing 5000 emails, **When** the user stays on the job details page, **Then** progress updates automatically showing current count, percentage, processing rate, and ETA
2. **Given** the user's connection drops temporarily, **When** the connection recovers, **Then** the progress stream reconnects automatically and continues from the last known position
3. **Given** verification completes, **When** the final progress event arrives, **Then** the interface shows 100% complete and displays the results summary with download option

---

### User Story 5 - Filter and Download Partial Results (Priority: P3)

A user wants to download only specific types of emails from their bulk verification results. They filter by valid-only or invalid-only and download a targeted CSV instead of the full results.

**Why this priority**: This is a convenience feature for specific workflows (e.g., only downloading valid emails for a campaign). Not essential for MVP since users can filter after download.

**Independent Test**: Complete a bulk verification with mixed results, then download "valid only" and "invalid only" CSVs separately. Verify each contains only the requested subset. Requires bulk upload (P1) but adds filtering convenience.

**Acceptance Scenarios**:

1. **Given** a completed bulk job with 3000 valid and 2000 invalid emails, **When** the user selects "Download valid only", **Then** they receive a CSV containing only the 3000 valid emails
2. **Given** the same results, **When** the user selects "Download invalid only", **Then** they receive a CSV containing only the 2000 invalid emails
3. **Given** the user selects "Download all", **When** they download, **Then** they receive the complete unfiltered results

---

### Edge Cases

- **File size limits**: What happens when a user uploads a file larger than 10MB?
  - System rejects upload before processing with clear size limit message (413 error)

- **Invalid file format**: What happens when a user uploads a PDF or unsupported file type?
  - System rejects upload immediately with supported format message (415 error)

- **No email column detected**: What happens when uploaded CSV has no recognizable email addresses?
  - System shows all columns and requires manual column mapping selection

- **Insufficient credits**: What happens when a user tries to verify 10,000 emails but only has 500 credits?
  - System prevents job start and displays credit shortfall with link to purchase more (402 error)

- **Empty file**: What happens when a user uploads a CSV with zero rows or no valid emails?
  - System rejects with "No valid emails found" message (422 error)

- **Duplicate emails in file**: What happens when the same email appears multiple times?
  - System verifies each occurrence independently (no automatic deduplication)

- **Job processing failure**: What happens when verification encounters upstream API errors?
  - Partial results are saved with success/failure status per email, error reasons logged, job marked as completed with errors; users must create a new job to retry failed emails

- **Results expiration**: What happens when a user tries to download results after 14 days?
  - System shows "Results expired" with 410 error, metadata remains in history

- **Large result files**: What happens when results CSV exceeds 10MB?
  - System serves gzip compressed file with appropriate Content-Encoding header

- **Multiple tabs/browsers**: What happens when a user opens the same job in multiple tabs?
  - Each tab gets its own progress stream connection (acceptable overhead)

- **Long-running connections**: What happens if progress stream stays open for hours?
  - Connection timeouts after reasonable period, client auto-reconnects if job still running

- **User attempts to cancel job**: What happens if a user wants to stop a job in progress?
  - No cancellation option provided; jobs must complete once started; user can close browser but job continues processing in background

- **Starting a second job while one is active**: What happens if a user tries to upload/paste a new list while another job is processing?
  - System rejects the new job with message indicating one job already in progress; must wait for current job to complete (409 conflict error)

- **Excel file with multiple sheets**: What happens when user uploads an Excel file containing multiple sheets?
  - Only the first sheet is processed; other sheets are ignored; user must ensure emails are on the first sheet

- **Column with mostly non-email data**: What happens when user maps a column where less than 50% of values look like emails?
  - System displays warning message showing validation failure percentage but allows user to proceed if they confirm; invalid entries will fail verification

- **User wants original file back**: What happens if a user wants to re-download their original uploaded CSV/Excel file?
  - Not available; input files are not stored; only verification results are retained; user must keep original file separately

## Requirements

### Functional Requirements

- **FR-001**: System MUST accept CSV and Excel file uploads up to 10MB containing email lists
- **FR-002**: System MUST parse uploaded files and detect column headers automatically
- **FR-003**: System MUST allow users to manually map which column contains email addresses
- **FR-004**: System MUST validate column mapping before starting verification
- **FR-005**: System MUST deduct required credits atomically before starting any bulk verification
- **FR-006**: System MUST reject jobs when user has insufficient credits
- **FR-007**: System MUST process bulk verifications in batches of 100 emails per batch
- **FR-008**: System MUST accept pasted email lists with flexible separators (newlines, commas, semicolons)
- **FR-009**: System MUST extract valid email addresses from pasted text regardless of format
- **FR-010**: System MUST support bulk verification of up to 100,000 emails per job
- **FR-011**: System MUST provide real-time progress updates during bulk verification
- **FR-012**: System MUST calculate and display processing rate and estimated completion time
- **FR-013**: System MUST generate downloadable CSV results for completed jobs
- **FR-014**: System MUST include detailed verification data in results (status, deliverability, risk score, MX records, provider info, email type flags)
- **FR-015**: System MUST support filtered downloads (all results, valid only, invalid only)
- **FR-016**: System MUST compress result files larger than 10MB using gzip
- **FR-017**: System MUST store result files for 14 days after job completion
- **FR-018**: System MUST delete result files automatically after 14-day retention period
- **FR-019**: System MUST maintain job history for file upload verifications
- **FR-020**: System MUST exclude paste verifications from history (transient jobs)
- **FR-021**: System MUST allow users to search history by filename
- **FR-022**: System MUST allow users to filter history by job status (completed, processing, failed, pending)
- **FR-023**: System MUST paginate history results for users with many jobs
- **FR-024**: System MUST handle connection drops gracefully and allow progress stream reconnection
- **FR-025**: System MUST resume progress updates from last known position on reconnection
- **FR-026**: System MUST validate file type before processing (CSV and Excel only)
- **FR-027**: System MUST handle empty files with appropriate error message
- **FR-028**: System MUST process duplicate emails in file without deduplication
- **FR-029**: System MUST save partial results when verification encounters errors
- **FR-030**: System MUST log error reasons for failed verification jobs
- **FR-031**: System MUST NOT allow users to cancel bulk verification jobs once processing has started
- **FR-032**: System MUST NOT provide automatic retry mechanism for failed emails within the same job; users must create new jobs to retry failed verifications
- **FR-033**: System MUST limit users to one active bulk verification job at a time; new jobs cannot start until the current job completes
- **FR-034**: System MUST discard input files immediately after parsing and job creation; input files must not be stored
- **FR-035**: System MUST process only the first sheet when parsing Excel files with multiple sheets
- **FR-036**: System MUST validate column mapping by checking if at least 50% of values match email format; system must warn user if validation fails but allow job to proceed
- **FR-037**: System MUST send progress updates at intervals of 1% completion or 5 seconds, whichever occurs first

### Key Entities

- **Bulk Job**: Represents a batch email verification request with metadata including user ID, source type (file upload or paste), filename (if file upload), total email count, processed count, status (pending/processing/completed/failed), result summary (valid/invalid/risky/unknown counts), upload date, completion date, and error reason if failed

- **Verification Result**: Represents the outcome of verifying a single email, including the email address, verification status (deliverable/undeliverable/risky/unknown), risk score, failure reason if any, MX records found, SMTP provider detected, and email classification flags (free email, role-based, disposable, catch-all)

- **Result File**: Represents the stored CSV file containing all verification results for a bulk job, with pre-signed URL for secure download, file size, compression status, and expiration date (14 days from creation)

- **Progress Event**: Represents real-time progress information streamed during verification, including job ID, emails processed so far, total emails, completion percentage, current processing rate (emails/second), and estimated seconds remaining

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can successfully upload and verify bulk email lists containing up to 100,000 emails
- **SC-002**: File upload and column mapping completes in under 30 seconds for files up to 10MB
- **SC-003**: Bulk verification processes at minimum rate of 50 emails per second (batch of 5000 completes in under 2 minutes)
- **SC-004**: Real-time progress updates are sent every 1% completion or every 5 seconds (whichever occurs first)
- **SC-005**: 95% of bulk verification jobs complete successfully without errors
- **SC-006**: Users can download results immediately after job completion (under 3 seconds to generate download link)
- **SC-007**: CSV result files accurately contain 100% of verified emails with complete verification data
- **SC-008**: History page loads and displays jobs within 2 seconds for users with up to 100 past jobs
- **SC-009**: Search and filter operations on history return results in under 1 second
- **SC-010**: Paste verification workflow (from paste to processing start) completes in under 10 seconds for lists up to 1000 emails
- **SC-011**: System maintains 99.9% uptime for bulk verification job processing
- **SC-012**: Progress stream reconnection after connection drop completes in under 5 seconds
- **SC-013**: Users receive clear, actionable error messages for all failure scenarios (insufficient credits, invalid format, file too large)
- **SC-014**: 90% of users successfully complete their first bulk verification without contacting support
- **SC-015**: Result file download links remain valid and accessible for full 14-day retention period

## Assumptions

- Users have already completed authentication and have active accounts (dependency on Epic 001)
- Credit system is fully functional for atomic deduction and balance checking (dependency on Epic 002)
- Single email verification engine is operational and can be batched (dependency on Epic 002)
- File storage infrastructure (DigitalOcean Spaces or equivalent) is configured and operational
- Result files are stored in object storage with lifecycle policies for automatic deletion
- Workers and queue system (BullMQ) are configured for batch job processing
- Progress updates leverage existing job progress tracking infrastructure
- CSV/Excel parsing libraries are available and performant
- Pre-signed URL generation for secure downloads is supported by storage system
- Session authentication is sufficient for all bulk verification endpoints
- Maximum 10MB file size is adequate for business needs (typical CSV with 100K rows is ~5MB)
- 14-day retention balances storage costs with user needs for result access
- Paste verification text limit of 100K emails prevents abuse and performance issues
- Batch size of 100 emails optimizes throughput vs. job granularity
- Minimum processing rate of 50 emails/second is achievable with current infrastructure
