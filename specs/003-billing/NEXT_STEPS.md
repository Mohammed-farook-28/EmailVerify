# Epic 3 Billing: Next Steps Quick Guide

## What's Been Done ✅

**Backend is 100% complete for Phases 1-3**:
- Stripe SDK integrated
- All database tables created (migration ready)
- Credit service extended (purchase, subscription, expire)
- Billing service complete (info, history, CSV export)
- Checkout routes complete (create, poll, status)
- Webhook handlers complete (8 event types)
- Routes registered in app.ts

**Backend is 80% complete for Phases 6-7**:
- Transaction history API ready
- CSV export API ready
- Pricing display APIs ready (packages, plans)

## What's Next 🚀

### Option 1: Complete Phase 3 MVP (One-Time Purchases)
**Goal**: Get users buying credits ASAP
**Effort**: 4-6 hours
**Tasks**: Frontend implementation (T029-T035)

#### Step-by-Step

1. **Set up Stripe Test Account** (15 min)
   ```bash
   # 1. Go to stripe.com, create test account
   # 2. Copy keys from Dashboard → Developers → API keys
   # 3. Update backend/.env:
   STRIPE_SECRET_KEY=sk_test_<actual_key>
   STRIPE_PUBLISHABLE_KEY=pk_test_<actual_key>

   # 4. Install Stripe CLI: https://stripe.com/docs/stripe-cli
   # 5. Forward webhooks:
   stripe listen --forward-to http://localhost:3000/api/billing/webhook

   # 6. Copy webhook secret to backend/.env:
   STRIPE_WEBHOOK_SECRET=whsec_<actual_secret>
   ```

2. **Apply Database Migration** (5 min)
   ```bash
   cd backend
   npm run migrate
   # If fails: verify PostgreSQL is running and DATABASE_URL is correct
   ```

3. **Create Billing API Client** (30 min)
   ```typescript
   // frontend/src/lib/api/billing.ts
   export async function createOneTimeCheckout(packageId: string) {
     const res = await fetch('/api/billing/checkout/one-time', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ packageId }),
       credentials: 'include',
     });
     if (!res.ok) throw new Error('Checkout failed');
     return res.json(); // { sessionId, url }
   }

   export async function pollCheckoutStatus(sessionId: string) {
     const res = await fetch(`/api/billing/checkout/status/${sessionId}`, {
       credentials: 'include',
     });
     if (!res.ok) throw new Error('Failed to get status');
     return res.json(); // { status, paymentStatus }
   }

   export async function getBillingInfo() {
     const res = await fetch('/api/billing/info', { credentials: 'include' });
     if (!res.ok) throw new Error('Failed to get billing info');
     return res.json(); // { balance, subscription? }
   }
   ```

4. **Create useCheckout Hook** (45 min)
   ```typescript
   // frontend/src/hooks/useCheckout.ts
   import { useMutation } from '@tanstack/react-query';
   import { createOneTimeCheckout } from '@/lib/api/billing';

   export function useCheckout() {
     return useMutation({
       mutationFn: (packageId: string) => createOneTimeCheckout(packageId),
       onSuccess: (data) => {
         // Redirect to Stripe checkout
         window.location.href = data.url;
       },
     });
   }
   ```

5. **Wire Package Grid** (30 min)
   ```typescript
   // In existing package-grid component
   import { useCheckout } from '@/hooks/useCheckout';

   function PackageGrid() {
     const checkout = useCheckout();

     const handleBuy = (packageId: string) => {
       checkout.mutate(packageId);
     };

     return (
       // ... existing grid code
       <button onClick={() => handleBuy('1K')}>Buy 1,000 Credits</button>
     );
   }
   ```

6. **Create Checkout Return Page** (1 hour)
   ```typescript
   // frontend/src/app/(dashboard)/home/billing/checkout-return/page.tsx
   'use client';
   import { useEffect, useState } from 'react';
   import { useSearchParams } from 'next/navigation';
   import { pollCheckoutStatus } from '@/lib/api/billing';

   export default function CheckoutReturn() {
     const searchParams = useSearchParams();
     const sessionId = searchParams.get('session_id');
     const [status, setStatus] = useState<'polling' | 'success' | 'failed'>('polling');

     useEffect(() => {
       if (!sessionId) return;

       const poll = async () => {
         const interval = setInterval(async () => {
           const result = await pollCheckoutStatus(sessionId);
           if (result.status === 'complete' && result.paymentStatus === 'paid') {
             setStatus('success');
             clearInterval(interval);
           } else if (result.status === 'expired') {
             setStatus('failed');
             clearInterval(interval);
           }
         }, 2000); // Poll every 2 seconds

         // Timeout after 30 seconds
         setTimeout(() => clearInterval(interval), 30000);

         return () => clearInterval(interval);
       };

       poll();
     }, [sessionId]);

     if (status === 'polling') return <div>Processing payment...</div>;
     if (status === 'success') return <SuccessModal />;
     if (status === 'failed') return <FailureModal />;
   }
   ```

7. **Add Success/Failure Modals** (30 min)
   ```typescript
   // Use existing modal components or create new ones
   // Show credit balance update on success
   // Show retry button on failure
   ```

8. **Test End-to-End** (30 min)
   ```bash
   # 1. Start backend
   cd backend && npm run dev

   # 2. Start frontend
   cd frontend && npm run dev

   # 3. Forward webhooks
   stripe listen --forward-to http://localhost:3000/api/billing/webhook

   # 4. Test flow:
   # - Click "Buy 1K Credits"
   # - Complete Stripe checkout (use test card: 4242 4242 4242 4242)
   # - Return to checkout-return page
   # - Verify success modal shows
   # - Verify credits added to balance
   ```

**Done!** One-time purchases are live. Users can buy credits.

---

### Option 2: Complete Full MVP (Phase 4 - Subscriptions)
**Goal**: Enable monthly/annual subscriptions
**Effort**: 6-8 hours (after completing Option 1)
**Tasks**: T036-T048

#### Quick Tasks
1. Create POST `/api/billing/checkout/subscription` route (copy from one-time, change mode to 'subscription')
2. Add invoice.paid handler logic to allocate subscription credits
3. Add customer.subscription.created handler to create subscription record
4. Frontend: Wire pricing-plan-card to subscription checkout
5. Frontend: Add billing cycle toggle (monthly/annual)
6. Test with Stripe Test Clocks for instant renewals

---

### Option 3: Polish & Production (Phases 5-8)
**Goal**: Full feature set + production readiness
**Effort**: 2-3 days
**Tasks**: T049-T090

#### Includes
- Subscription management (upgrade, downgrade, cancel, reactivate)
- Transaction history frontend
- Public pricing page
- Configure all 27 Stripe products
- Add price IDs to env
- Subscription renewal worker (cron)
- Comprehensive tests
- Documentation

---

## Testing Stripe Locally

### Install Stripe CLI
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Windows
scoop install stripe

# Linux
# See: https://stripe.com/docs/stripe-cli
```

### Forward Webhooks
```bash
stripe listen --forward-to http://localhost:3000/api/billing/webhook
# Copy the webhook secret (whsec_...) to backend/.env
```

### Trigger Test Events
```bash
# Test checkout completion
stripe trigger checkout.session.completed

# Test payment success
stripe trigger payment_intent.succeeded

# Test payment failure
stripe trigger payment_intent.payment_failed
```

### Test Cards
```
Success: 4242 4242 4242 4242 (any expiry, any CVC)
Decline: 4000 0000 0000 0002
Insufficient funds: 4000 0000 0000 9995
```

---

## File Reference

### Backend Files Created
```
backend/src/
├── config/
│   └── stripe.ts                    # Stripe config
├── services/
│   ├── payment-provider.ts          # Payment interface
│   ├── stripe-client.ts             # Stripe implementation
│   ├── billing.ts                   # Billing service
│   └── credit.ts                    # Extended credit service
├── middleware/
│   └── stripe-signature.ts          # Webhook verification
├── routes/
│   ├── billing.ts                   # 7 billing endpoints
│   └── webhooks.ts                  # Webhook handler
└── db/
    └── schema.ts                    # Extended with 3 tables
```

### Migration Files
```
backend/drizzle/
└── 0002_minor_lethal_legion.sql     # Billing tables
```

### Frontend Files Needed
```
frontend/src/
├── lib/api/
│   └── billing.ts                   # API client (TODO)
├── hooks/
│   ├── useCheckout.ts               # Checkout hook (TODO)
│   ├── useBilling.ts                # Billing info hook (TODO)
│   └── useTransactionHistory.ts     # History hook (TODO)
├── app/(dashboard)/home/billing/
│   └── checkout-return/
│       └── page.tsx                 # Return page (TODO)
└── components/
    ├── billing/
    │   ├── package-grid.tsx         # Wire to API (TODO)
    │   └── pricing-plan-card.tsx    # Wire to API (TODO)
    └── modals/
        ├── payment-success-modal.tsx # Success modal (TODO)
        └── payment-failed-modal.tsx  # Failure modal (TODO)
```

---

## Environment Variables Needed

### Minimum (for testing)
```bash
# backend/.env
STRIPE_SECRET_KEY=sk_test_...        # From Stripe Dashboard
STRIPE_PUBLISHABLE_KEY=pk_test_...   # From Stripe Dashboard
STRIPE_WEBHOOK_SECRET=whsec_...      # From stripe listen command
```

### Production (Phase 8)
Add 27 price IDs:
```bash
STRIPE_PRICE_1K=price_...
STRIPE_PRICE_2K=price_...
# ... 25 more
```

---

## Common Issues

### Migration Fails
**Error**: `role "user" does not exist`
**Fix**: Update DATABASE_URL in backend/.env with correct PostgreSQL credentials

### Webhook Signature Invalid
**Error**: `Invalid signature`
**Fix**: Ensure webhook route uses express.raw() (already done in app.ts)
**Fix**: Verify STRIPE_WEBHOOK_SECRET matches Stripe CLI output

### Checkout Returns 500
**Error**: `Package not configured`
**Fix**: Price IDs are undefined. For testing, you can hardcode a test price ID or create products in Stripe Dashboard

### Credits Not Added
**Check**: Webhook logs in Stripe CLI output
**Check**: Backend logs for "Webhook event processed successfully"
**Check**: Database credit_event table for new rows

---

## API Endpoints Quick Reference

### Public (No Auth)
```
GET  /api/billing/packages          # List all credit packages
GET  /api/billing/plans              # List all subscription plans
```

### Authenticated
```
POST /api/billing/checkout/one-time  # Create checkout (body: {packageId})
GET  /api/billing/checkout/status/:sessionId  # Poll status
GET  /api/billing/info               # Get balance + subscription
GET  /api/billing/transactions       # Get history (query: limit, offset, startDate)
GET  /api/billing/transactions/export # Export CSV
```

### Webhook (Stripe Only)
```
POST /api/billing/webhook            # Stripe webhook endpoint
```

---

## Database Schema Quick Reference

### New Tables
```sql
-- Subscriptions (one per user)
subscription (
  id, user_id, stripe_subscription_id, stripe_price_id,
  plan_id, status, current_period_start, current_period_end,
  cancel_at_period_end, canceled_at, created_at, updated_at
)

-- Checkout session tracking
checkout_session (
  id, user_id, type, status, payment_status,
  metadata, created_at, completed_at
)

-- Webhook idempotency
processed_webhook_event (
  id, type, processed_at
)
```

### Extended Tables
```sql
-- Added metadata column
credit_event (
  ..., metadata JSONB
)
```

---

## Quick Commands

### Start Development
```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: Stripe webhooks
stripe listen --forward-to http://localhost:3000/api/billing/webhook
```

### Database
```bash
# Apply migrations
cd backend && npm run migrate

# Generate new migration (after schema changes)
npm run db:generate

# Open Drizzle Studio (DB GUI)
npm run db:studio
```

### Testing
```bash
# Backend tests (when written)
cd backend && npm test

# Trigger Stripe test event
stripe trigger checkout.session.completed
```

---

## Resources

- **Plan**: `specs/003-billing/plan.md` - Detailed task breakdown
- **Spec**: `specs/003-billing/spec.md` - Requirements & acceptance criteria
- **Data Model**: `specs/003-billing/data-model.md` - Database schema details
- **Status**: `specs/003-billing/IMPLEMENTATION_STATUS.md` - This document
- **Stripe Docs**: https://stripe.com/docs/api
- **Stripe Testing**: https://stripe.com/docs/testing

---

**Ready to continue? Start with Option 1 above! 🚀**
