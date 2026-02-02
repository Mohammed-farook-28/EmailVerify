# Billing System Quickstart Guide

Complete guide to setting up and testing the EmailKit billing system with Stripe.

---

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Stripe account (test mode)
- Stripe CLI installed

---

## 1. Stripe Account Setup (15 minutes)

### Create Stripe Account
1. Go to [stripe.com](https://stripe.com)
2. Sign up for a free account
3. Stay in **Test Mode** (toggle in upper right)

### Get API Keys
1. Go to **Developers → API keys**
2. Copy your **Secret key** (starts with `sk_test_`)
3. Copy your **Publishable key** (starts with `pk_test_`)

### Install Stripe CLI
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Windows
scoop install stripe

# Linux
# Download from https://github.com/stripe/stripe-cli/releases
```

### Authenticate Stripe CLI
```bash
stripe login
```

---

## 2. Create Stripe Products & Prices (30 minutes)

You need to create 27 products in Stripe Dashboard:

### One-Time Packages (9 products)
1. Go to **Products → Add product**
2. Create each package:

| Product Name | Price | Price ID Variable |
|--------------|-------|-------------------|
| 1,000 Credits | $10 | STRIPE_PRICE_1K |
| 2,000 Credits | $18 | STRIPE_PRICE_2K |
| 5,000 Credits | $40 | STRIPE_PRICE_5K |
| 10,000 Credits | $75 | STRIPE_PRICE_10K |
| 25,000 Credits | $175 | STRIPE_PRICE_25K |
| 50,000 Credits | $325 | STRIPE_PRICE_50K |
| 100,000 Credits | $600 | STRIPE_PRICE_100K |
| 500,000 Credits | $2,750 | STRIPE_PRICE_500K |
| 1,000,000 Credits | $5,000 | STRIPE_PRICE_1M |

### Subscription Plans (18 prices - 9 products × 2 billing cycles)
Create each subscription plan with **Recurring** pricing:

| Plan | Monthly | Annual | Monthly Price ID | Annual Price ID |
|------|---------|--------|------------------|-----------------|
| Starter | $9/mo | $90/yr (save 17%) | STRIPE_PRICE_STARTER_MONTHLY | STRIPE_PRICE_STARTER_ANNUAL |
| Growth | $39/mo | $390/yr | STRIPE_PRICE_GROWTH_MONTHLY | STRIPE_PRICE_GROWTH_ANNUAL |
| Pro | $99/mo | $990/yr | STRIPE_PRICE_PRO_MONTHLY | STRIPE_PRICE_PRO_ANNUAL |
| Scale | $299/mo | $2,990/yr | STRIPE_PRICE_SCALE_MONTHLY | STRIPE_PRICE_SCALE_ANNUAL |
| Titan | $999/mo | $9,990/yr | STRIPE_PRICE_TITAN_MONTHLY | STRIPE_PRICE_TITAN_ANNUAL |

**For each subscription**:
- Set billing period (monthly or annual)
- Enable **Recurring**
- Set usage type: **Licensed**
- Copy the Price ID (starts with `price_`)

---

## 3. Configure Environment Variables

### Backend .env
```bash
cd backend

# Stripe API keys
STRIPE_SECRET_KEY=sk_test_<your_secret_key>
STRIPE_PUBLISHABLE_KEY=pk_test_<your_publishable_key>
STRIPE_WEBHOOK_SECRET=whsec_<will_get_from_cli>

# One-time packages (copy from Stripe Dashboard)
STRIPE_PRICE_1K=price_<from_stripe>
STRIPE_PRICE_2K=price_<from_stripe>
STRIPE_PRICE_5K=price_<from_stripe>
STRIPE_PRICE_10K=price_<from_stripe>
STRIPE_PRICE_25K=price_<from_stripe>
STRIPE_PRICE_50K=price_<from_stripe>
STRIPE_PRICE_100K=price_<from_stripe>
STRIPE_PRICE_500K=price_<from_stripe>
STRIPE_PRICE_1M=price_<from_stripe>

# Subscription plans (copy from Stripe Dashboard)
STRIPE_PRICE_STARTER_MONTHLY=price_<from_stripe>
STRIPE_PRICE_STARTER_ANNUAL=price_<from_stripe>
STRIPE_PRICE_GROWTH_MONTHLY=price_<from_stripe>
STRIPE_PRICE_GROWTH_ANNUAL=price_<from_stripe>
STRIPE_PRICE_PRO_MONTHLY=price_<from_stripe>
STRIPE_PRICE_PRO_ANNUAL=price_<from_stripe>
STRIPE_PRICE_SCALE_MONTHLY=price_<from_stripe>
STRIPE_PRICE_SCALE_ANNUAL=price_<from_stripe>
STRIPE_PRICE_TITAN_MONTHLY=price_<from_stripe>
STRIPE_PRICE_TITAN_ANNUAL=price_<from_stripe>
```

---

## 4. Database Setup

### Apply Migrations
```bash
cd backend
npm run migrate
```

This creates:
- `subscription` table
- `checkout_session` table
- `processed_webhook_event` table
- Extends `credit_event` with metadata column

### Verify Tables
```bash
npm run db:studio
```

Open http://localhost:4983 to browse database.

---

## 5. Start Backend Server

```bash
cd backend
npm run dev
```

You should see:
```
Stripe configuration: 19/19 price IDs configured (100%)
EmailKit backend running on port 3000 [development]
```

If you see less than 100%, some price IDs are missing. Check your .env file.

---

## 6. Set Up Webhook Forwarding

**Terminal 2** (keep running):
```bash
stripe listen --forward-to http://localhost:3000/api/billing/webhook
```

You'll see:
```
Ready! You are using Stripe API Version [2025-01-27]. Your webhook signing secret is whsec_abc123...
```

**Copy the webhook secret** (`whsec_...`) to your backend/.env:
```bash
STRIPE_WEBHOOK_SECRET=whsec_abc123...
```

**Restart the backend** to load the new webhook secret.

---

## 7. Test One-Time Purchase

### Using curl
```bash
# 1. Get auth token (assuming you have a logged-in user)
# Replace <token> with actual session token

# 2. Create checkout session
curl -X POST http://localhost:3000/api/billing/checkout/one-time \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"packageId":"1K"}'

# Response:
# {
#   "sessionId": "cs_test_abc123...",
#   "url": "https://checkout.stripe.com/c/pay/cs_test_abc123..."
# }

# 3. Open the checkout URL in your browser
# Use test card: 4242 4242 4242 4242
# Expiry: any future date (e.g., 12/34)
# CVC: any 3 digits (e.g., 123)

# 4. Complete payment

# 5. Check webhook logs in Terminal 2 - you should see:
# checkout.session.completed
# payment_intent.succeeded

# 6. Verify credits added
curl http://localhost:3000/api/billing/info \
  -H "Cookie: <your-session-cookie>"

# Response:
# {
#   "balance": 1000,
#   "subscription": null
# }
```

### Using Stripe CLI to Trigger Events
```bash
# Trigger checkout completion
stripe trigger checkout.session.completed

# Check backend logs to see webhook processed
```

---

## 8. Test Subscription

### Create Subscription
```bash
curl -X POST http://localhost:3000/api/billing/checkout/subscription \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"planId":"starter-monthly"}'

# Response:
# {
#   "sessionId": "cs_test_xyz789...",
#   "url": "https://checkout.stripe.com/c/pay/cs_test_xyz789..."
# }
```

### Complete Checkout
1. Open the URL in browser
2. Use test card: 4242 4242 4242 4242
3. Complete subscription

### Verify Subscription Active
```bash
curl http://localhost:3000/api/billing/info \
  -H "Cookie: <your-session-cookie>"

# Response:
# {
#   "balance": 2000,  # 1000 from purchase + 1000 from subscription
#   "subscription": {
#     "planId": "starter-monthly",
#     "status": "active",
#     "currentPeriodStart": "2026-02-02T...",
#     "currentPeriodEnd": "2026-03-02T...",
#     "cancelAtPeriodEnd": false
#   }
# }
```

---

## 9. Test Subscription Management

### Upgrade Subscription
```bash
curl -X POST http://localhost:3000/api/billing/subscription/change \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"newPlanId":"pro-monthly"}'

# Response:
# {
#   "success": true,
#   "type": "upgrade",
#   "effectiveDate": "2026-02-02T...",
#   "message": "Subscription upgraded immediately"
# }
```

### Cancel Subscription
```bash
curl -X POST http://localhost:3000/api/billing/subscription/cancel \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>"

# Response:
# {
#   "success": true,
#   "cancelAt": "2026-03-02T...",
#   "message": "Your subscription will be canceled at the end of the current billing period"
# }
```

### Reactivate Subscription
```bash
curl -X POST http://localhost:3000/api/billing/subscription/reactivate \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>"

# Response:
# {
#   "success": true,
#   "message": "Your subscription has been reactivated"
# }
```

---

## 10. Test Transaction History

### Get Recent Transactions
```bash
curl "http://localhost:3000/api/billing/transactions?limit=10&offset=0" \
  -H "Cookie: <your-session-cookie>"

# Response:
# {
#   "transactions": [
#     {
#       "id": "abc123",
#       "type": "purchase",
#       "amount": 1000,
#       "balanceAfter": 1000,
#       "metadata": {"packageId": "1K"},
#       "createdAt": "2026-02-02T..."
#     },
#     {
#       "id": "xyz789",
#       "type": "subscription",
#       "amount": 1000,
#       "balanceAfter": 2000,
#       "metadata": {"planId": "starter-monthly", "expiresAt": "..."},
#       "createdAt": "2026-02-02T..."
#     }
#   ]
# }
```

### Export CSV
```bash
curl "http://localhost:3000/api/billing/transactions/export" \
  -H "Cookie: <your-session-cookie>" \
  -o transactions.csv

# Opens CSV file with all transactions
```

---

## 11. Test Subscription Renewal Worker

### Manual Run
```bash
cd backend
npm run workers:subscription-renewal
```

This processes any subscriptions that have passed their period end.

### Schedule with Cron (Production)
```bash
# Add to crontab
0 0 * * * cd /path/to/backend && npm run workers:subscription-renewal
```

Runs daily at midnight.

---

## 12. Monitor Webhook Events

### Stripe Dashboard
1. Go to **Developers → Webhooks**
2. Click on your webhook endpoint
3. View **Events** tab to see all events received
4. Check **Response** to see success/failure

### Backend Logs
```bash
cd backend
npm run dev

# Watch logs for:
# - "Webhook event processed successfully"
# - "One-time purchase credits added"
# - "Subscription credits added"
# - "Subscription renewal processed successfully"
```

---

## Common Issues

### "Package not configured" Error
**Problem**: Price ID not set in .env
**Solution**: Add the missing STRIPE_PRICE_* variable to .env and restart server

### "Invalid signature" Webhook Error
**Problem**: Webhook secret doesn't match
**Solution**:
1. Check `stripe listen` output for webhook secret
2. Copy to STRIPE_WEBHOOK_SECRET in .env
3. Restart backend server

### Credits Not Added
**Problem**: Webhook not processed
**Solution**:
1. Check `stripe listen` is running
2. Check backend logs for webhook errors
3. Verify STRIPE_WEBHOOK_SECRET is correct
4. Check Stripe Dashboard → Webhooks for delivery status

### "You already have an active subscription"
**Problem**: User already subscribed
**Solution**:
1. Cancel existing subscription first
2. Or upgrade/downgrade using /subscription/change endpoint

---

## Test Cards

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Insufficient funds: 4000 0000 0000 9995
Requires authentication: 4000 0025 0000 3155
```

Expiry: Any future date
CVC: Any 3 digits

More test cards: https://stripe.com/docs/testing

---

## Production Deployment

### 1. Use Live Mode Keys
- Switch to **Live Mode** in Stripe Dashboard
- Copy live API keys (start with `sk_live_` and `pk_live_`)
- Update production .env

### 2. Configure Webhook Endpoint
- Go to **Developers → Webhooks → Add endpoint**
- URL: `https://your-domain.com/api/billing/webhook`
- Events to send: Select all `checkout.*`, `payment_intent.*`, `invoice.*`, `customer.subscription.*`
- Copy webhook signing secret to production .env

### 3. Enable Strict Mode
Backend validates all 19 price IDs on startup in production:
```typescript
// src/server.ts
const strictMode = env.isProduction; // true in production
validateStripePriceIds(strictMode);
```

If any price IDs are missing, server won't start.

### 4. Set Up Cron Job
```bash
# Production crontab
0 0 * * * cd /var/www/emailkit/backend && npm run workers:subscription-renewal >> /var/log/subscription-renewal.log 2>&1
```

### 5. Monitor Webhooks
- Set up alerts for webhook failures
- Monitor Stripe Dashboard → Webhooks → Event log
- Check backend logs for "Webhook event processed successfully"

---

## Next Steps

- **Frontend**: Implement checkout UI, polling page, modals
- **Testing**: Write unit/integration tests for billing service
- **Monitoring**: Add Prometheus metrics for checkout success rate
- **Email**: Implement email notifications for payment failures

---

## Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe CLI Reference](https://stripe.com/docs/stripe-cli)
- EmailKit Billing Spec: `specs/003-billing/spec.md`
- EmailKit Implementation Plan: `specs/003-billing/plan.md`

---

**Questions?** Check the [Implementation Status](../specs/003-billing/IMPLEMENTATION_STATUS.md) document for detailed technical information.
