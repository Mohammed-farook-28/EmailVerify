# BullMQ Pro Multi-Tenant Fair Queuing Research

**Date**: 2026-02-01
**Context**: EmailKit email verification platform with 1000+ tenants
**Goal**: Configure BullMQ Pro for fair round-robin scheduling with priority support

---

## Executive Summary

BullMQ Pro's **Groups** feature provides native support for multi-tenant fair queuing with round-robin scheduling. Key findings:

- ✅ Groups enable fair round-robin processing across unlimited tenants
- ✅ Intra-group priorities allow single-verify jobs to take precedence over bulk jobs
- ✅ Per-group rate limiting and concurrency controls available
- ✅ String-based group IDs (e.g., `tenantId`) are fully supported
- ⚠️ The `maxSize` option is not yet available for `addBulk` operations
- ✅ No performance penalty or hard limits on number of groups

---

## 1. BullMQ Pro Groups API Overview

### What Are Groups?

Groups allow you to use a **single queue** while distributing jobs among groups so that jobs are processed one by one relative to the group they belong to. Groups act as "virtual queues" that prevent any single tenant from monopolizing the worker pool.

**Key Benefits**:
- **Fair Processing**: Jobs processed in round-robin fashion among all groups
- **Scalability**: No hard limit on number of groups; no performance impact
- **Resource Efficiency**: Empty groups consume zero Redis resources
- **Built-in Rate Limiting**: Per-group rate limits independent of each other

### How Round-Robin Works

When workers are available:
1. BullMQ Pro picks the next group in round-robin order
2. Processes one job from that group
3. Moves to the next group
4. Repeats indefinitely

This ensures **fair distribution** even if one tenant queues 10,000 jobs while others queue only 10.

---

## 2. Configuration Patterns

### 2.1 Queue Setup with Groups

```typescript
import { QueuePro } from '@taskforcesh/bullmq-pro';
import { Redis } from 'ioredis';

const connection = new Redis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null, // Required for BullMQ
});

const verificationQueue = new QueuePro('email-verification', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true, // Required per CLAUDE.md
    removeOnFail: false,
  },
});
```

### 2.2 Adding Jobs with Tenant Groups

#### Single Job with Group and Priority

```typescript
// High priority single verification (priority 1)
await verificationQueue.add(
  'verify-email',
  {
    email: 'user@example.com',
    tenantId: 'tenant-abc-123',
    type: 'single',
  },
  {
    group: {
      id: 'tenant-abc-123', // Use tenantId as group ID
    },
    priority: 1, // Lower number = higher priority (0-2097151)
  }
);

// Lower priority bulk verification (priority 10)
await verificationQueue.add(
  'verify-email',
  {
    email: 'bulk-user@example.com',
    tenantId: 'tenant-abc-123',
    type: 'bulk',
    bulkJobId: 'bulk-job-456',
  },
  {
    group: {
      id: 'tenant-abc-123',
    },
    priority: 10, // Lower priority than single verifications
  }
);
```

**Priority Notes**:
- Priorities range from **0 to 2,097,151**
- Lower number = higher priority (Unix convention)
- Jobs without explicit priority default to **0** (highest priority)
- Priorities work **within each group** (intra-group priority)

### 2.3 Bulk Job Addition with Groups

While BullMQ Pro supports `addBulk` with groups, the API is less documented. Based on standard patterns:

```typescript
// Expected pattern for addBulk with groups
await verificationQueue.addBulk([
  {
    name: 'verify-email',
    data: {
      email: 'user1@example.com',
      tenantId: 'tenant-xyz-789',
      type: 'bulk',
      bulkJobId: 'bulk-job-789',
    },
    opts: {
      group: {
        id: 'tenant-xyz-789',
      },
      priority: 10, // Bulk jobs lower priority
    },
  },
  {
    name: 'verify-email',
    data: {
      email: 'user2@example.com',
      tenantId: 'tenant-xyz-789',
      type: 'bulk',
      bulkJobId: 'bulk-job-789',
    },
    opts: {
      group: {
        id: 'tenant-xyz-789',
      },
      priority: 10,
    },
  },
  // ... more jobs
]);
```

**⚠️ Known Limitation**: The `maxSize` option is not yet available for `addBulk`.

### 2.4 Worker Configuration with Group Concurrency

```typescript
import { WorkerPro } from '@taskforcesh/bullmq-pro';

const worker = new WorkerPro(
  'email-verification',
  async (job) => {
    // Access group ID via job.gid
    console.log(`Processing job for tenant: ${job.gid}`);
    console.log(`Priority: ${job.opts.priority}`);
    console.log(`Job data:`, job.data);

    // Call upstream API
    const result = await verifyEmailUpstream(job.data.email);

    return result;
  },
  {
    connection,
    concurrency: 50, // Total concurrent jobs per worker
    group: {
      concurrency: 3, // Max 3 jobs per group across ALL workers
    },
  }
);

// Error handling
worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed for tenant ${job.gid}:`, err);
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed for tenant ${job.gid}`);
});
```

**Key Points**:
- `concurrency: 50` = max 50 jobs in parallel per worker instance
- `group.concurrency: 3` = **global limit** of 3 jobs per group across all workers
- Group concurrency prevents any single tenant from consuming all worker slots

---

## 3. Advanced Features

### 3.1 Per-Group Rate Limiting

```typescript
// Add job with per-group rate limit
await verificationQueue.add(
  'verify-email',
  { email: 'user@example.com', tenantId: 'tenant-abc-123' },
  {
    group: {
      id: 'tenant-abc-123',
      limit: {
        max: 250,      // Max 250 jobs
        duration: 3000, // Per 3 seconds (3000ms)
      },
    },
    priority: 1,
  }
);
```

**How It Works**:
- Rate limit is applied **per group**
- Unlike delayed jobs, rate limiting doesn't consume CPU
- Worker honors the rate limit of the job being processed
- Changing limits per job affects future jobs in that group

### 3.2 Dynamic Per-Group Rate Limits

```typescript
import { QueuePro } from '@taskforcesh/bullmq-pro';

const queue = new QueuePro('email-verification', { connection });

// Set rate limit for a specific tenant (overrides default)
await queue.setGroupRateLimit('tenant-premium-xyz', {
  max: 1000,
  duration: 1000, // 1000 jobs per second for premium tenant
});

// Set default rate limit for all groups
await queue.setGroupRateLimit(undefined, {
  max: 100,
  duration: 1000, // 100 jobs per second for standard tenants
});
```

### 3.3 Max Group Size

Limit how many jobs can be queued per group:

```typescript
await verificationQueue.add(
  'verify-email',
  { email: 'user@example.com' },
  {
    group: {
      id: 'tenant-abc-123',
      maxSize: 10000, // Max 10k pending jobs for this tenant
    },
  }
);
```

**Behavior**: When group reaches `maxSize`, adding new jobs throws an exception that can be caught and handled.

### 3.4 Group-Specific Getters

```typescript
import { QueuePro } from '@taskforcesh/bullmq-pro';

const queue = new QueuePro('email-verification', { connection });

// Get count of jobs by priority for a specific group
const counts = await queue.getCountsPerPriorityForGroup('tenant-abc-123');
console.log(counts); // { '0': 5, '1': 10, '10': 50 }

// Get all group IDs
const groups = await queue.getGroups();
console.log(groups); // ['tenant-abc-123', 'tenant-xyz-789', ...]

// Get jobs count for a group
const groupJobsCount = await queue.getGroupsJobsCount();
console.log(groupJobsCount); // { 'tenant-abc-123': 65, 'tenant-xyz-789': 120 }
```

---

## 4. Recommended Configuration for EmailKit

### 4.1 Queue Setup

```typescript
import { QueuePro } from '@taskforcesh/bullmq-pro';
import Redis from 'ioredis';

// Dedicated Redis instance for BullMQ (per architecture.md)
const bullmqRedis = new Redis({
  host: process.env.BULLMQ_REDIS_HOST,
  port: parseInt(process.env.BULLMQ_REDIS_PORT || '6379'),
  password: process.env.BULLMQ_REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

export const emailVerificationQueue = new QueuePro('email-verification', {
  connection: bullmqRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true, // Required per CLAUDE.md
    removeOnFail: false,
  },
});

// Set default rate limit for all tenants
await emailVerificationQueue.setGroupRateLimit(undefined, {
  max: 100,      // 100 jobs
  duration: 1000, // per second (default for all tenants)
});
```

### 4.2 Job Addition Pattern

```typescript
interface VerificationJobData {
  email: string;
  tenantId: string;
  userId: string;
  type: 'single' | 'bulk';
  bulkJobId?: string;
}

async function addVerificationJob(data: VerificationJobData) {
  const priority = data.type === 'single' ? 1 : 10; // Single = high, bulk = low

  return await emailVerificationQueue.add(
    'verify-email',
    data,
    {
      group: {
        id: data.tenantId, // Use tenantId for fair queuing
      },
      priority,
      jobId: data.type === 'single'
        ? `single-${data.tenantId}-${Date.now()}-${Math.random()}`
        : `bulk-${data.bulkJobId}-${data.email}`,
    }
  );
}
```

### 4.3 Worker Pool Configuration

```typescript
import { WorkerPro } from '@taskforcesh/bullmq-pro';
import { verifyEmailUpstream } from './upstream-client';

// Create worker pool (10+ workers as per architecture.md)
const workers: WorkerPro[] = [];

for (let i = 0; i < 10; i++) {
  const worker = new WorkerPro(
    'email-verification',
    async (job) => {
      const { email, tenantId, type, bulkJobId } = job.data;

      console.log(`[Worker ${i}] Processing ${type} verification for tenant ${tenantId}`);

      // Call upstream API through circuit breaker + token bucket
      const result = await verifyEmailUpstream(email);

      // Store result in database
      await storeVerificationResult({
        email,
        tenantId,
        userId: job.data.userId,
        result,
        type,
        bulkJobId,
        timestamp: new Date(),
      });

      // Emit SSE event for real-time updates
      if (type === 'bulk' && bulkJobId) {
        emitBulkProgress(tenantId, bulkJobId, result);
      }

      return result;
    },
    {
      connection: bullmqRedis,
      concurrency: 50, // 50 concurrent jobs per worker
      group: {
        concurrency: 5, // Max 5 jobs per tenant across all workers
      },
      limiter: {
        max: 1000,        // Global token bucket
        duration: 1000,   // 1000 jobs per second (matches upstream limit)
      },
    }
  );

  worker.on('failed', async (job, err) => {
    console.error(`[Worker ${i}] Job ${job.id} failed:`, err);

    // Log to monitoring
    await logFailure({
      jobId: job.id,
      tenantId: job.data.tenantId,
      error: err.message,
      attempts: job.attemptsMade,
    });
  });

  workers.push(worker);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');
  await Promise.all(workers.map(w => w.close()));
  process.exit(0);
});
```

### 4.4 Autoscaling Configuration

```typescript
import { QueuePro, WorkerPro } from '@taskforcesh/bullmq-pro';

// Monitor queue depth and scale workers (2-50 as per architecture.md)
async function monitorAndScale() {
  const queue = new QueuePro('email-verification', { connection: bullmqRedis });

  setInterval(async () => {
    const counts = await queue.getJobCounts('waiting', 'active');
    const queueDepth = counts.waiting || 0;
    const activeWorkers = workers.length;

    console.log(`Queue depth: ${queueDepth}, Active workers: ${activeWorkers}`);

    // Scale up if queue depth > 1000 jobs per worker
    if (queueDepth > activeWorkers * 1000 && activeWorkers < 50) {
      console.log('Scaling up...');
      // Trigger Kubernetes HPA or add worker instance
      scaleUp();
    }

    // Scale down if queue depth < 500 jobs per worker
    if (queueDepth < activeWorkers * 500 && activeWorkers > 2) {
      console.log('Scaling down...');
      // Remove worker instance
      scaleDown();
    }
  }, 30000); // Check every 30 seconds
}
```

---

## 5. Limitations and Gotchas

### 5.1 Known Limitations

1. **`maxSize` Not Available for `addBulk`**
   - Per-group max size can only be set on individual `add()` calls
   - Workaround: Use individual `add()` calls with group `maxSize` option

2. **Changing Rate Limits Per Job**
   - If different jobs in same group have different rate limits, worker honors the limit of the job being processed
   - Can cause unpredictable behavior; recommend setting rate limits at queue level

3. **Group Concurrency Is Global**
   - `group.concurrency: 3` applies across **all worker instances**
   - Not per-worker; ensure this aligns with scaling strategy

### 5.2 Best Practices

1. **Use String-Based Group IDs**
   - Group IDs can be strings or numbers
   - Use `tenantId` directly as group ID for clarity

2. **Set Default Rate Limits**
   - Use `queue.setGroupRateLimit(undefined, { max, duration })` for default
   - Override for premium tenants as needed

3. **Monitor Group Depth**
   - Use `queue.getGroupsJobsCount()` to monitor per-tenant queue depth
   - Alert if any tenant consistently has high queue depth

4. **Priorities Within Groups**
   - Priority 0-9: High priority (single verifications)
   - Priority 10-99: Low priority (bulk verifications)
   - Avoid using full range (0-2,097,151) for simplicity

5. **Empty Groups Are Free**
   - No performance penalty for having 1000+ groups
   - Empty groups consume zero Redis resources

---

## 6. Testing Strategy

### 6.1 Unit Tests

```typescript
import { QueuePro, WorkerPro } from '@taskforcesh/bullmq-pro';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('BullMQ Pro Multi-Tenant Fair Queuing', () => {
  let queue: QueuePro;
  let worker: WorkerPro;

  beforeAll(async () => {
    queue = new QueuePro('test-queue', { connection: testRedis });
    worker = new WorkerPro('test-queue', async (job) => job.data, {
      connection: testRedis,
      group: { concurrency: 2 },
    });
  });

  afterAll(async () => {
    await worker.close();
    await queue.close();
  });

  it('should process jobs in round-robin across groups', async () => {
    // Add 3 jobs for tenant A
    await queue.add('job', { tenant: 'A', seq: 1 }, { group: { id: 'A' } });
    await queue.add('job', { tenant: 'A', seq: 2 }, { group: { id: 'A' } });
    await queue.add('job', { tenant: 'A', seq: 3 }, { group: { id: 'A' } });

    // Add 3 jobs for tenant B
    await queue.add('job', { tenant: 'B', seq: 1 }, { group: { id: 'B' } });
    await queue.add('job', { tenant: 'B', seq: 2 }, { group: { id: 'B' } });
    await queue.add('job', { tenant: 'B', seq: 3 }, { group: { id: 'B' } });

    // Wait for completion
    await delay(5000);

    // Verify round-robin: should interleave A and B jobs
    // (exact order depends on timing, but should see alternating pattern)
  });

  it('should prioritize single verifications over bulk', async () => {
    // Add bulk job
    await queue.add('job', { type: 'bulk' }, {
      group: { id: 'tenant-1' },
      priority: 10,
    });

    // Add single verification job
    await queue.add('job', { type: 'single' }, {
      group: { id: 'tenant-1' },
      priority: 1,
    });

    // Wait for processing
    await delay(2000);

    // Verify single job processed first
    const completed = await queue.getCompleted();
    expect(completed[0].data.type).toBe('single');
    expect(completed[1].data.type).toBe('bulk');
  });

  it('should respect per-group concurrency limit', async () => {
    // Add 10 jobs for same tenant
    for (let i = 0; i < 10; i++) {
      await queue.add('job', { seq: i }, {
        group: { id: 'tenant-1' },
      });
    }

    // Check active jobs
    await delay(100);
    const active = await queue.getActive();

    // Should be max 2 active (group.concurrency: 2)
    const tenant1Active = active.filter(j => j.opts.group?.id === 'tenant-1');
    expect(tenant1Active.length).toBeLessThanOrEqual(2);
  });
});
```

### 6.2 Load Testing

```typescript
import { QueuePro, WorkerPro } from '@taskforcesh/bullmq-pro';

async function loadTest() {
  const queue = new QueuePro('email-verification', { connection });

  // Simulate 100 tenants
  const tenantIds = Array.from({ length: 100 }, (_, i) => `tenant-${i}`);

  // Add 100 jobs per tenant (10,000 total)
  console.log('Adding 10,000 jobs...');
  const startAdd = Date.now();

  for (const tenantId of tenantIds) {
    const jobs = Array.from({ length: 100 }, (_, i) => ({
      name: 'verify-email',
      data: {
        email: `user${i}@example.com`,
        tenantId,
        type: i < 10 ? 'single' : 'bulk', // 10 single, 90 bulk per tenant
      },
      opts: {
        group: { id: tenantId },
        priority: i < 10 ? 1 : 10,
      },
    }));

    await queue.addBulk(jobs);
  }

  console.log(`Added 10,000 jobs in ${Date.now() - startAdd}ms`);

  // Monitor processing
  const startProcess = Date.now();
  let processed = 0;

  const interval = setInterval(async () => {
    const counts = await queue.getJobCounts('completed', 'waiting', 'active');
    processed = counts.completed || 0;

    console.log(`Processed: ${processed}, Waiting: ${counts.waiting}, Active: ${counts.active}`);

    if (processed >= 10000) {
      clearInterval(interval);
      console.log(`Completed 10,000 jobs in ${Date.now() - startProcess}ms`);

      // Verify fairness: check that all tenants got roughly equal processing
      const groupCounts = await queue.getGroupsJobsCount();
      console.log('Remaining jobs per group:', groupCounts);
    }
  }, 1000);
}
```

---

## 7. Monitoring and Observability

### 7.1 Key Metrics to Track

```typescript
import { QueuePro } from '@taskforcesh/bullmq-pro';
import client from 'prom-client';

// Prometheus metrics
const queueDepthGauge = new client.Gauge({
  name: 'bullmq_queue_depth',
  help: 'Number of waiting jobs',
  labelNames: ['queue'],
});

const groupDepthGauge = new client.Gauge({
  name: 'bullmq_group_depth',
  help: 'Number of waiting jobs per group',
  labelNames: ['queue', 'group'],
});

const jobDurationHistogram = new client.Histogram({
  name: 'bullmq_job_duration_seconds',
  help: 'Job processing duration',
  labelNames: ['queue', 'group', 'type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

// Collect metrics every 10 seconds
setInterval(async () => {
  const queue = new QueuePro('email-verification', { connection });

  const counts = await queue.getJobCounts('waiting', 'active');
  queueDepthGauge.set({ queue: 'email-verification' }, counts.waiting || 0);

  const groupCounts = await queue.getGroupsJobsCount();
  for (const [groupId, count] of Object.entries(groupCounts)) {
    groupDepthGauge.set({ queue: 'email-verification', group: groupId }, count);
  }
}, 10000);
```

### 7.2 Alerting Rules

```yaml
# Prometheus alerting rules
groups:
  - name: bullmq_alerts
    interval: 30s
    rules:
      - alert: HighQueueDepth
        expr: bullmq_queue_depth{queue="email-verification"} > 50000
        for: 5m
        annotations:
          summary: "BullMQ queue depth is high"
          description: "Queue has {{ $value }} waiting jobs"

      - alert: TenantQueueStarving
        expr: bullmq_group_depth{queue="email-verification"} > 10000
        for: 10m
        annotations:
          summary: "Tenant {{ $labels.group }} has high queue depth"
          description: "Group has {{ $value }} waiting jobs"

      - alert: SlowJobProcessing
        expr: rate(bullmq_job_duration_seconds_sum[5m]) / rate(bullmq_job_duration_seconds_count[5m]) > 5
        for: 5m
        annotations:
          summary: "Average job duration is high"
          description: "Jobs taking {{ $value }}s on average"
```

---

## 8. Production Checklist

- [ ] Redis configured with `maxmemory-policy: noeviction`
- [ ] Redis persistence enabled: `appendonly: yes`
- [ ] BullMQ jobs configured with `removeOnComplete: true`
- [ ] Default rate limit set for all groups
- [ ] Premium tenant rate limits configured
- [ ] Group concurrency limit set appropriately (5-10 recommended)
- [ ] Worker pool autoscaling configured (2-50 workers)
- [ ] Prometheus metrics exposed and scraped
- [ ] Grafana dashboards created for queue depth and group fairness
- [ ] Alerting rules configured for high queue depth
- [ ] Load testing completed with 100+ tenants
- [ ] Graceful shutdown handlers implemented
- [ ] Circuit breaker integrated with worker processor
- [ ] Token bucket rate limiter applied to upstream calls

---

## 9. References

### Official Documentation
- [BullMQ Pro Groups](https://docs.bullmq.io/bullmq-pro/groups)
- [Prioritized Intra-Groups](https://docs.bullmq.io/bullmq-pro/groups/prioritized)
- [Rate Limiting Groups](https://docs.bullmq.io/bullmq-pro/groups/rate-limiting)
- [Group Concurrency](https://docs.bullmq.io/bullmq-pro/groups/concurrency)
- [Adding Jobs in Bulk](https://docs.bullmq.io/guide/queues/adding-bulks)
- [BullMQ Pro Edition Announcement](https://blog.taskforce.sh/bullmq-pro-edition/)

### GitHub Resources
- [BullMQ Repository](https://github.com/taskforcesh/bullmq)
- [BullMQ Pro Support Issues](https://github.com/taskforcesh/bullmq-pro-support)
- [Issue #23: Priority with Groups](https://github.com/taskforcesh/bullmq-pro-support/issues/23)
- [Issue #1: Rate-Limit Support for Groups](https://github.com/taskforcesh/bullmq-pro-support/issues/1)

### Community Resources
- [BullMQ for Beginners Guide](https://hadoan.medium.com/bullmq-for-beginners-a-friendly-practical-guide-with-typescript-examples-eb8064bef1c4)
- [Job Scheduling with BullMQ](https://betterstack.com/community/guides/scaling-nodejs/bullmq-scheduled-tasks/)
- [BullMQ Ultimate Guide](https://www.dragonflydb.io/guides/bullmq)

---

## 10. Next Steps

1. **Prototype Implementation** (2 days)
   - Set up QueuePro with test Redis instance
   - Create worker pool with 2 workers
   - Test round-robin behavior with 5 test tenants
   - Verify priority handling (single vs bulk)

2. **Integration with EmailKit** (3 days)
   - Integrate with API Gateway credit check
   - Connect to circuit breaker and token bucket
   - Implement SSE progress updates for bulk jobs
   - Add Prometheus metrics

3. **Load Testing** (2 days)
   - Simulate 100 tenants with mixed single/bulk jobs
   - Verify fair distribution across tenants
   - Test autoscaling (2-50 workers)
   - Measure throughput and latency

4. **Production Deployment** (2 days)
   - Deploy to staging with real Redis cluster
   - Configure monitoring and alerting
   - Run 24-hour soak test
   - Deploy to production with gradual rollout

**Total Estimated Time**: 9 days
