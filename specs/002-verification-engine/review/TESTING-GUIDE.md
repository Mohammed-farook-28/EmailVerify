# Testing Guide - Epic 2 Post-MVP Features

**Date**: February 1, 2026
**Phases**: 5-9 (Dashboard, Resilience, Reconciliation, Retention, Cookie Policy)

---

## Prerequisites

1. **PostgreSQL** running on port 5432
2. **Redis** running on port 6379
3. **Environment variables** configured in `backend/.env`

---

## Quick Start (All Services)

### Terminal 1: Backend API
```bash
cd backend
npm run dev
```
Expected output:
- `EmailKit backend running on port 3000 [development]`
- OpenTelemetry initialized
- No errors

### Terminal 2: Verification Worker
```bash
cd backend
npm run workers
```
Expected output:
- `Worker started with concurrency 50`
- Connected to queue

### Terminal 3: DLQ Worker (Optional)
```bash
cd backend
npm run workers:dlq
```
Expected output:
- `DLQ worker started`

### Terminal 4: Reconciliation Worker (Optional)
```bash
cd backend
npm run workers:reconcile
```
Expected output:
- `Reconciliation worker started`
- `Reconciliation cron job scheduled (every 5 minutes)`

### Terminal 5: Cleanup Worker (Optional)
```bash
cd backend
npm run workers:cleanup
```
Expected output:
- `Cleanup worker started`
- `Cleanup cron job scheduled (daily at 2 AM UTC)`

### Terminal 6: Frontend
```bash
cd ../EmailVerify-Frontend
npm run dev
```
Expected output:
- `Ready on http://localhost:3001`

---

## Test 1: Dashboard Metrics (Phase 5)

### Backend API Tests

```bash
# Get dashboard stats
curl http://localhost:3000/api/dashboard/stats?range=30

# Expected response:
{
  "success": true,
  "stats": {
    "credits": 100,
    "totalVerifications": 0,
    "apiCalls": 0,
    "periodVerifications": 0
  },
  "range": 30
}

# Get status distribution
curl http://localhost:3000/api/dashboard/metrics/distribution?range=30

# Expected response:
{
  "success": true,
  "distribution": [],
  "range": 30
}

# Get verification trend
curl http://localhost:3000/api/dashboard/metrics/trend?range=7

# Expected response:
{
  "success": true,
  "trend": [],
  "range": 7
}
```

### Frontend UI Tests

1. **Navigate to Dashboard**
   - Go to `http://localhost:3001/home`
   - Should show dashboard (not redirect to quick-verify)

2. **Verify Stats Cards**
   - Should see 3 cards:
     - Credits Available
     - Total Verifications
     - Verifications (30d)
   - Values should match your current state

3. **Test Empty States**
   - With no verifications, charts should show:
     - Distribution: "No data available"
     - Trend: "Start verifying to see trends"

4. **Perform Verifications**
   - Navigate to Quick Verify
   - Verify 5-10 emails
   - Return to dashboard
   - Charts should now show data

5. **Test Time Range Selector**
   - Click "7 days", "30 days", "90 days" buttons on trend chart
   - Chart should update with different data

6. **Verify Distribution Chart**
   - Should show donut chart with status breakdown
   - Center should display valid percentage
   - Legend should show counts and percentages
   - Colors: Green (valid), Red (invalid), Yellow (risky), Purple (unknown)

---

## Test 2: System Resilience (Phase 6)

### DLQ and Refunds

1. **Stop Mock Upstream API**
   ```bash
   # Stop the mock upstream API if running
   pkill -f mock-upstream-api
   ```

2. **Trigger Failure**
   - Verify an email via Quick Verify
   - Job should fail after 3 retry attempts
   - Check logs for retry messages

3. **Check DLQ**
   ```bash
   # Check DLQ metrics
   curl http://localhost:3000/metrics | grep dlq
   ```
   Should see:
   - `emailkit_dlq_depth` - DLQ job count
   - `emailkit_dlq_processed_total` - Jobs processed

4. **Verify Credit Refund**
   - Check your credit balance before verification
   - After job fails permanently, credit should be refunded
   - Check credit history for refund event

### Load Shedding

**Note**: This is hard to test locally without 1M+ jobs. Skip unless needed.

---

## Test 3: Credit Reconciliation (Phase 7)

### Manual Drift Test

1. **Create Drift**
   ```bash
   # Connect to Redis
   redis-cli

   # Get current balance for a user
   GET credit:balance:your-user-id

   # Manually set wrong balance
   SET credit:balance:your-user-id 999
   ```

2. **Wait for Reconciliation**
   - Wait 5 minutes (or restart reconciliation worker)
   - Check logs for reconciliation run

3. **Verify Correction**
   ```bash
   # Check Redis balance again
   redis-cli GET credit:balance:your-user-id

   # Should match PostgreSQL balance
   ```

4. **Check Metrics**
   ```bash
   curl http://localhost:3000/metrics | grep reconciliation
   ```
   Should see:
   - `emailkit_reconciliation_drift` - Drift amount
   - `emailkit_reconciliation_corrections_total` - Corrections made

---

## Test 4: Data Retention (Phase 8)

### Manual Cleanup Test

1. **Create Old Data**
   ```sql
   -- Connect to PostgreSQL
   psql emailkit

   -- Create old verification results (91 days old)
   INSERT INTO verification_result (
     id, user_id, email, status, score, deliverability,
     attributes, server_info, created_at
   )
   VALUES (
     'test-old-1',
     'your-user-id',
     'old@test.com',
     'valid',
     95,
     'deliverable',
     '{}',
     '{}',
     NOW() - INTERVAL '91 days'
   );
   ```

2. **Trigger Cleanup**
   - Wait until 2 AM UTC (or restart cleanup worker with manual trigger)
   - Or directly run cleanup:
   ```bash
   # In PostgreSQL
   SELECT * FROM verification_result WHERE created_at < NOW() - INTERVAL '30 days';
   ```

3. **Verify Deletion**
   - Old records (>30 days by default) should be deleted
   - Recent records should remain

4. **Check Logs**
   ```bash
   # Search for cleanup logs
   # Should show deleted count
   ```

---

## Test 5: Cookie Policy (Phase 9)

### Frontend Tests

1. **Clear Browser Storage**
   - Open DevTools → Application → Local Storage
   - Delete `emailkit-cookie-consent` key

2. **First Visit**
   - Refresh page
   - Cookie modal should appear at bottom
   - Modal should show:
     - Title: "Cookie policy"
     - Description with policy link
     - "Accept" button (green)
     - "Reject" button (white border)
     - Close X button (top-right)

3. **Accept Flow**
   - Click "Accept"
   - Modal should close
   - Check localStorage:
     ```javascript
     JSON.parse(localStorage.getItem('emailkit-cookie-consent'))
     // Should show: { accepted: true, timestamp: <number> }
     ```
   - Refresh page → Modal should NOT appear

4. **Reject Flow**
   - Clear localStorage again
   - Click "Reject"
   - Modal should close
   - Check localStorage:
     ```javascript
     JSON.parse(localStorage.getItem('emailkit-cookie-consent'))
     // Should show: { accepted: false, timestamp: <number> }
     ```
   - Console should show: "Analytics disabled"

5. **Expiry Test**
   - Manually edit localStorage to make consent expired:
     ```javascript
     const consent = JSON.parse(localStorage.getItem('emailkit-cookie-consent'));
     consent.timestamp = Date.now() - (366 * 24 * 60 * 60 * 1000); // 366 days ago
     localStorage.setItem('emailkit-cookie-consent', JSON.stringify(consent));
     ```
   - Refresh page → Modal should appear again

---

## Test 6: Health Checks

```bash
# Liveness probe (always 200)
curl http://localhost:3000/health/live

# Readiness probe (200 if PostgreSQL + Redis connected)
curl http://localhost:3000/health/ready

# Startup probe (200 if workers connected)
curl http://localhost:3000/health/startup

# Metrics (Prometheus format)
curl http://localhost:3000/metrics
```

Expected metrics to verify:
- `emailkit_queue_depth` - Queue depth by status
- `emailkit_dlq_depth` - DLQ depth
- `emailkit_reconciliation_drift` - Reconciliation drift
- `emailkit_credit_refunds_total` - Credit refunds
- `emailkit_load_shedding_total` - Load shedding events

---

## Test 7: Integration Test (End-to-End)

### Complete User Flow

1. **Sign in** to the application
2. **View Dashboard** → Should show empty state
3. **Perform 10 verifications** via Quick Verify
4. **Return to Dashboard**:
   - Stats cards should show: 10 verifications
   - Distribution chart should show status breakdown
   - Trend chart should show daily counts
5. **Change time range** → Charts update
6. **Check Recent Results** in Quick Verify → Shows last 10
7. **Check Credit Balance** → Decreased by 10
8. **Wait 5 minutes** → Reconciliation runs (check logs)
9. **Check Metrics endpoint** → All metrics present

---

## Troubleshooting

### Backend won't start
- Check PostgreSQL is running: `pg_isready`
- Check Redis is running: `redis-cli ping`
- Check environment variables in `backend/.env`
- Check logs for specific errors

### Workers won't connect
- Ensure Redis is accessible
- Check Redis maxmemory policy: `redis-cli CONFIG GET maxmemory-policy`
- Should be `noeviction`

### Dashboard shows no data
- Verify API endpoints return data: `curl http://localhost:3000/api/dashboard/stats`
- Check browser console for errors
- Verify TanStack Query is fetching: DevTools → Network tab

### Charts not rendering
- Check Recharts is installed: `npm list recharts`
- Verify data format matches chart expectations
- Check browser console for React errors

### Cookie modal not showing
- Clear localStorage completely
- Hard refresh (Cmd+Shift+R / Ctrl+Shift+F5)
- Check console for JavaScript errors

---

## Performance Benchmarks

Expected performance (local development):

- Dashboard stats API: < 100ms
- Distribution API: < 200ms
- Trend API: < 300ms
- Reconciliation (1000 users): < 5s
- Cleanup (1000 records): < 2s

---

## Success Criteria Checklist

### Phase 5 (Dashboard)
- [ ] Dashboard displays instead of redirecting
- [ ] 3 stats cards show correct values
- [ ] Distribution chart shows status breakdown
- [ ] Trend chart shows daily counts
- [ ] Time range selector works (7/30/90 days)
- [ ] Empty states display correctly
- [ ] Loading states work

### Phase 6 (Resilience)
- [ ] Failed jobs retry 3 times
- [ ] Permanent failures trigger refunds
- [ ] DLQ metrics track job count
- [ ] Load shedding prevents credit deduction
- [ ] Error classification works correctly

### Phase 7 (Reconciliation)
- [ ] Reconciliation runs every 5 minutes
- [ ] Drift detected and corrected
- [ ] Metrics track drift amounts
- [ ] Severity levels log correctly

### Phase 8 (Retention)
- [ ] Cleanup runs (or can be triggered manually)
- [ ] Old data deleted correctly
- [ ] Recent data preserved
- [ ] User retention policy respected

### Phase 9 (Cookie Policy)
- [ ] Modal shows on first visit
- [ ] Accept stores consent
- [ ] Reject stores rejection
- [ ] Consent expires after 1 year
- [ ] Modal doesn't show after consent

---

## Next Steps After Testing

1. **Fix any issues found** during testing
2. **Document edge cases** discovered
3. **Consider Phase 10**: Comprehensive automated testing
4. **Consider Phase 11**: Production polish (OpenTelemetry, OpenAPI, security)
5. **Deploy to staging** for end-to-end testing
6. **Load test** with realistic traffic patterns

---

**Happy Testing!** 🚀
