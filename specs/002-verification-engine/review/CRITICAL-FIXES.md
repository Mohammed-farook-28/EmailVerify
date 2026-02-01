# Critical Fixes - Must Apply Before Production

**Priority**: 🔴 CRITICAL
**Estimated Time**: 2-3 hours
**Files to Change**: 3

---

## Fix 1: Double Refund Prevention (DLQ Handler)

**File**: `backend/src/workers/dlq-handler.ts`
**Function**: `processDlqJob`
**Line**: ~103

### Change Required:

```typescript
// BEFORE line 104: "if (errorType === ErrorType.PERMANENT) {"
// ADD THIS CHECK:

// Check if refund already exists (prevent double refund)
const existingRefund = await db
  .select()
  .from(creditEvent)
  .where(eq(creditEvent.referenceId, `verification_failed:${job.id}`))
  .limit(1)
  .execute();

if (existingRefund.length > 0) {
  jobLogger.info(
    { jobId: job.id },
    'Refund already issued for this job, skipping'
  );
  return; // Exit early, don't refund again
}

// THEN continue with existing code:
if (errorType === ErrorType.PERMANENT) {
  try {
    await refundCredits(job.data.userId, 1, `verification_failed:${job.id}`);
    // ... rest of code
```

### Import Needed:

```typescript
// Add to imports at top of file
import { db } from '../db/index.js';
import { creditEvent } from '../db/schema.js';
import { eq } from 'drizzle-orm';
```

---

## Fix 2: Cleanup Batch Loop (Retention Service)

**File**: `backend/src/services/retention-cleanup.ts`
**Function**: `cleanupForUser`
**Lines**: 97-126

### Replace Entire While Loop With:

```typescript
// Delete in batches to avoid locks
while (true) {
  // SELECT records to delete (with LIMIT)
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

  // If nothing to delete, we're done
  if (toDelete.length === 0) {
    break;
  }

  // Delete the batch
  const ids = toDelete.map(r => r.id);
  await db
    .delete(verificationResult)
    .where(inArray(verificationResult.id, ids))
    .execute();

  totalDeleted += toDelete.length;

  serviceLogger.debug(
    {
      batchDeleted: toDelete.length,
      totalDeleted,
    },
    'Batch deleted'
  );

  // If batch was smaller than BATCH_SIZE, we're done
  if (toDelete.length < BATCH_SIZE) {
    break;
  }

  // Small delay to avoid overwhelming the database
  await new Promise((resolve) => setTimeout(resolve, 100));
}
```

### Import Needed:

```typescript
// Add to imports at top of file
import { eq, and, lt, sql, inArray } from 'drizzle-orm';
```

---

## Fix 3: Reconciliation Locking (Reconciliation Service)

**File**: `backend/src/services/reconciliation.ts`
**Function**: `reconcileUser`
**Lines**: 88-168

### Wrap Function Body With Lock:

```typescript
export async function reconcileUser(userId: string): Promise<ReconciliationResult> {
  const serviceLogger = createLogger({
    userId,
    operation: 'reconcile-user',
  });

  // Try to acquire lock for this user
  const lockKey = `reconciliation:lock:${userId}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');

  if (!lockAcquired) {
    // Another reconciliation in progress for this user, skip
    serviceLogger.info('Reconciliation already in progress for user, skipping');
    return {
      userId,
      redisBalance: 0,
      pgBalance: 0,
      drift: 0,
      corrected: false,
    };
  }

  try {
    // EXISTING CODE GOES HERE (lines 95-168)
    // ... all the existing logic ...

  } catch (error: any) {
    serviceLogger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      'Reconciliation failed for user'
    );
    throw error;
  } finally {
    // IMPORTANT: Always release lock in finally block
    await redis.del(lockKey);
  }
}
```

### Also Add Global Lock to `reconcileAll`:

**File**: `backend/src/services/reconciliation.ts`
**Function**: `reconcileAll`
**At the start of the function**:

```typescript
export async function reconcileAll(batchSize: number = 1000): Promise<ReconciliationSummary> {
  const serviceLogger = createLogger({
    operation: 'reconcile-all',
    batchSize,
  });

  // Try to acquire global reconciliation lock
  const globalLockKey = 'reconciliation:global:lock';
  const lockAcquired = await redis.set(globalLockKey, '1', 'EX', 300, 'NX'); // 5 min lock

  if (!lockAcquired) {
    serviceLogger.info('Another reconciliation already running globally, skipping');
    return {
      totalUsers: 0,
      usersProcessed: 0,
      driftDetected: 0,
      totalDrift: 0,
      corrected: 0,
      errors: 0,
      duration: 0,
    };
  }

  const startTime = Date.now();

  try {
    // EXISTING CODE (lines 181 onwards)
    // ... all existing logic ...

  } finally {
    // Release global lock
    await redis.del(globalLockKey);
  }
}
```

---

## Fix 4: Update Redis After Refund (Credit Service)

**File**: `backend/src/services/credit.ts`
**Function**: `refundCredits`
**After line 133**:

### Add Redis Update:

```typescript
export async function refundCredits(
  userId: string,
  amount: number,
  referenceId: string
): Promise<number> {
  const currentBalance = await getBalance(userId);
  const newBalance = currentBalance + amount;

  // Create credit event for refund
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

  // ADD THIS: Update Redis cache immediately
  await redis.set(`credit:balance:${userId}`, newBalance.toString());

  return newBalance;
}
```

### Import Needed:

```typescript
// Add to imports at top of file
import { redis } from '../config/redis.js';
```

---

## Fix 5: Input Validation (Dashboard Service)

**File**: `backend/src/services/dashboard.ts`
**Functions**: All three functions
**At start of each function**:

### Add to `getDashboardStats`:

```typescript
export async function getDashboardStats(
  userId: string,
  rangeDays: number = 30
): Promise<DashboardStats> {
  // Validate range
  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 365) {
    throw new Error('rangeDays must be an integer between 1 and 365');
  }

  // ... rest of existing code
```

### Add to `getStatusDistribution`:

```typescript
export async function getStatusDistribution(
  userId: string,
  rangeDays: number = 30
): Promise<StatusDistribution[]> {
  // Validate range
  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 365) {
    throw new Error('rangeDays must be an integer between 1 and 365');
  }

  // ... rest of existing code
```

### Add to `getVerificationTrend`:

```typescript
export async function getVerificationTrend(
  userId: string,
  rangeDays: number = 30
): Promise<TrendDataPoint[]> {
  // Validate range
  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 365) {
    throw new Error('rangeDays must be an integer between 1 and 365');
  }

  // ... rest of existing code
```

---

## Testing the Fixes

### Test Fix 1 (Double Refund):
```bash
# Manual test:
# 1. Trigger a permanent failure
# 2. Check DLQ processes it
# 3. Manually reprocess same job
# 4. Verify refund only happens once
```

### Test Fix 2 (Cleanup Loop):
```bash
# Insert 5000 old records
# Run cleanup
# Monitor logs - should see batch sizes
# Verify it completes without infinite loop
```

### Test Fix 3 (Reconciliation Lock):
```bash
# Start reconciliation worker
# Trigger manual reconciliation while running
# Verify second one skips with log message
```

### Test Fix 4 (Redis Update):
```bash
# Trigger refund
# Immediately check Redis: redis-cli GET credit:balance:userId
# Verify it shows updated balance
```

### Test Fix 5 (Validation):
```bash
# Call API with invalid range
curl "http://localhost:3000/api/dashboard/stats?range=999"
# Should return 400 error
```

---

## Deployment Checklist

Before deploying to production:

- [ ] Apply all 5 critical fixes
- [ ] Run `npm run build` - verify no errors
- [ ] Run unit tests (when added)
- [ ] Test each fix manually (see above)
- [ ] Review code changes with team
- [ ] Update CHANGELOG.md
- [ ] Deploy to staging first
- [ ] Monitor for 24 hours in staging
- [ ] Then deploy to production

---

## Estimated Impact

**Without Fixes**:
- Users could get double refunds (💸 financial loss)
- Cleanup could run forever (💥 worker crash)
- Reconciliation could create drift (💰 wrong balances)
- Dashboard could be slow (🐌 bad UX)

**With Fixes**:
- ✅ Refunds are idempotent
- ✅ Cleanup runs reliably
- ✅ Reconciliation is safe
- ✅ Redis stays in sync
- ✅ Dashboard performs well

**Time to Apply**: 2-3 hours
**Risk**: Low (all changes are defensive, won't break existing functionality)
