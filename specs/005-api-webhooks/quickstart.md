# Quickstart Guide: EmailKit API

## Getting Started

### 1. Create an API Key

1. Log in to your EmailKit dashboard
2. Navigate to **Settings → API Keys**
3. Click **Create API Key**
4. Enter a name (e.g., "Production")
5. Select expiration (or "Never")
6. Complete re-authentication
7. **Copy and save your API key** - it won't be shown again!

Your API key will look like: `ek_Ue7HpvL9xK2mN3oP4qR5sT6uV7wX8yZ9aB0cD1eF2gH`

### 2. Test Your API Key

```bash
curl -X POST https://api.emailkit.io/api/v1/verify \
  -H "Authorization: Bearer ek_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"email": "test@example.com"}'
```

**Response:**
```json
{
  "email": "test@example.com",
  "status": "valid",
  "score": 0.95,
  "deliverability": "deliverable",
  "attributes": {
    "disposable": false,
    "freeProvider": false,
    "roleAccount": false,
    "catchAll": false,
    "mxRecordsFound": true,
    "smtpValid": true
  },
  "requestId": "req_abc123"
}
```

## Test Mode

For development, create a test API key:
1. Toggle **"Test Mode"** when creating the key
2. Your key will have prefix `ek_test_`
3. Test keys return mock successful responses without consuming credits

```bash
# Test mode - no credits used
curl -X POST https://api.emailkit.io/api/v1/verify \
  -H "Authorization: Bearer ek_test_YOUR_TEST_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"email": "test@example.com"}'
```

## API Examples

### Single Verification

```javascript
const response = await fetch('https://api.emailkit.io/api/v1/verify', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({ email: 'user@example.com' }),
});

const result = await response.json();
console.log(result.status); // 'valid', 'invalid', 'risky', or 'unknown'
```

### Batch Verification (up to 100 emails)

```javascript
const response = await fetch('https://api.emailkit.io/api/v1/verify/batch', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({
    emails: [
      'user1@example.com',
      'user2@example.com',
      'user3@example.com',
    ],
  }),
});

const { results, creditsUsed } = await response.json();
```

### Bulk Verification (async, 10K+ emails)

```javascript
// 1. Submit job
const submitResponse = await fetch('https://api.emailkit.io/api/v1/verify/bulk', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({
    emails: largeEmailArray, // up to 500K based on tier
  }),
});

const job = await submitResponse.json();
console.log(job.id); // 'job_xyz789'

// 2. Poll for status
let status;
do {
  await new Promise(resolve => setTimeout(resolve, 5000)); // wait 5s
  const statusResponse = await fetch(
    `https://api.emailkit.io/api/v1/verify/bulk/${job.id}`,
    { headers: { 'Authorization': `Bearer ${API_KEY}` } }
  );
  status = await statusResponse.json();
  console.log(`Progress: ${status.progress}%`);
} while (status.status === 'processing');

// 3. Download results
if (status.status === 'completed') {
  window.location.href = status.resultUrl;
}
```

### Check Credit Balance

```javascript
const response = await fetch('https://api.emailkit.io/api/v1/credits', {
  headers: { 'Authorization': `Bearer ${API_KEY}` },
});

const { balance, updatedAt } = await response.json();
console.log(`You have ${balance} credits`);
```

## Webhooks

### Create a Webhook

```javascript
const response = await fetch('https://api.emailkit.io/api/v1/webhooks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': crypto.randomUUID(),
  },
  body: JSON.stringify({
    url: 'https://your-server.com/webhooks/emailkit',
    events: ['verification.completed', 'bulk.completed', 'credits.low'],
    payloadMode: 'full', // or 'summary'
  }),
});

const webhook = await response.json();
console.log('Signing secret:', webhook.secret); // Save this! Only shown once.
```

### Verify Webhook Signatures

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const [timestampPart, signaturePart] = signature.split(',');
  const timestamp = timestampPart.replace('t=', '');
  const expectedSig = signaturePart.replace('v1=', '');

  // Verify timestamp is recent (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    throw new Error('Webhook timestamp too old');
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const computedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Constant-time comparison
  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(computedSig))) {
    throw new Error('Invalid webhook signature');
  }

  return true;
}

// Express middleware example
app.post('/webhooks/emailkit', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body.toString();

  try {
    verifyWebhookSignature(payload, signature, WEBHOOK_SECRET);
    const event = JSON.parse(payload);

    switch (event.type) {
      case 'verification.completed':
        console.log('Email verified:', event.data.email);
        break;
      case 'bulk.completed':
        console.log('Bulk job done:', event.data.jobId);
        break;
      case 'credits.low':
        console.log('Low credits:', event.data.balance);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

## Error Handling

```javascript
async function verifyEmail(email) {
  const response = await fetch('https://api.emailkit.io/api/v1/verify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json();

    switch (response.status) {
      case 401:
        throw new Error('Invalid API key');
      case 402:
        throw new Error(`Insufficient credits. Need ${error.creditsRequired}, have ${error.creditsAvailable}`);
      case 422:
        throw new Error(`Validation error: ${error.message}`);
      case 429:
        const retryAfter = response.headers.get('Retry-After');
        throw new Error(`Rate limited. Retry after ${retryAfter} seconds`);
      default:
        throw new Error(error.message);
    }
  }

  return response.json();
}
```

## Rate Limits

Check rate limit headers in every response:

```javascript
const response = await fetch('https://api.emailkit.io/api/v1/verify', { ... });

const limit = response.headers.get('X-RateLimit-Limit');
const remaining = response.headers.get('X-RateLimit-Remaining');
const reset = response.headers.get('X-RateLimit-Reset');

console.log(`${remaining}/${limit} requests remaining (resets at ${new Date(reset * 1000)})`);
```

## Idempotency

All POST requests require an `Idempotency-Key` header:

- Use a unique UUID v4 for each request
- If you retry with the same key within 24 hours, you get the cached response
- Prevents duplicate charges on network retries

```javascript
// Generate unique key for each logical operation
const idempotencyKey = crypto.randomUUID();

// Safe to retry this request - same result guaranteed
await fetch('/api/v1/verify', {
  headers: {
    'Idempotency-Key': idempotencyKey,
    // ...
  },
});
```

## SDKs

Official SDKs coming soon:
- Node.js / TypeScript
- Python
- Ruby
- PHP
- Go

For now, use the REST API directly with the examples above.
