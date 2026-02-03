# Bulk Verification MVP - Testing Guide

## Prerequisites

1. **PostgreSQL Running**: Database should be accessible at the connection string in `.env`
2. **Redis Running**: Redis should be accessible at `localhost:6379`
3. **Environment Variables**: All required variables configured in `backend/.env`

## Setup

### 1. Start Backend Services

```bash
# Terminal 1: Start the API server
cd backend
npm run dev

# Terminal 2: Start the verification worker (single emails)
cd backend
npm run workers

# Terminal 3: Start the bulk verification worker
cd backend
npm run workers:bulk

# Terminal 4: Start the mock upstream API (for testing)
cd backend
npm run mock:upstream
```

### 2. Start Frontend

```bash
# Terminal 5: Start the frontend
cd EmailVerify-Frontend
npm run dev
```

## Test Scenarios

### Scenario 1: Small File Upload (Happy Path)

1. **Create test CSV**:
   ```csv
   email
   test1@example.com
   test2@example.com
   test3@example.com
   test4@example.com
   test5@example.com
   ```

2. **Upload via UI**:
   - Navigate to `http://localhost:3001/home/bulk-verify`
   - Drag and drop the CSV file
   - Click "Start Verification"
   - Should redirect to progress page

3. **Verify Progress**:
   - Progress bar should update in real-time
   - Should see Live indicator
   - Counts should update (Valid, Invalid, Risky, Unknown)

4. **Download Results**:
   - Wait for completion (100%)
   - Download button should appear
   - Click download to get results CSV
   - Verify CSV contains all emails with verification results

### Scenario 2: Large File (100 emails)

1. **Generate large CSV**:
   ```bash
   # Create test file with 100 emails
   echo "email" > test-100.csv
   for i in {1..100}; do echo "test${i}@example.com" >> test-100.csv; done
   ```

2. **Upload and verify**:
   - Upload the 100-email file
   - Verify credits are deducted (100 credits)
   - Monitor progress updates
   - Verify batch processing (should process in batches of 100)

### Scenario 3: Invalid File Format

1. **Test rejection**:
   - Try uploading a `.txt` file
   - Should show error: "Unsupported file format"
   - Try uploading a CSV with no valid emails
   - Should show error: "Only X% of entries appear to be valid emails"

### Scenario 4: Insufficient Credits

1. **Deplete credits**:
   - Verify with more emails than available credits
   - Should show error: "Insufficient credits"
   - No credits should be deducted

### Scenario 5: Concurrent Job Prevention

1. **Start first job**:
   - Upload a file (e.g., 50 emails)
   - Immediately try uploading another file
   - Should show error: "You already have an active verification job"

2. **Wait for completion**:
   - Wait for first job to complete
   - Try uploading new file
   - Should succeed

### Scenario 6: Progress Reconnection

1. **Simulate disconnect**:
   - Start a bulk job
   - Close the browser tab
   - Reopen and navigate to the job URL: `/home/bulk-verify/[jobId]`
   - Progress should reconnect and show current state

### Scenario 7: Excel File Upload

1. **Create Excel file** with emails in first column
2. Upload `.xlsx` file
3. Verify parsing and verification works

## Backend API Testing (Direct)

### Upload File

```bash
curl -X POST http://localhost:3000/api/bulk/upload \
  -F "file=@test.csv" \
  -b "cookies.txt"
```

### Get Job Status

```bash
curl http://localhost:3000/api/bulk/jobs/{jobId} \
  -b "cookies.txt"
```

### Stream Progress (SSE)

```bash
curl -N http://localhost:3000/api/bulk/jobs/{jobId}/progress \
  -b "cookies.txt"
```

### Download Results

```bash
curl http://localhost:3000/api/bulk/jobs/{jobId}/results \
  -b "cookies.txt" \
  -L -o results.csv
```

## Verification Checklist

- [ ] File upload accepts CSV and Excel files
- [ ] File upload rejects invalid formats
- [ ] Credits are deducted before processing starts
- [ ] Only one job per user allowed at a time
- [ ] Progress updates stream in real-time (SSE)
- [ ] Progress updates at least every 1% or 5 seconds
- [ ] Worker processes emails in batches of 100
- [ ] All email results are stored in database
- [ ] Results CSV is generated and uploaded to S3
- [ ] Download provides pre-signed S3 URL
- [ ] Results expire after 14 days
- [ ] Circuit breaker is respected (emails marked unknown when open)
- [ ] Error handling works for failed emails
- [ ] UI shows live connection status
- [ ] UI displays all counts (valid, invalid, risky, unknown)
- [ ] UI allows downloading results
- [ ] Navigation works (back to bulk verify page)

## Known Limitations (MVP)

1. **No job history**: Only active job is shown
2. **No pause/resume**: Jobs run to completion
3. **No filtering**: Results download includes all emails
4. **S3 configuration**: Requires manual DigitalOcean Spaces setup
5. **No retry logic**: Failed jobs are not automatically retried

## Troubleshooting

### Worker not processing jobs

- Check Redis connection
- Verify `REDIS_HOST` and `REDIS_PORT` in `.env`
- Check worker logs for errors
- Ensure `npm run workers:bulk` is running

### Progress not streaming

- Check SSE connection in browser DevTools (Network tab)
- Verify backend logs for connection
- Check CORS configuration
- Ensure session cookies are being sent

### File upload fails

- Check file size (max 10MB)
- Verify file format (CSV, XLSX, XLS)
- Check multer configuration
- Verify temp directory permissions

### S3 upload fails

- Check DigitalOcean Spaces credentials
- Verify `SPACES_*` environment variables
- Check bucket exists and is accessible
- Verify IAM permissions for upload

## Success Criteria

MVP is successful when:
1. ✅ User can upload CSV/Excel files
2. ✅ Real-time progress updates work
3. ✅ Results can be downloaded
4. ✅ Credits are properly deducted
5. ✅ One job per user limit enforced
6. ✅ All 100 test emails verify correctly
7. ✅ Results available for 14 days
