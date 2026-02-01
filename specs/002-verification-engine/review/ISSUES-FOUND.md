# Issues Found - Epic 2 Post-MVP Implementation

**Date**: February 1, 2026
**Review Type**: Edge Cases & Bug Analysis
**Reviewer**: Code Review

---

## 🔴 Critical Issues (Must Fix)

### 1. **Double Refund Vulnerability** (Phase 6 - DLQ Handler)

**File**: `backend/src/workers/dlq-handler.ts`
**Line**: 106

**Problem**:
The DLQ worker can refund credits multiple times for the same failed job. There's no idempotency check.

```typescript
// Current code - NO idempotency check
await refundCredits(job.data.userId, 1, `verification_failed:${job.id}`);
```

**Impact**:
- User could get refunded twice if DLQ job is processed twice
- Financial loss for the platform
- Credit balance corruption

**How it happens**:
1. Job fails → moves to DLQ
2. DLQ worker processes it → refunds 1 credit
3. If DLQ worker crashes and restarts
4. Same job processes again → refunds ANOTHER credit

**Fix Required**:
```typescript
// Check if refund already exists
const existingRefund = await db
  .select()
  .from(creditEvent)
  .where(eq(creditEvent.referenceId, `verification_failed:${job.id}`))
  .limit(1);

if (existingRefund.length > 0) {
  // Already refunded, skip
  return;
}

await refundCredits(job.data.userId, 1, `verification_failed:${job.id}`);
```

---

### 2. **Cleanup Infinite Loop Risk** (Phase 8 - Retention)

**File**: `backend/src/services/retention-cleanup.ts`
**Line**: 97-126

**Problem**:
The cleanup batch loop deletes ALL matching records each time, not in batches. It relies on `rowCount` but if PostgreSQL doesn't support this or returns unexpected values, it could loop infinitely or delete incorrectly.

```typescript
while (true) {
  const deleted = await db
    .delete(verificationResult)
    .where(
      and(
        eq(verificationResult.userId, userId),
        lt(verificationResult.createdAt, cutoffDate)
      )
    )
    .execute();

  const deletedCount = deleted.rowCount || 0;

  // If rowCount is always > BATCH_SIZE, infinite loop!
  if (deletedCount < BATCH_SIZE) {
    break;
  }
}
```

**Impact**:
- Worker could run forever
- Database could be locked
- All old data deleted in one transaction (not batched)

**Fix Required**:
```typescript
// Use LIMIT in the delete query
while (true) {
  const toDelete = await db
    .select({ id: verificationResult.id })
    .from(verificationResult)
    .where(
      and(
        eq(verificationResult.userId, userId),
        lt(verificationResult.createdAt, cutoffDate)
      )
    )
    .limit(BATCH_SIZE)
    .execute();

  if (toDelete.length === 0) {
    break;
  }

  const ids = toDelete.map(r => r.id);
  await db
    .delete(verificationResult)
    .where(inArray(verificationResult.id, ids))
    .execute();

  totalDeleted += toDelete.length;

  if (toDelete.length < BATCH_SIZE) {
    break;
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
}
```

---

### 3. **Reconciliation Race Condition** (Phase 7)

**File**: `backend/src/services/reconciliation.ts`
**Line**: 88-150

**Problem**:
Reconciliation can run while credits are being deducted/refunded, causing immediate new drift.

**Scenario**:
1. Reconciliation reads: Redis=100, PG=100 (no drift)
2. User verifies email → Redis=99, PG event created
3. Reconciliation corrects Redis back to 100 (wrong!)
4. Now Redis=100 but PG=99

**Impact**:
- Reconciliation creates drift instead of fixing it
- Users could get free credits
- Balance inconsistency

**Fix Required**:
Add a reconciliation lock per user:

```typescript
export async function reconcileUser(userId: string): Promise<ReconciliationResult> {
  // Try to acquire lock
  const lockKey = `reconciliation:lock:${userId}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');

  if (!lockAcquired) {
    // Another reconciliation in progress, skip
    return { userId, redisBalance: 0, pgBalance: 0, drift: 0, corrected: false };
  }

  try {
    // ... existing reconciliation logic ...
  } finally {
    // Release lock
    await redis.del(lockKey);
  }
}
```

---

## 🟡 High Priority Issues (Should Fix)

### 4. **No Input Validation on Dashboard Range** (Phase 5)

**File**: `backend/src/routes/dashboard.ts`
**Line**: 23-30

**Problem**:
Range parameter can be any number. Negative numbers or very large numbers could cause issues.

```typescript
const range = parseInt(req.query.range as string, 10) || 30;
const validRanges = [7, 30, 90];
const rangeDays = validRanges.includes(range) ? range : 30;
```

**But this validation is ONLY in the route, not the service!**

If someone calls `getDashboardStats(userId, -30)` or `getDashboardStats(userId, 99999)` directly:
- Negative: Query fetches future data
- Large number: Query scans entire table (slow)

**Impact**:
- Performance degradation
- Incorrect data
- Potential DoS if large range

**Fix Required**:
Add validation in the service:

```typescript
export async function getDashboardStats(
  userId: string,
  rangeDays: number = 30
): Promise<DashboardStats> {
  // Validate range
  if (rangeDays < 1 || rangeDays > 365) {
    throw new Error('Range must be between 1 and 365 days');
  }

  // ... rest of code
}
```

---

### 5. **Cookie Consent Not Synced to Redis** (Phase 9)

**File**: `frontend/src/components/cookie-consent-provider.tsx`

**Problem**:
Cookie consent is ONLY stored in localStorage. If user clears browser data but stays logged in, consent is lost but session remains.

**Impact**:
- Modal reappears unexpectedly
- User has to consent again
- Poor UX

**Fix Required**:
Store consent server-side in PostgreSQL `users` table:

```typescript
// Add to schema
cookieConsent: boolean('cookie_consent').default(false),
cookieConsentDate: timestamp('cookie_consent_date'),

// API endpoint to save consent
POST /api/user/cookie-consent
{
  "accepted": true
}
```

---

### 6. **Missing Redis Update After Refund** (Phase 6)

**File**: `backend/src/services/credit.ts`
**Line**: 115-136

**Problem**:
`refundCredits()` updates PostgreSQL but does NOT update Redis cache!

```typescript
export async function refundCredits(
  userId: string,
  amount: number,
  referenceId: string
): Promise<number> {
  const currentBalance = await getBalance(userId); // Reads from Redis
  const newBalance = currentBalance + amount;

  // Updates PostgreSQL only
  await db.insert(creditEvent).values({
    id: nanoid(),
    userId,
    type: 'verification_refund',
    amount: amount,
    balanceAfter: newBalance,
    referenceType: 'verification_failed',
    referenceId,
    createdAt: new Date(),
  });

  // Missing: Update Redis!

  return newBalance;
}
```

**Impact**:
- Redis shows old balance
- User doesn't see refund until reconciliation runs (5 min delay)
- Dashboard shows wrong credit count

**Fix Required**:
```typescript
// After PostgreSQL insert
await redis.set(`credit:balance:${userId}`, newBalance);
```

---

## 🟢 Medium Priority Issues (Nice to Fix)

### 7. **No Timezone Handling in Retention Cleanup** (Phase 8)

**File**: `backend/src/services/retention-cleanup.ts`
**Line**: 83

**Problem**:
Uses JavaScript `Date` which is in local time, but data is in UTC.

```typescript
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
```

If server timezone != UTC, calculations are wrong.

**Impact**:
- Data deleted too early or too late
- Inconsistent behavior across deployments

**Fix Required**:
```typescript
const now = new Date();
const cutoffTimestamp = now.getTime() - (retentionDays * 24 * 60 * 60 * 1000);
const cutoffDate = new Date(cutoffTimestamp);
```

---

### 8. **Error Classification Too Broad** (Phase 6)

**File**: `backend/src/workers/dlq-handler.ts`
**Line**: 38-67

**Problem**:
Error classification only checks message strings. What about HTTP 429 (rate limit)? What about 401/403 (auth errors)?

```typescript
// 429 would be classified as RETRYABLE (default)
// But should it? Rate limits might need backoff, not immediate retry
```

**Impact**:
- Incorrect error handling
- Could retry when shouldn't
- Could not retry when should

**Fix Required**:
Add more cases:

```typescript
// 429 = rate limited (retryable but with backoff)
if (message.includes('429') || message.includes('rate limit')) {
  return ErrorType.RETRYABLE;
}

// 401/403 = auth issues (permanent)
if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
  return ErrorType.PERMANENT;
}
```

---

### 9. **No Concurrent Reconciliation Protection** (Phase 7)

**File**: `backend/src/workers/reconciliation-worker.ts`

**Problem**:
Multiple reconciliation workers could start at the same time if multiple instances are deployed.

**Impact**:
- Duplicate work
- Conflicting corrections
- Wasted resources

**Fix Required**:
Use Redis lock at the START of reconciliation:

```typescript
export async function reconcileAll(batchSize: number = 1000) {
  const lockKey = 'reconciliation:global:lock';
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 300, 'NX'); // 5 min lock

  if (!lockAcquired) {
    logger.info('Another reconciliation already running, skipping');
    return;
  }

  try {
    // ... reconciliation logic ...
  } finally {
    await redis.del(lockKey);
  }
}
```

---

### 10. **Cookie Modal Blocks Navigation** (Phase 9)

**File**: `frontend/src/components/cookie-consent-provider.tsx`
**Line**: 89-91

**Problem**:
`handleClose` does nothing. User CANNOT close modal without accepting/rejecting. This might violate GDPR in some interpretations.

```typescript
const handleClose = () => {
  // Don't close without a choice - user must accept or reject
  // This could be changed based on requirements
};
```

**Impact**:
- User stuck with modal
- Can't use site without choosing
- Might not be GDPR compliant (some interpretations say users must be able to use site without consent)

**Fix Required**:
Allow close with default to "rejected":

```typescript
const handleClose = () => {
  // Treat close as rejection
  handleReject();
};
```

---

## 🔵 Low Priority Issues (Optional)

### 11. **No Metrics for Failed Refunds** (Phase 6)

**File**: `backend/src/workers/dlq-handler.ts`
**Line**: 115-123

**Problem**:
If refund fails, it's logged but no metric incremented.

**Fix**: Add counter for failed refunds

---

### 12. **Dashboard Queries Not Indexed Properly**

**File**: `backend/src/services/dashboard.ts`

**Problem**:
Queries filter by `userId` and `createdAt` but we only have index on `(userId, createdAt DESC)` for recent results. Dashboard queries don't specify order, might not use index efficiently.

**Fix**: Add compound indexes:
```sql
CREATE INDEX idx_verification_result_user_created
ON verification_result(user_id, created_at DESC);
```

---

### 13. **No Cleanup Metrics** (Phase 8)

**File**: `backend/src/services/retention-cleanup.ts`

**Problem**:
Cleanup doesn't increment Prometheus metrics (mentioned in plan but not implemented).

**Fix**: Add metrics:
```typescript
const cleanupDeletedCounter = new Counter({
  name: 'emailkit_cleanup_deleted_total',
  help: 'Total records deleted by cleanup',
});
```

---

## Summary

| Severity | Count | Must Fix? |
|----------|-------|-----------|
| 🔴 Critical | 3 | Yes |
| 🟡 High | 3 | Yes |
| 🟢 Medium | 5 | Recommended |
| 🔵 Low | 3 | Optional |

### Critical Fixes Needed Before Production:

1. ✅ Add idempotency check to refund (double refund vulnerability)
2. ✅ Fix cleanup batch loop (infinite loop risk)
3. ✅ Add reconciliation locking (race condition)

### High Priority Fixes:

4. ✅ Add input validation to dashboard service
5. ✅ Update Redis after refund
6. ✅ Store cookie consent server-side

### Testing These Issues:

See `TESTING-GUIDE.md` for how to test:
- Double refund: Process same DLQ job twice
- Cleanup loop: Monitor worker with old data
- Race condition: Run reconciliation during high traffic
- Missing Redis update: Check balance after refund

---

**Recommendation**: Fix Critical and High priority issues before deploying to production.

**Estimated Fix Time**: 2-3 hours for all critical + high priority issues
