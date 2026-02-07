/**
 * Mock Upstream Email Verification API
 *
 * This is a development server that simulates a real email verification API.
 * Returns fake verification results for testing purposes.
 *
 * Run with: npm run mock:upstream
 * Listens on: http://localhost:8080
 */

import express from 'express';
import type { Request, Response } from 'express';

const app = express();
app.use(express.json());

const PORT = 8080;

interface VerificationRequest {
  email: string;
  idempotencyKey?: string;
}

interface VerificationResult {
  email: string;
  status: 'valid' | 'invalid' | 'risky' | 'unknown';
  score: number;
  deliverability: 'deliverable' | 'undeliverable' | 'risky' | 'unknown';
  attributes: {
    disposable: boolean;
    freeProvider: boolean;
    roleAccount: boolean;
    catchAll: boolean;
    mxRecordsFound: boolean;
    smtpValid: boolean;
  };
  serverInfo: {
    processingTime: number;
    requestId: string;
    timestamp: string;
  };
}

// Simulate different response types based on email patterns
function generateMockResult(email: string): VerificationResult {
  const lowerEmail = email.toLowerCase();

  // Invalid email patterns
  if (lowerEmail.includes('invalid') || lowerEmail.includes('fake')) {
    return {
      email,
      status: 'invalid',
      score: 0.1,
      deliverability: 'undeliverable',
      attributes: {
        disposable: false,
        freeProvider: false,
        roleAccount: false,
        catchAll: false,
        mxRecordsFound: false,
        smtpValid: false,
      },
      serverInfo: {
        processingTime: Math.floor(Math.random() * 200) + 50,
        requestId: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Risky email patterns
  if (lowerEmail.includes('risky') || lowerEmail.includes('temp')) {
    return {
      email,
      status: 'risky',
      score: 0.5,
      deliverability: 'risky',
      attributes: {
        disposable: true,
        freeProvider: true,
        roleAccount: false,
        catchAll: false,
        mxRecordsFound: true,
        smtpValid: true,
      },
      serverInfo: {
        processingTime: Math.floor(Math.random() * 200) + 50,
        requestId: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Unknown email patterns
  if (lowerEmail.includes('unknown')) {
    return {
      email,
      status: 'unknown',
      score: 0.3,
      deliverability: 'unknown',
      attributes: {
        disposable: false,
        freeProvider: false,
        roleAccount: false,
        catchAll: true,
        mxRecordsFound: true,
        smtpValid: false,
      },
      serverInfo: {
        processingTime: Math.floor(Math.random() * 200) + 50,
        requestId: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Default: Valid email
  return {
    email,
    status: 'valid',
    score: 0.95,
    deliverability: 'deliverable',
    attributes: {
      disposable: false,
      freeProvider: lowerEmail.includes('gmail') || lowerEmail.includes('yahoo') || lowerEmail.includes('outlook'),
      roleAccount: lowerEmail.includes('support') || lowerEmail.includes('admin') || lowerEmail.includes('info'),
      catchAll: false,
      mxRecordsFound: true,
      smtpValid: true,
    },
    serverInfo: {
      processingTime: Math.floor(Math.random() * 200) + 50,
      requestId: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    },
  };
}

// Simulate occasional failures for testing error handling
let requestCount = 0;

// Match real API endpoint path: POST /verify/single
app.post('/verify/single', (req: Request<{}, {}, VerificationRequest>, res: Response) => {
  requestCount++;

  const { email, idempotencyKey } = req.body;

  if (!email) {
    return res.status(400).json({
      error: 'Email is required',
      message: 'Please provide an email address to verify',
    });
  }

  // Simulate 5% failure rate for circuit breaker testing
  if (Math.random() < 0.05) {
    console.error(`[Mock API] Simulated failure for email: ${email}`);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Simulated upstream API failure',
    });
  }

  // Simulate network delay (50-300ms)
  const delay = Math.floor(Math.random() * 250) + 50;

  setTimeout(() => {
    const result = generateMockResult(email);

    console.log(`[Mock API] Verified: ${email} -> ${result.status} (score: ${result.score})`);
    if (idempotencyKey) {
      console.log(`[Mock API] Idempotency key: ${idempotencyKey}`);
    }

    res.json(result);
  }, delay);
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    requestsProcessed: requestCount,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ Mock Upstream API running on http://localhost:${PORT}`);
  console.log(`📧 POST /verify/single - Verify email address`);
  console.log(`💚 GET /health - Health check\n`);
  console.log(`Test patterns:`);
  console.log(`  - test@gmail.com -> valid (score: 0.95)`);
  console.log(`  - invalid@test.com -> invalid (score: 0.1)`);
  console.log(`  - risky@temp.com -> risky (score: 0.5)`);
  console.log(`  - unknown@example.com -> unknown (score: 0.3)`);
  console.log(`\n🔄 Simulates 5% random failure rate for testing\n`);
});
