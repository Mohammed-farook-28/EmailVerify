/**
 * Prometheus Metrics Registry
 *
 * Centralized metrics collection for monitoring and alerting.
 * Metrics are exposed at /metrics endpoint in Prometheus text format.
 */

import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

// Create a new registry
export const register = new Registry();

// Collect default metrics (CPU, memory, event loop lag, etc.)
collectDefaultMetrics({ register });

// === Queue Metrics ===

export const queueDepthGauge = new Gauge({
  name: 'emailkit_queue_depth',
  help: 'Current number of jobs in the verification queue',
  labelNames: ['status'], // 'waiting', 'active', 'delayed', 'failed'
  registers: [register],
});

export const jobProcessingDuration = new Histogram({
  name: 'emailkit_job_processing_duration_seconds',
  help: 'Duration of job processing in seconds',
  labelNames: ['status'], // 'completed', 'failed'
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30], // seconds
  registers: [register],
});

// === Verification Metrics ===

export const verificationCounter = new Counter({
  name: 'emailkit_verifications_total',
  help: 'Total number of email verifications',
  labelNames: ['status', 'deliverability'], // status: valid/invalid/risky/unknown
  registers: [register],
});

export const verificationDuration = new Histogram({
  name: 'emailkit_verification_duration_seconds',
  help: 'Duration of email verification in seconds',
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5], // seconds
  registers: [register],
});

export const verificationErrorRate = new Counter({
  name: 'emailkit_verification_errors_total',
  help: 'Total number of verification errors',
  labelNames: ['error_type'], // 'network', 'validation', 'circuit_breaker_open', 'upstream_error'
  registers: [register],
});

// === Circuit Breaker Metrics ===

export const circuitBreakerState = new Gauge({
  name: 'emailkit_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  registers: [register],
});

export const circuitBreakerFailures = new Counter({
  name: 'emailkit_circuit_breaker_failures_total',
  help: 'Total number of circuit breaker failures',
  registers: [register],
});

export const circuitBreakerSuccesses = new Counter({
  name: 'emailkit_circuit_breaker_successes_total',
  help: 'Total number of circuit breaker successes',
  registers: [register],
});

// === Credit System Metrics ===

export const creditBalanceGauge = new Gauge({
  name: 'emailkit_credit_balance',
  help: 'Current credit balance by user',
  labelNames: ['user_id'],
  registers: [register],
});

export const creditDeductionCounter = new Counter({
  name: 'emailkit_credit_deductions_total',
  help: 'Total number of credit deductions',
  labelNames: ['reason'], // 'verification', 'refund'
  registers: [register],
});

// === HTTP Metrics ===

export const httpRequestDuration = new Histogram({
  name: 'emailkit_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestCounter = new Counter({
  name: 'emailkit_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// === Connection Pool Metrics ===

export const activeConnections = new Gauge({
  name: 'emailkit_active_connections',
  help: 'Number of active HTTP connections to upstream API',
  registers: [register],
});

export const connectionPoolSize = new Gauge({
  name: 'emailkit_connection_pool_size',
  help: 'Current size of the connection pool',
  registers: [register],
});

// === Dead Letter Queue Metrics ===

export const dlqDepthGauge = new Gauge({
  name: 'emailkit_dlq_depth',
  help: 'Current number of jobs in the dead letter queue',
  registers: [register],
});

export const dlqProcessedCounter = new Counter({
  name: 'emailkit_dlq_processed_total',
  help: 'Total number of DLQ jobs processed',
  labelNames: ['error_type'], // 'retryable', 'permanent'
  registers: [register],
});

export const creditRefundCounter = new Counter({
  name: 'emailkit_credit_refunds_total',
  help: 'Total number of credit refunds issued',
  labelNames: ['reason'], // 'permanent_failure', 'load_shedding'
  registers: [register],
});

export const stalledJobCounter = new Counter({
  name: 'emailkit_stalled_jobs_total',
  help: 'Total number of stalled jobs detected',
  registers: [register],
});

export const loadSheddingCounter = new Counter({
  name: 'emailkit_load_shedding_total',
  help: 'Total number of requests rejected due to load shedding',
  registers: [register],
});

// === Reconciliation Metrics ===

export const reconciliationDriftGauge = new Gauge({
  name: 'emailkit_reconciliation_drift',
  help: 'Total credit drift detected during reconciliation',
  registers: [register],
});

export const reconciliationCorrectionsCounter = new Counter({
  name: 'emailkit_reconciliation_corrections_total',
  help: 'Total number of credit corrections made',
  registers: [register],
});

export const reconciliationDurationHistogram = new Histogram({
  name: 'emailkit_reconciliation_duration_seconds',
  help: 'Duration of reconciliation runs',
  buckets: [1, 5, 10, 30, 60, 120], // seconds
  registers: [register],
});

// === Helper Functions ===

/**
 * Express middleware to track HTTP request metrics
 */
export function metricsMiddleware() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000; // Convert to seconds
      const route = req.route?.path || req.path || 'unknown';

      httpRequestDuration
        .labels(req.method, route, res.statusCode.toString())
        .observe(duration);

      httpRequestCounter
        .labels(req.method, route, res.statusCode.toString())
        .inc();
    });

    next();
  };
}

/**
 * Get metrics in Prometheus text format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics() {
  register.resetMetrics();
}

/**
 * Increment DLQ metrics
 */
export function incrementDlqMetrics(errorType: 'retryable' | 'permanent') {
  dlqProcessedCounter.labels(errorType).inc();
  if (errorType === 'permanent') {
    creditRefundCounter.labels('permanent_failure').inc();
  }
}

/**
 * Increment load shedding counter
 */
export function incrementLoadSheddingCounter() {
  loadSheddingCounter.inc();
}

/**
 * Increment stalled job counter
 */
export function incrementStalledJobCounter() {
  stalledJobCounter.inc();
}

export default register;
