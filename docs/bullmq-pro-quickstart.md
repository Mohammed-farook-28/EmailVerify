# BullMQ Pro Quick Start Guide

**Quick reference for EmailKit multi-tenant email verification queue**

---

## Installation

```bash
npm install @taskforcesh/bullmq-pro ioredis
```

---

## Basic Setup

### Queue Configuration

```typescript
import { QueuePro } from '@taskforcesh/bullmq-pro';
import Redis from 'ioredis';

const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // Required for BullMQ
});

export const emailQueue = new QueuePro('email-verification', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
```

---

## Adding Jobs

### Single Email (High Priority)

```typescript
await emailQueue.add(
  'verify-email',
  {
    email: 'user@example.com',
    tenantId: 'tenant-123',
    type: 'single',
  },
  {
    group: { id: 'tenant-123' },  // tenantId as group ID
    priority: 1,                   // High priority (0-2097151, lower=higher)
  }
);
```

### Bulk Email (Low Priority)

```typescript
await emailQueue.add(
  'verify-email',
  {
    email: 'bulk-user@example.com',
    tenantId: 'tenant-123',
    type: 'bulk',
    bulkJobId: 'bulk-456',
  },
  {
    group: { id: 'tenant-123' },
    priority: 10,  // Lower priority than single
  }
);
```

### Bulk Addition

```typescript
await emailQueue.addBulk([
  {
    name: 'verify-email',
    data: { email: 'user1@example.com', tenantId: 'tenant-123' },
    opts: { group: { id: 'tenant-123' }, priority: 10 },
  },
  {
    name: 'verify-email',
    data: { email: 'user2@example.com', tenantId: 'tenant-123' },
    opts: { group: { id: 'tenant-123' }, priority: 10 },
  },
]);
```

---

## Worker Setup

### Basic Worker

```typescript
import { WorkerPro } from '@taskforcesh/bullmq-pro';

const worker = new WorkerPro(
  'email-verification',
  async (job) => {
    console.log(`Processing for tenant: ${job.gid}`);
    console.log(`Priority: ${job.opts.priority}`);

    // Your processing logic
    const result = await verifyEmail(job.data.email);

    return result;
  },
  {
    connection,
    concurrency: 50,            // 50 jobs per worker
    group: {
      concurrency: 5,            // Max 5 jobs per tenant (global)
    },
  }
);

worker.on('completed', (job) => {
  console.log(`✓ Job ${job.id} completed for tenant ${job.gid}`);
});

worker.on('failed', (job, err) => {
  console.error(`✗ Job ${job.id} failed:`, err.message);
});
```

---

## Rate Limiting

### Per-Job Rate Limit

```typescript
await emailQueue.add(
  'verify-email',
  { email: 'user@example.com', tenantId: 'tenant-123' },
  {
    group: {
      id: 'tenant-123',
      limit: {
        max: 250,       // 250 jobs
        duration: 3000, // per 3 seconds
      },
    },
  }
);
```

### Global Default Rate Limit

```typescript
// Default for all tenants
await emailQueue.setGroupRateLimit(undefined, {
  max: 100,
  duration: 1000, // 100 jobs/sec
});

// Override for specific tenant
await emailQueue.setGroupRateLimit('tenant-premium', {
  max: 1000,
  duration: 1000, // 1000 jobs/sec
});
```

---

## Monitoring

### Get Queue Metrics

```typescript
// Overall queue stats
const counts = await emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
console.log(counts);
// { waiting: 1234, active: 56, completed: 10000, failed: 12 }

// Per-tenant queue depth
const groupCounts = await emailQueue.getGroupsJobsCount();
console.log(groupCounts);
// { 'tenant-123': 50, 'tenant-456': 120, ... }

// Priority distribution for a tenant
const priorityCounts = await emailQueue.getCountsPerPriorityForGroup('tenant-123');
console.log(priorityCounts);
// { '1': 10, '10': 40 }

// List all active groups
const groups = await emailQueue.getGroups();
console.log(groups);
// ['tenant-123', 'tenant-456', 'tenant-789']
```

---

## Key Concepts

### Round-Robin Fairness
- Jobs processed in round-robin across all groups (tenants)
- Tenant A with 10,000 jobs won't block Tenant B with 10 jobs
- Empty groups consume zero Redis resources

### Priority Within Groups
- **Priority 1**: High priority (single verifications)
- **Priority 10**: Low priority (bulk verifications)
- Priorities work **within each group**, not globally
- Lower number = higher priority (0 is highest)

### Group Concurrency
- `group.concurrency: 5` = max 5 jobs per tenant **across all workers**
- Global limit, not per-worker
- Prevents any single tenant from monopolizing workers

### Worker Concurrency
- `concurrency: 50` = max 50 jobs per worker instance
- Local to each worker
- Total system concurrency = `workers × concurrency`

---

## Common Patterns

### Multi-Tenant Job Addition

```typescript
async function addVerificationJob(
  email: string,
  tenantId: string,
  type: 'single' | 'bulk',
  bulkJobId?: string
) {
  return await emailQueue.add(
    'verify-email',
    { email, tenantId, type, bulkJobId },
    {
      group: { id: tenantId },
      priority: type === 'single' ? 1 : 10,
      jobId: `${type}-${tenantId}-${email}-${Date.now()}`,
    }
  );
}

// Usage
await addVerificationJob('user@example.com', 'tenant-123', 'single');
await addVerificationJob('bulk@example.com', 'tenant-123', 'bulk', 'bulk-456');
```

### Worker Pool

```typescript
const workers: WorkerPro[] = [];

for (let i = 0; i < 10; i++) {
  const worker = new WorkerPro(
    'email-verification',
    processorFunction,
    {
      connection,
      concurrency: 50,
      group: { concurrency: 5 },
    }
  );

  workers.push(worker);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await Promise.all(workers.map(w => w.close()));
});
```

---

## Gotchas and Limitations

1. **`maxSize` not available for `addBulk`**
   - Can only set per-group max size on individual `add()` calls

2. **Group concurrency is global**
   - `group.concurrency: 5` applies across **all workers**
   - Not per-worker

3. **Changing rate limits per job**
   - If jobs in same group have different rate limits, worker honors the current job's limit
   - Recommend setting rate limits at queue level instead

4. **Priority is intra-group only**
   - Priority affects order within a group, not between groups
   - Groups still processed round-robin regardless of priority

---

## Environment Variables

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password

# Optional
BULLMQ_DEFAULT_RATE_LIMIT_MAX=100
BULLMQ_DEFAULT_RATE_LIMIT_DURATION=1000
BULLMQ_GROUP_CONCURRENCY=5
BULLMQ_WORKER_CONCURRENCY=50
```

---

## Next Steps

1. Read full research: `/docs/bullmq-pro-multi-tenant-research.md`
2. Review architecture: `/docs/architecture.md` (Layer 2: Fair Queue)
3. Implement circuit breaker integration (Layer 4)
4. Add Prometheus metrics for monitoring
5. Set up autoscaling (2-50 workers)

---

## References

- [BullMQ Pro Groups Docs](https://docs.bullmq.io/bullmq-pro/groups)
- [Prioritized Intra-Groups](https://docs.bullmq.io/bullmq-pro/groups/prioritized)
- [Rate Limiting](https://docs.bullmq.io/bullmq-pro/groups/rate-limiting)
- [Group Concurrency](https://docs.bullmq.io/bullmq-pro/groups/concurrency)
