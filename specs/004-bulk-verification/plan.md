# Implementation Plan: Bulk Email Verification

**Branch**: `004-bulk-verification` | **Date**: 2026-02-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-bulk-verification/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Enable users to verify large email lists (up to 100,000 emails) through CSV/Excel file uploads or pasted text. System processes emails in batches of 100, provides real-time progress updates via SSE, and generates downloadable CSV results stored for 14 days. Key constraints: no job cancellation, no retry mechanism (re-upload required), single concurrent job per user, no input file storage.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20+ backend, Next.js 15+ frontend)
**Primary Dependencies**:
  - Backend: Express, BullMQ Pro, csv-parse, xlsx, SSE middleware
  - Frontend: React 19, TanStack Query, react-dropzone
**Storage**:
  - Database: PostgreSQL 16+ (bulk_jobs, verification_results tables)
  - Object Storage: DigitalOcean Spaces (result CSV files)
  - Queue: Redis 7+ (BullMQ job queue)
**Testing**: Vitest (unit), Supertest (API integration), Playwright (E2E)
**Target Platform**: Linux server (DigitalOcean/Kubernetes deployment)
**Project Type**: Web application (backend API + frontend dashboard)
**Performance Goals**:
  - Process minimum 50 emails/second
  - File upload/parsing <30s for 10MB files
  - Progress updates every 1% or 5s
  - Result download <3s
**Constraints**:
  - Max file size: 10MB
  - Max emails per job: 100,000
  - Result retention: 14 days
  - Single concurrent job per user
  - Batch size: 100 emails
**Scale/Scope**:
  - 1000+ users
  - Support up to 100K emails/job
  - History pagination for 100+ past jobs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **Five-Layer Defense** | ✅ PASS | Bulk verification integrates with existing layers: API Gateway (auth, credit check), Fair Queue (BullMQ groups), Worker Pool (batch processing), Circuit Breaker (upstream calls), Upstream Proxy |
| **Credit Atomicity** | ✅ PASS | Uses existing Redis Lua atomic deduction before job creation; no new credit logic needed |
| **Fair Queuing** | ✅ PASS | Single-verify jobs get priority over bulk batches (existing BullMQ priority system); one job per user prevents queue monopolization |
| **No Single Point of Failure** | ✅ PASS | Workers can scale 2-50; Redis persistence enabled; result files in object storage with redundancy; job state in PostgreSQL |
| **Simplicity First** | ✅ PASS | No cancellation = simpler state machine; no retry = cleaner error handling; no input storage = reduced complexity; reuses existing verification engine |
| **Observability** | ✅ PASS | Progress updates via SSE; job status in DB; error logging per email; transaction history integration |
| **Performance Targets** | ✅ PASS | 50 emails/sec achievable with 10+ workers × 50 concurrent jobs; batch size (100) optimizes throughput |

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── db/
│   │   └── schema.ts              # Add bulk_jobs, verification_results tables
│   ├── routes/
│   │   └── bulk.ts                # NEW: Bulk verification endpoints
│   ├── services/
│   │   ├── bulk-verification.ts   # NEW: Job creation, parsing, orchestration
│   │   ├── file-parser.ts         # NEW: CSV/Excel parsing
│   │   └── result-storage.ts      # NEW: Result file generation, S3 upload
│   ├── workers/
│   │   └── bulk-worker.ts         # NEW: Process bulk job batches
│   ├── middleware/
│   │   └── sse.ts                 # NEW: Server-Sent Events middleware
│   └── types/
│       └── bulk.ts                # NEW: Bulk job types
├── drizzle/
│   └── 0003_bulk_verification.sql # NEW: Migration for bulk tables
└── tests/
    ├── unit/
    │   ├── file-parser.test.ts
    │   └── bulk-verification.test.ts
    └── integration/
        └── bulk-api.test.ts

frontend/
├── src/
│   ├── app/
│   │   └── (dashboard)/
│   │       └── home/
│   │           ├── bulk-verify/
│   │           │   └── page.tsx          # NEW: Bulk verification page
│   │           └── history/
│   │               └── page.tsx          # NEW: Bulk job history page
│   ├── components/
│   │   └── bulk/
│   │       ├── file-upload.tsx           # NEW: CSV/Excel upload with column mapping
│   │       ├── paste-input.tsx           # NEW: Paste emails textarea
│   │       ├── progress-stream.tsx       # NEW: Real-time progress display
│   │       ├── job-history-table.tsx     # NEW: Past jobs with search/filter
│   │       └── result-download.tsx       # NEW: Download with filter options
│   └── hooks/
│       ├── useBulkVerification.ts        # NEW: Job creation and status
│       ├── useProgressStream.ts          # NEW: SSE connection hook
│       └── useJobHistory.ts              # NEW: History fetching
└── tests/
    └── e2e/
        └── bulk-verification.spec.ts
```

**Structure Decision**: Web application structure (Option 2). Backend implements API routes, services, and workers for bulk processing. Frontend adds new pages and components to existing dashboard. Integration with existing Epic 002 (verification engine) and Epic 003 (credit system).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**Status**: ✅ No violations - All constitution principles satisfied

This feature integrates cleanly with existing architecture:
- Reuses five-layer defense (no new layers)
- Reuses credit system (no new credit logic)
- Reuses verification engine (just batched)
- Reuses fair queuing (BullMQ groups)
- Adds new tables but follows existing patterns
- SSE is simpler than WebSockets alternative

## Phase 1 Design Complete

**Artifacts Generated**:
- ✅ `research.md` - 12 research decisions with rationale
- ✅ `data-model.md` - 2 tables, 4 states, full TypeScript types, Drizzle schema, migration SQL
- ✅ `contracts/api-endpoints.md` - 7 REST endpoints with request/response contracts
- ✅ `quickstart.md` - Setup guide with 8 test scenarios and troubleshooting

**Constitution Re-Check**: ✅ PASS

| Principle | Status After Design | Notes |
|-----------|---------------------|-------|
| **Five-Layer Defense** | ✅ PASS | Design integrates with all 5 layers; no new layers added |
| **Credit Atomicity** | ✅ PASS | Uses existing Redis Lua script; no changes to credit logic |
| **Fair Queuing** | ✅ PASS | BullMQ groups handle round-robin; one job per user prevents starvation |
| **No Single Point of Failure** | ✅ PASS | Workers scale 2-50; PostgreSQL + Redis persistence; S3 redundancy |
| **Simplicity First** | ✅ PASS | Removed cancellation, retry, input storage per clarifications; simpler than alternatives |
| **Observability** | ✅ PASS | SSE progress updates; job status in DB; error logging; transaction history |
| **Performance Targets** | ✅ PASS | 50 emails/sec achievable with batch processing and worker scaling |

**Design Quality Assessment**:
- **Database Schema**: Normalized, indexed, constrained; migration ready
- **API Contracts**: 7 endpoints with full request/response specs; error handling defined
- **State Machine**: 4 states, clear transitions, no ambiguity
- **Technology Choices**: All justified in research.md; builds on existing stack
- **Testing Strategy**: 8 test scenarios in quickstart; ready for implementation

**Ready for Phase 2**: ✅ YES - Proceed to `/speckit.tasks` to generate task breakdown

---

## Implementation Phases Summary

### Phase 0: Research ✅ COMPLETE
- **12 research decisions** documented with rationale and alternatives
- Key choices: csv-parse + xlsx, SSE, BullMQ batching, DO Spaces, streaming CSV
- Design simplifications: no cancellation, no retry, no input storage, ephemeral paste jobs
- All unknowns resolved

### Phase 1: Design ✅ COMPLETE
- **Data Model**: 2 tables (`bulk_jobs`, `verification_results`), 4-state machine, migration SQL
- **API Contracts**: 7 REST endpoints with full request/response specifications
- **Quickstart Guide**: Setup steps, 8 test scenarios, troubleshooting, frontend integration patterns
- **Agent Context**: Updated CLAUDE.md with TypeScript 5.x and bulk verification technologies

### Phase 2: Task Breakdown - NEXT STEP
Run `/speckit.tasks` to generate actionable task list from this plan

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **File Parsing** | csv-parse + xlsx | Streaming support, TypeScript, industry standard |
| **Progress Updates** | Server-Sent Events | Auto-reconnect, simpler than WebSockets |
| **Job Queue** | BullMQ Pro Groups | Existing pattern, fair queuing built-in |
| **Result Storage** | DigitalOcean Spaces | Already using for avatars, lifecycle policies |
| **CSV Generation** | csv-stringify streaming | Memory-efficient for 100K emails |
| **Cancellation** | Not supported | Simplifies state machine per user feedback |
| **Retry** | Not supported | Failures usually permanent, user can re-upload |
| **Input Storage** | Not stored | Privacy, cost, simplicity |
| **Paste Jobs** | Ephemeral (no history) | Reduces UI clutter |
| **Concurrency** | One job per user | DB constraint prevents races |

---

## Success Metrics (from spec.md)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Processing rate | ≥50 emails/sec | Average across full job |
| File upload/parsing | <30s for 10MB | Time from upload to job creation |
| Progress updates | Every 1% or 5s | SSE event frequency |
| Result download | <3s | Pre-signed URL generation time |
| Job success rate | ≥95% | completed / (completed + failed) |
| History page load | <2s for 100 jobs | Full page render time |

---

## Dependencies

**Required** (must be complete before implementation):
- ✅ Epic 001 (User Auth) - Session authentication
- ✅ Epic 002 (Verification Engine) - Single email verification
- ✅ Epic 003 (Billing) - Credit system and atomic deduction

**Infrastructure** (must be configured):
- ✅ PostgreSQL 16+
- ✅ Redis 7+ (BullMQ + credit cache)
- ✅ DigitalOcean Spaces (or S3-compatible storage)
- ⚠️ Spaces lifecycle policy (must configure for 14-day auto-deletion)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Worker overload with 100K jobs | Medium | High | Worker autoscaling 2-50; batch size tuning; load shedding at API layer |
| Result storage costs | Low | Medium | 14-day retention; lifecycle policies; gzip compression |
| SSE connection stability | Medium | Low | Auto-reconnect built-in; fallback to polling status endpoint |
| Large file parsing OOM | Low | High | Streaming parsers; 10MB file limit; memory monitoring |
| Upstream API failures | High | Medium | Existing circuit breaker; partial results saved; error logging |
| User tries to bypass one-job limit | Low | Low | Database unique constraint prevents races |

---

## Next Steps

1. **Review this plan** with team/stakeholders
2. **Run `/speckit.tasks`** to generate implementation task breakdown
3. **Prioritize tasks** by user story priority (P1 → P2 → P3)
4. **Implement Phase 3+** following task order
5. **Test with quickstart scenarios** as you build
6. **Deploy to staging** for QA
7. **Load test** with 100K emails
8. **Deploy to production**

---

**Plan Status**: ✅ COMPLETE - Ready for task generation
**Branch**: `004-bulk-verification`
**Next Command**: `/speckit.tasks`
**Last Updated**: 2026-02-02
