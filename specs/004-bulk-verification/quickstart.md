# Quickstart: Bulk Email Verification

**Feature**: 004-bulk-verification
**Date**: 2026-02-02
**For**: Developers implementing or testing bulk verification

---

## Prerequisites

Before implementing bulk verification, ensure:

✅ **Epic 001 (User Auth)** is complete
- Users can authenticate via session cookies
- `users` table exists in PostgreSQL

✅ **Epic 002 (Verification Engine)** is complete
- Single email verification works end-to-end
- Workers process verification jobs via BullMQ
- Circuit breaker handles upstream failures

✅ **Epic 003 (Billing)** is complete
- Credit system operational (Redis + PostgreSQL)
- Atomic credit deduction via Lua script works
- Credit events tracked in `credit_events` table

✅ **Infrastructure** is ready
- PostgreSQL 16+ running
- Redis 7+ running (for BullMQ and credit cache)
- DigitalOcean Spaces configured (or S3-compatible storage)
- Backend server running at `http://localhost:3000`

---

## Setup Steps

### 1. Install Dependencies

```bash
cd backend
npm install csv-parse xlsx csv-stringify @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Package Purposes**:
- `csv-parse`: Parse CSV files with streaming support
- `xlsx`: Parse Excel files (.xlsx, .xls)
- `csv-stringify`: Generate CSV output for results
- `@aws-sdk/client-s3`: Upload/download from DigitalOcean Spaces
- `@aws-sdk/s3-request-presigner`: Generate pre-signed download URLs

### 2. Configure Environment Variables

Add to `backend/.env`:

```bash
# DigitalOcean Spaces (or S3)
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_REGION=us-east-1
SPACES_ACCESS_KEY=your_access_key
SPACES_SECRET_KEY=your_secret_key
SPACES_BUCKET=emailkit-results

# Bulk verification settings
BULK_MAX_FILE_SIZE_MB=10
BULK_MAX_EMAILS_PER_JOB=100000
BULK_BATCH_SIZE=100
BULK_RESULT_RETENTION_DAYS=14
```

### 3. Run Database Migration

```bash
cd backend
npm run db:migrate

# This applies the migration at:
# drizzle/0003_bulk_verification.sql
```

**Migration creates**:
- `bulk_jobs` table
- `verification_results` table
- Indexes and constraints

**Verify migration**:
```sql
-- Check tables exist
\dt bulk_jobs
\dt verification_results

-- Check unique constraint for one active job per user
\d bulk_jobs
```

### 4. Configure Spaces Lifecycle Policy

In DigitalOcean Spaces control panel (or AWS S3):

1. Navigate to your bucket (`emailkit-results`)
2. Go to Settings → Lifecycle Rules
3. Add rule:
   - Name: `DeleteOldResults`
   - Prefix: `results/`
   - Expiration: 14 days

**Verification**:
```bash
# Test upload
aws s3 cp test.txt s3://emailkit-results/results/test.txt \
  --endpoint-url https://nyc3.digitaloceanspaces.com

# List files
aws s3 ls s3://emailkit-results/results/ \
  --endpoint-url https://nyc3.digitaloceanspaces.com
```

### 5. Start Backend Services

Ensure all services running:

```bash
# Terminal 1: PostgreSQL (if not running as service)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:16

# Terminal 2: Redis (if not running as service)
docker run -d -p 6379:6379 redis:7

# Terminal 3: Backend server
cd backend
npm run dev

# Terminal 4: BullMQ workers
cd backend
npm run workers

# Terminal 5 (optional): Stripe webhook forwarding for billing
stripe listen --forward-to http://localhost:3000/api/billing/webhook
```

### 6. Verify Setup

Run verification checks:

```bash
# Check database connection
psql -h localhost -U postgres -d emailkit -c "SELECT COUNT(*) FROM bulk_jobs;"

# Check Redis connection
redis-cli PING

# Check Spaces connection
curl -I https://nyc3.digitaloceanspaces.com/emailkit-results/
```

---

## Testing the Feature

### Test 1: File Upload (Happy Path)

**Prepare test CSV**:
```csv
email
john@gmail.com
jane@yahoo.com
bob@outlook.com
alice@protonmail.com
test@invalid-domain-xyz.com
```

Save as `test-emails.csv`

**Upload via cURL**:
```bash
# First, get session cookie by logging in
# Then:

curl -X POST http://localhost:3000/api/bulk/upload \
  -H "Cookie: session=your_session_cookie" \
  -F "file=@test-emails.csv"

# Expected response:
# {
#   "jobId": "01HN8X9V3Z5Q6P2R4S7T8W9Y0A",
#   "totalCount": 5,
#   "creditsDeducted": 5,
#   "status": "pending",
#   "message": "Job created successfully. Processing will begin shortly."
# }
```

**Monitor progress**:
```bash
# Get job status
curl http://localhost:3000/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A \
  -H "Cookie: session=..."

# Stream progress (use another terminal)
curl -N http://localhost:3000/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A/progress \
  -H "Cookie: session=..."
```

**Download results**:
```bash
curl http://localhost:3000/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A/results \
  -H "Cookie: session=..." \
  -o results.csv
```

**Expected outcome**:
- ✅ Job created with 5 credits deducted
- ✅ Worker picks up job and processes 5 emails
- ✅ Progress stream emits events
- ✅ Job completes with status='completed'
- ✅ Results CSV contains all 5 emails with verification outcomes
- ✅ Result file stored in Spaces at `results/{jobId}.csv.gz`

---

### Test 2: Paste Emails

**Test with cURL**:
```bash
curl -X POST http://localhost:3000/api/bulk/paste \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json" \
  -d '{
    "emails": "john@example.com\njane@test.com, bob@company.org; alice@domain.io"
  }'

# Expected response:
# {
#   "jobId": "01HN8X9V3Z5Q6P2R4S7T8W9Y0B",
#   "totalCount": 4,
#   "creditsDeducted": 4,
#   "status": "pending",
#   "message": "Job created successfully. Processing will begin shortly."
# }
```

**Verify paste job behavior**:
```bash
# Get job history (should NOT include paste job)
curl http://localhost:3000/api/bulk/jobs \
  -H "Cookie: session=..."

# History should be empty or only show file uploads
# Paste jobs are excluded from history
```

**Expected outcome**:
- ✅ Job created with 4 credits deducted
- ✅ Job processes normally
- ✅ Results downloadable
- ✅ Job NOT visible in history (sourceType='paste')

---

### Test 3: Insufficient Credits

**Setup**:
1. Reduce user's credit balance to 10
2. Try to upload file with 100 emails

**Test with cURL**:
```bash
curl -X POST http://localhost:3000/api/bulk/upload \
  -H "Cookie: session=..." \
  -F "file=@large-file.csv"

# Expected response:
# HTTP 402 Payment Required
# {
#   "error": "INSUFFICIENT_CREDITS",
#   "message": "Insufficient credits. Required: 100, Available: 10"
# }
```

**Expected outcome**:
- ✅ Job NOT created
- ✅ Credits NOT deducted
- ✅ User receives clear error message

---

### Test 4: Active Job Constraint

**Setup**:
1. Create a bulk job (it will be 'pending' or 'processing')
2. Try to create another job before the first completes

**Test with cURL**:
```bash
# First job
curl -X POST http://localhost:3000/api/bulk/upload \
  -H "Cookie: session=..." \
  -F "file=@test1.csv"

# Immediately try second job
curl -X POST http://localhost:3000/api/bulk/upload \
  -H "Cookie: session=..." \
  -F "file=@test2.csv"

# Expected response for second request:
# HTTP 409 Conflict
# {
#   "error": "ACTIVE_JOB_EXISTS",
#   "message": "You already have a bulk verification job in progress. Please wait for it to complete.",
#   "activeJobId": "01HN8X9V3Z5Q6P2R4S7T8W9Y0A"
# }
```

**Expected outcome**:
- ✅ First job created successfully
- ✅ Second job rejected with 409 error
- ✅ User informed of active job
- ✅ After first job completes, second job can be created

---

### Test 5: Excel File Upload

**Prepare test Excel**:
1. Create Excel file with emails in column A
2. Save as `test-emails.xlsx`

**Test with cURL**:
```bash
curl -X POST http://localhost:3000/api/bulk/upload \
  -H "Cookie: session=..." \
  -F "file=@test-emails.xlsx" \
  -F "emailColumn=0"  # First column

# Expected response: Same as CSV upload
```

**Test multi-sheet Excel**:
1. Create Excel with 3 sheets
2. Put emails on Sheet 2 (NOT first sheet)

**Expected outcome**:
- ✅ System processes ONLY first sheet
- ✅ Emails on Sheet 2 are ignored
- ✅ User must ensure emails are on first sheet

---

### Test 6: Real-time Progress Stream

**Frontend test** (use browser or EventSource):

```typescript
const eventSource = new EventSource(
  'http://localhost:3000/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A/progress',
  { withCredentials: true }
);

eventSource.addEventListener('progress', (event) => {
  console.log('Progress:', JSON.parse(event.data));
});

eventSource.addEventListener('complete', (event) => {
  console.log('Complete:', JSON.parse(event.data));
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  console.error('Error or reconnecting:', event);
});
```

**Expected outcome**:
- ✅ Progress events received every 1% or 5 seconds
- ✅ `percentage`, `processedCount`, `processingRate`, `estimatedSecondsRemaining` update
- ✅ `complete` event received when job finishes
- ✅ Connection auto-reconnects if network drops

---

### Test 7: Result Expiration (Manual Test)

**Setup** (requires DB manipulation for fast testing):
```sql
-- Fast-forward result expiration
UPDATE bulk_jobs
SET result_expires_at = NOW() - INTERVAL '1 day'
WHERE id = '01HN8X9V3Z5Q6P2R4S7T8W9Y0A';
```

**Test download**:
```bash
curl http://localhost:3000/api/bulk/jobs/01HN8X9V3Z5Q6P2R4S7T8W9Y0A/results \
  -H "Cookie: session=..."

# Expected response:
# HTTP 410 Gone
# {
#   "error": "RESULTS_EXPIRED",
#   "message": "Results have expired (14-day limit)"
# }
```

**Check history**:
```bash
curl http://localhost:3000/api/bulk/jobs \
  -H "Cookie: session=..."

# Job still appears in history, but resultAvailable=false
```

**Expected outcome**:
- ✅ Download fails with 410 error
- ✅ Job metadata still visible in history
- ✅ `resultAvailable: false` in history response

---

### Test 8: Column Validation Warning

**Prepare problematic CSV**:
```csv
email,name,company
john@gmail.com,John Doe,Acme
invalid-not-email,Jane Smith,TechCorp
another-bad-value,Bob Johnson,StartupInc
alice@yahoo.com,Alice Brown,EnterpriseCo
```

Only 2 out of 4 rows have valid emails (50%)

**Test upload**:
```bash
curl -X POST http://localhost:3000/api/bulk/upload \
  -H "Cookie: session=..." \
  -F "file=@problematic.csv" \
  -F "emailColumn=email"

# Expected response:
# HTTP 422 Unprocessable Entity
# {
#   "error": "COLUMN_VALIDATION_FAILED",
#   "message": "Selected column has <50% valid emails",
#   "details": {
#     "validPercentage": 50,
#     "threshold": 50,
#     "canProceed": false
#   }
# }
```

**With override** (if we implement "warn but allow"):
```bash
curl -X POST http://localhost:3000/api/bulk/upload \
  -H "Cookie: session=..." \
  -F "file=@problematic.csv" \
  -F "emailColumn=email" \
  -F "allowLowValidation=true"

# Job created, but invalid rows will fail verification
```

**Expected outcome**:
- ✅ Validation prevents job creation if <50% valid
- ✅ User receives clear error with percentage
- ✅ With override flag, job proceeds (invalid emails fail verification)

---

## Frontend Integration

### 1. File Upload Page

Location: `frontend/src/app/(dashboard)/home/bulk-verify/page.tsx`

**Key features**:
- Drag-and-drop CSV/Excel upload
- Column mapping UI (if auto-detection fails)
- Validation before submit
- Credit balance check
- Active job detection

**Example component**:
```typescript
import { useFileUpload } from '@/hooks/useBulkVerification';

export default function BulkVerifyPage() {
  const upload = useFileUpload();

  const handleUpload = async (file: File, columnIndex: number) => {
    try {
      const result = await upload.mutateAsync({ file, columnIndex });
      router.push(`/home/bulk-verify/${result.jobId}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <FileDropzone onUpload={handleUpload} />
      {/* Column mapping UI */}
    </div>
  );
}
```

### 2. Progress Page

Location: `frontend/src/app/(dashboard)/home/bulk-verify/[jobId]/page.tsx`

**Key features**:
- Real-time progress bar (SSE connection)
- Processing rate and ETA display
- Result counts (valid/invalid/risky/unknown)
- Download button when complete

**Example component**:
```typescript
import { useProgressStream } from '@/hooks/useProgressStream';

export default function ProgressPage({ params }: { params: { jobId: string } }) {
  const { progress, isComplete } = useProgressStream(params.jobId);

  return (
    <div>
      <ProgressBar percentage={progress.percentage} />
      <div>
        {progress.processedCount} / {progress.totalCount} emails processed
      </div>
      <div>Rate: {progress.processingRate.toFixed(1)} emails/sec</div>
      <div>ETA: {progress.estimatedSecondsRemaining}s</div>

      {isComplete && (
        <Button onClick={downloadResults}>Download Results</Button>
      )}
    </div>
  );
}
```

### 3. History Page

Location: `frontend/src/app/(dashboard)/home/history/page.tsx`

**Key features**:
- Paginated job list
- Search by filename
- Filter by status
- Download results for completed jobs
- "Results expired" indicator

**Example component**:
```typescript
import { useJobHistory } from '@/hooks/useJobHistory';

export default function HistoryPage() {
  const [page, setPage] = useState(0);
  const { data, isLoading } = useJobHistory({ limit: 10, offset: page * 10 });

  return (
    <div>
      <SearchInput />
      <StatusFilter />
      <JobTable jobs={data.jobs} />
      <Pagination
        total={data.pagination.total}
        current={page}
        onChange={setPage}
      />
    </div>
  );
}
```

---

## Troubleshooting

### Problem: Job stuck in 'pending' status

**Possible causes**:
1. Workers not running
2. BullMQ connection lost
3. Job not picked up

**Debug steps**:
```bash
# Check workers are running
ps aux | grep node | grep worker

# Check BullMQ queues in Redis
redis-cli
> KEYS bull:*
> HGETALL bull:bulk-verification:01HN8X9V3Z5Q6P2R4S7T8W9Y0A

# Check worker logs
tail -f backend/logs/worker.log
```

---

### Problem: Progress stream not updating

**Possible causes**:
1. SSE connection closed
2. Proxy buffering (if using nginx)
3. Browser blocking EventSource

**Debug steps**:
```bash
# Test SSE directly with curl
curl -N http://localhost:3000/api/bulk/jobs/{jobId}/progress \
  -H "Cookie: session=..."

# Check nginx config (if applicable)
# Add to nginx.conf:
proxy_buffering off;
proxy_cache off;
```

---

### Problem: Results download fails

**Possible causes**:
1. Results expired (>14 days)
2. S3/Spaces connection issue
3. Pre-signed URL generation failed

**Debug steps**:
```bash
# Check result file exists in Spaces
aws s3 ls s3://emailkit-results/results/ \
  --endpoint-url https://nyc3.digitaloceanspaces.com

# Check database
psql -d emailkit -c "SELECT result_url, result_expires_at FROM bulk_jobs WHERE id = '01HN8X9V3Z5Q6P2R4S7T8W9Y0A';"

# Test pre-signed URL generation
node -e "
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = new S3Client({ /* config */ });
getSignedUrl(s3, new GetObjectCommand({ Bucket: 'emailkit-results', Key: 'results/test.csv' }), { expiresIn: 3600 })
  .then(console.log);
"
```

---

### Problem: Credits not deducted

**Possible causes**:
1. Redis Lua script not working
2. Redis connection lost
3. Transaction not committed

**Debug steps**:
```bash
# Check Redis credit balance
redis-cli
> GET user:{userId}:credits

# Check PostgreSQL credit_events
psql -d emailkit -c "SELECT * FROM credit_events WHERE user_id = '{userId}' ORDER BY created_at DESC LIMIT 10;"

# Test Lua script directly
redis-cli --eval backend/scripts/deduct-credits.lua , user:123 1000
```

---

### Problem: Active job constraint not working

**Possible causes**:
1. Unique index not created
2. Status not being updated
3. Database replication lag

**Debug steps**:
```sql
-- Check unique index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'bulk_jobs'
  AND indexname = 'idx_one_active_job_per_user';

-- Check active jobs for user
SELECT id, status, created_at
FROM bulk_jobs
WHERE user_id = '{userId}'
  AND status IN ('pending', 'processing');
```

---

## Performance Benchmarks

Target performance (from success criteria):

| Metric | Target | Measurement |
|--------|--------|-------------|
| File upload/parsing | <30s for 10MB | Time from upload start to job creation |
| Processing rate | ≥50 emails/sec | Average across full job |
| Progress update frequency | Every 1% or 5s | Time between SSE events |
| Result download | <3s | Time to generate pre-signed URL |
| Job history load | <2s | Time to fetch and render 100 jobs |

**Load testing**:
```bash
# Use Apache Bench to test concurrent uploads
ab -n 100 -c 10 -p test.csv -T multipart/form-data \
  http://localhost:3000/api/bulk/upload
```

---

## Next Steps

After completing implementation and testing:

1. ✅ Run `/speckit.tasks` to generate implementation task breakdown
2. ✅ Implement tasks in priority order (P1 → P2 → P3)
3. ✅ Write unit tests for file parsing, CSV generation, progress calculation
4. ✅ Write integration tests for API endpoints
5. ✅ Write E2E tests for full upload-to-download flow
6. ✅ Load test with 100K emails to verify performance targets
7. ✅ Security audit: input validation, file upload limits, authorization checks
8. ✅ Deploy to staging and run manual QA
9. ✅ Update user documentation
10. ✅ Deploy to production

---

## Resources

- [csv-parse documentation](https://csv.js.org/parse/)
- [xlsx (SheetJS) documentation](https://docs.sheetjs.com/)
- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [BullMQ Pro Groups](https://docs.bullmq.io/bullmq-pro/groups)
- [AWS SDK S3 Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
- [DigitalOcean Spaces Guide](https://docs.digitalocean.com/products/spaces/)
- [Feature Specification](./spec.md)
- [Data Model](./data-model.md)
- [API Contracts](./contracts/api-endpoints.md)

---

## Support

For questions or issues during implementation:

1. Check this quickstart guide
2. Review the [feature specification](./spec.md)
3. Check the [research document](./research.md) for design rationale
4. Consult the [API contracts](./contracts/api-endpoints.md) for endpoint details
5. Review the [data model](./data-model.md) for schema questions

---

**Last Updated**: 2026-02-02
**Status**: Ready for implementation
