# API Reference Documentation

## Overview
The EmailVerify API provides programmatic access to email verification services. All API endpoints are RESTful and return JSON responses.

---

## Base URL
```
https://api.emailverify.ai/v1
```

---

## Authentication

All API requests require authentication via Bearer token in the Authorization header.

```
Authorization: Bearer YOUR_API_KEY
```

API keys can be generated from the dashboard at `/home/api-keys`. Keys use the `sk_` prefix format.

---

## Endpoints

### Single Email Verification

#### POST /verify

Verify a single email address.

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Email address to verify |

**Example Request**
```bash
curl -X POST https://api.emailverify.ai/v1/verify \
  -H "Authorization: Bearer sk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

**Response**
```json
{
  "email": "test@example.com",
  "status": "valid",
  "sub_status": null,
  "free_email": false,
  "disposable": false,
  "role_account": false,
  "mx_found": true,
  "mx_record": "mail.example.com",
  "smtp_provider": "Google",
  "catch_all": false,
  "credits_used": 1
}
```

**Status Values**
| Status | Description |
|--------|-------------|
| valid | Email is valid and deliverable |
| invalid | Email is invalid or undeliverable |
| unknown | Unable to determine validity |
| accept_all | Domain accepts all emails (catch-all) |

---

### Bulk Email Verification

#### POST /verify/bulk

Submit a batch of emails for verification.

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| emails | array | Yes | Array of email addresses (max 10,000 per batch) |
| webhook_url | string | No | URL to receive completion notification |

**Example Request**
```bash
curl -X POST https://api.emailverify.ai/v1/verify/bulk \
  -H "Authorization: Bearer sk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"emails": ["email1@example.com", "email2@example.com"]}'
```

**Response**
```json
{
  "job_id": "bulk_abc123def456",
  "status": "pending",
  "total_emails": 2,
  "estimated_completion": "2026-01-29T12:00:00Z",
  "credits_reserved": 2
}
```

---

#### GET /verify/bulk/{job_id}

Check the status of a bulk verification job.

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| job_id | string | The bulk job ID |

**Example Request**
```bash
curl https://api.emailverify.ai/v1/verify/bulk/bulk_abc123def456 \
  -H "Authorization: Bearer sk_your_api_key"
```

**Response**
```json
{
  "job_id": "bulk_abc123def456",
  "status": "processing",
  "total_emails": 1000,
  "processed": 750,
  "progress_percent": 75,
  "created_at": "2026-01-29T11:00:00Z",
  "updated_at": "2026-01-29T11:30:00Z"
}
```

**Job Status Values**
| Status | Description |
|--------|-------------|
| pending | Job is queued |
| processing | Job is being processed |
| completed | Job finished successfully |
| failed | Job failed |

---

#### GET /verify/bulk/{job_id}/results

Download results of a completed bulk verification job.

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| job_id | string | The bulk job ID |

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| format | string | Response format: `json` (default) or `csv` |
| status | string | Filter by status: `valid`, `invalid`, `unknown`, `accept_all` |

**Example Request**
```bash
curl "https://api.emailverify.ai/v1/verify/bulk/bulk_abc123def456/results?format=json" \
  -H "Authorization: Bearer sk_your_api_key"
```

**Response**
```json
{
  "job_id": "bulk_abc123def456",
  "total_results": 1000,
  "results": [
    {
      "email": "valid@example.com",
      "status": "valid",
      "sub_status": null
    },
    {
      "email": "invalid@example.com",
      "status": "invalid",
      "sub_status": "mailbox_not_found"
    }
  ]
}
```

---

### Credits

#### GET /credits

Check current credit balance.

**Example Request**
```bash
curl https://api.emailverify.ai/v1/credits \
  -H "Authorization: Bearer sk_your_api_key"
```

**Response**
```json
{
  "balance": 5000,
  "subscription": {
    "plan": "Professional",
    "monthly_credits": 10000,
    "renewal_date": "2026-02-01"
  }
}
```

---

## Webhooks

### POST /webhooks

Create a new webhook endpoint.

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| url | string | Yes | URL to receive webhook events |
| events | array | Yes | Event types to subscribe to |
| secret | string | No | Secret for signature verification |

**Event Types**
| Event | Description |
|-------|-------------|
| verification.completed | Single verification completed |
| bulk.completed | Bulk job completed |
| bulk.failed | Bulk job failed |
| credits.low | Credit balance below threshold |

**Example Request**
```bash
curl -X POST https://api.emailverify.ai/v1/webhooks \
  -H "Authorization: Bearer sk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhook",
    "events": ["bulk.completed", "credits.low"]
  }'
```

---

### GET /webhooks

List all configured webhooks.

**Response**
```json
{
  "webhooks": [
    {
      "id": "wh_abc123",
      "url": "https://your-app.com/webhook",
      "events": ["bulk.completed", "credits.low"],
      "created_at": "2026-01-15T10:00:00Z"
    }
  ]
}
```

---

### DELETE /webhooks/{webhook_id}

Delete a webhook endpoint.

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| webhook_id | string | The webhook ID |

---

## Rate Limiting

API requests are rate limited based on your subscription plan.

**Rate Limit Headers**
| Header | Description |
|--------|-------------|
| X-RateLimit-Limit | Maximum requests per minute |
| X-RateLimit-Remaining | Remaining requests in current window |
| X-RateLimit-Reset | Unix timestamp when limit resets |

**Default Limits by Plan**
| Plan | Requests/Minute |
|------|-----------------|
| Starter | 60 |
| Professional | 120 |
| Business | 300 |
| Enterprise+ | 600 |

---

## Error Codes

**HTTP Status Codes**
| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing API key |
| 402 | Payment Required - Insufficient credits |
| 403 | Forbidden - Access denied |
| 404 | Not Found - Resource not found |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

**Error Response Format**
```json
{
  "error": {
    "code": "insufficient_credits",
    "message": "You do not have enough credits to perform this operation",
    "details": {
      "required": 100,
      "available": 50
    }
  }
}
```

**Common Error Codes**
| Code | Description |
|------|-------------|
| invalid_email | Email format is invalid |
| insufficient_credits | Not enough credits |
| rate_limit_exceeded | Too many requests |
| invalid_api_key | API key is invalid or expired |
| job_not_found | Bulk job ID not found |
| job_not_ready | Bulk job still processing |

---

## SDKs

Official SDKs are available for:

| Language | Package |
|----------|---------|
| Node.js | `npm install emailverify-sdk` |
| Python | `pip install emailverify` |
| Go | `go get github.com/emailverify/go-sdk` |
| PHP | `composer require emailverify/sdk` |
| Java | Maven: `com.emailverify:sdk` |
| TypeScript | `npm install @emailverify/typescript-sdk` |

---

## Best Practices

1. **Store API keys securely** - Never expose in client-side code
2. **Handle rate limits** - Implement exponential backoff
3. **Use webhooks** - Avoid polling for bulk job status
4. **Batch emails** - Use bulk endpoint for multiple emails
5. **Monitor credits** - Set up credits.low webhook alerts

---

## Documentation URL
`https://emailverify.ai/docs/api-reference`

---

## Related Pages
- API Keys Management: /home/api-keys
- Usage History: /home/usage
- Billing: /home/billing
