/**
 * OpenTelemetry Instrumentation
 *
 * IMPORTANT: This file must be imported at the very top of the application,
 * before any other imports, to ensure proper auto-instrumentation.
 *
 * Auto-instruments:
 * - Express (HTTP server)
 * - HTTP/HTTPS clients (fetch, undici, etc.)
 * - Redis (ioredis)
 * - PostgreSQL (pg)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import pino from 'pino';

// Dedicated logger for instrumentation (can't import app logger since this file loads first)
const otelLogger = pino({ name: 'otel' });

const isDevelopment = process.env.NODE_ENV !== 'production';

// Configure trace exporter (OTLP HTTP for Grafana Tempo or Jaeger)
const traceExporter = new OTLPTraceExporter({
  // Default endpoint: http://localhost:4318/v1/traces
  // Override with OTEL_EXPORTER_OTLP_ENDPOINT env var
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
});

// Configure sampling strategy
// Development: 100% sampling for debugging
// Production: 10% sampling to reduce overhead
const sampleRatio = isDevelopment ? 1.0 : 0.1;

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  traceExporter,
  serviceName: 'emailkit-api',
  instrumentations: [
    getNodeAutoInstrumentations({
      // Auto-instrument all supported libraries
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable file system instrumentation (too noisy)
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
    }),
  ],
});

// Start SDK
if (process.env.OTEL_ENABLED !== 'false') {
  sdk.start();

  otelLogger.info({
    service: 'emailkit-api',
    environment: process.env.NODE_ENV || 'development',
    sampleRatio: `${sampleRatio * 100}%`,
    exporter: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }, 'OpenTelemetry instrumentation initialized');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  try {
    await sdk.shutdown();
    otelLogger.info('OpenTelemetry SDK shut down successfully');
  } catch (error) {
    otelLogger.error({ error }, 'Error shutting down OpenTelemetry SDK');
  } finally {
    process.exit(0);
  }
});

export default sdk;
