# Billing System - Frontend Implementation Specification

Complete specification for frontend implementation of the EmailKit billing system.

**Status**: Pending implementation
**Framework**: Next.js 15+ with TypeScript, TanStack Query, Radix UI
**Backend**: ✅ Complete and ready for integration

---

## Overview

The frontend needs to implement:
1. **One-time purchase flow** (Phase 3)
2. **Subscription checkout flow** (Phase 4)
3. **Subscription management UI** (Phase 5)
4. **Transaction history display** (Phase 6)
5. **Public pricing page** (Phase 7)

---

## File Structure

```
frontend/src/
├── lib/api/
│   └── billing.ts                   # API client for billing endpoints
├── hooks/
│   ├── useCheckout.ts               # Checkout flow hook
│   ├── useBilling.ts                # Billing info hook
│   ├── useTransactionHistory.ts     # Transaction history hook
│   └── useSubscriptionManagement.ts # Subscription management hook
├── app/(dashboard)/home/billing/
│   ├── page.tsx                     # Main billing page
│   ├── buy-credits/
│   │   └── page.tsx                 # One-time purchase page
│   ├── plans/
│   │   └── page.tsx                 # Subscription plans page
│   └── checkout-return/
│       └── page.tsx                 # Post-checkout return page
├── components/billing/
│   ├── credits-card.tsx             # Credit balance display
│   ├── package-grid.tsx             # One-time package grid
│   ├── package-card.tsx             # Individual package card
│   ├── pricing-plan-card.tsx        # Subscription plan card
│   ├── price-summary.tsx            # Pricing summary component
│   ├── recent-transactions.tsx      # Recent transactions list
│   └── subscription-status-badge.tsx # Subscription status indicator
├── components/credit-history/
│   ├── credit-history-table.tsx     # Transaction history table
│   └── transaction-row.tsx          # Individual transaction row
└── components/modals/
    ├── payment-success-modal.tsx    # Success modal
    ├── payment-failed-modal.tsx     # Failure modal
    └── cancel-subscription-modal.tsx # Cancel confirmation modal
```

---

## 1. API Client (`lib/api/billing.ts`)

### Interface
```typescript
// lib/api/billing.ts

export interface BillingInfo {
  balance: number;
  subscription?: {
    planId: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
}

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  metadata?: any;
  createdAt: string;
}

export interface Package {
  id: string;
  credits: number;
}

export interface Plan {
  id: string;
  credits: number;
}

/**
 * Create one-time purchase checkout session
 */
export async function createOneTimeCheckout(
  packageId: string
): Promise<{ sessionId: string; url: string }> {
  const res = await fetch('/api/billing/checkout/one-time', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ packageId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Checkout failed');
  }

  return res.json();
}

/**
 * Create subscription checkout session
 */
export async function createSubscriptionCheckout(
  planId: string
): Promise<{ sessionId: string; url: string }> {
  const res = await fetch('/api/billing/checkout/subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ planId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Checkout failed');
  }

  return res.json();
}

/**
 * Poll checkout session status
 */
export async function pollCheckoutStatus(
  sessionId: string
): Promise<{ status: string; paymentStatus: string }> {
  const res = await fetch(`/api/billing/checkout/status/${sessionId}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error('Failed to get checkout status');
  }

  return res.json();
}

/**
 * Get billing info (balance + subscription)
 */
export async function getBillingInfo(): Promise<BillingInfo> {
  const res = await fetch('/api/billing/info', { credentials: 'include' });

  if (!res.ok) {
    throw new Error('Failed to get billing info');
  }

  return res.json();
}

/**
 * Get transaction history
 */
export async function getTransactionHistory(
  limit: number = 10,
  offset: number = 0,
  startDate?: Date
): Promise<{ transactions: Transaction[] }> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });

  if (startDate) {
    params.append('startDate', startDate.toISOString());
  }

  const res = await fetch(`/api/billing/transactions?${params}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error('Failed to get transaction history');
  }

  return res.json();
}

/**
 * Export transactions as CSV
 */
export async function exportTransactionsCSV(startDate?: Date): Promise<Blob> {
  const params = new URLSearchParams();

  if (startDate) {
    params.append('startDate', startDate.toISOString());
  }

  const res = await fetch(`/api/billing/transactions/export?${params}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error('Failed to export transactions');
  }

  return res.blob();
}

/**
 * Change subscription (upgrade/downgrade)
 */
export async function changeSubscription(newPlanId: string): Promise<{
  success: boolean;
  type: 'upgrade' | 'downgrade';
  effectiveDate: string;
  message: string;
}> {
  const res = await fetch('/api/billing/subscription/change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ newPlanId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to change subscription');
  }

  return res.json();
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(): Promise<{
  success: boolean;
  cancelAt: string;
  message: string;
}> {
  const res = await fetch('/api/billing/subscription/cancel', {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to cancel subscription');
  }

  return res.json();
}

/**
 * Reactivate subscription
 */
export async function reactivateSubscription(): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await fetch('/api/billing/subscription/reactivate', {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to reactivate subscription');
  }

  return res.json();
}

/**
 * Get available packages (public)
 */
export async function getPackages(): Promise<{ packages: Package[] }> {
  const res = await fetch('/api/billing/packages');

  if (!res.ok) {
    throw new Error('Failed to get packages');
  }

  return res.json();
}

/**
 * Get available plans (public)
 */
export async function getPlans(): Promise<{ plans: Plan[] }> {
  const res = await fetch('/api/billing/plans');

  if (!res.ok) {
    throw new Error('Failed to get plans');
  }

  return res.json();
}
```

---

## 2. Checkout Hook (`hooks/useCheckout.ts`)

```typescript
// hooks/useCheckout.ts
import { useMutation } from '@tanstack/react-query';
import { createOneTimeCheckout, createSubscriptionCheckout } from '@/lib/api/billing';

export function useOneTimeCheckout() {
  return useMutation({
    mutationFn: (packageId: string) => createOneTimeCheckout(packageId),
    onSuccess: (data) => {
      // Redirect to Stripe checkout
      window.location.href = data.url;
    },
  });
}

export function useSubscriptionCheckout() {
  return useMutation({
    mutationFn: (planId: string) => createSubscriptionCheckout(planId),
    onSuccess: (data) => {
      // Redirect to Stripe checkout
      window.location.href = data.url;
    },
  });
}
```

---

## 3. Billing Info Hook (`hooks/useBilling.ts`)

```typescript
// hooks/useBilling.ts
import { useQuery } from '@tanstack/react-query';
import { getBillingInfo } from '@/lib/api/billing';

export function useBilling() {
  return useQuery({
    queryKey: ['billing', 'info'],
    queryFn: getBillingInfo,
    refetchInterval: 60000, // Refetch every 60 seconds
  });
}
```

---

## 4. Transaction History Hook (`hooks/useTransactionHistory.ts`)

```typescript
// hooks/useTransactionHistory.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { getTransactionHistory, exportTransactionsCSV } from '@/lib/api/billing';

export function useTransactionHistory(limit = 10, offset = 0) {
  return useQuery({
    queryKey: ['billing', 'transactions', limit, offset],
    queryFn: () => getTransactionHistory(limit, offset),
  });
}

export function useExportTransactions() {
  return useMutation({
    mutationFn: (startDate?: Date) => exportTransactionsCSV(startDate),
    onSuccess: (blob) => {
      // Download the CSV
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}
```

---

## 5. Subscription Management Hook (`hooks/useSubscriptionManagement.ts`)

```typescript
// hooks/useSubscriptionManagement.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  changeSubscription,
  cancelSubscription,
  reactivateSubscription,
} from '@/lib/api/billing';

export function useSubscriptionManagement() {
  const queryClient = useQueryClient();

  const change = useMutation({
    mutationFn: changeSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'info'] });
    },
  });

  const cancel = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'info'] });
    },
  });

  const reactivate = useMutation({
    mutationFn: reactivateSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'info'] });
    },
  });

  return { change, cancel, reactivate };
}
```

---

## 6. Checkout Return Page (`app/(dashboard)/home/billing/checkout-return/page.tsx`)

**Purpose**: Poll checkout status after user returns from Stripe

```typescript
// app/(dashboard)/home/billing/checkout-return/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { pollCheckoutStatus } from '@/lib/api/billing';
import PaymentSuccessModal from '@/components/modals/payment-success-modal';
import PaymentFailedModal from '@/components/modals/payment-failed-modal';

export default function CheckoutReturnPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<'polling' | 'success' | 'failed'>('polling');

  useEffect(() => {
    if (!sessionId) {
      setStatus('failed');
      return;
    }

    let pollCount = 0;
    const maxPolls = 15; // 15 polls × 2s = 30s total timeout

    const poll = async () => {
      const interval = setInterval(async () => {
        pollCount++;

        try {
          const result = await pollCheckoutStatus(sessionId);

          if (result.status === 'complete' && result.paymentStatus === 'paid') {
            setStatus('success');
            clearInterval(interval);
          } else if (result.status === 'expired' || pollCount >= maxPolls) {
            setStatus('failed');
            clearInterval(interval);
          }
        } catch (error) {
          console.error('Polling error:', error);
          if (pollCount >= maxPolls) {
            setStatus('failed');
            clearInterval(interval);
          }
        }
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(interval);
    };

    poll();
  }, [sessionId]);

  if (status === 'polling') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">Processing Payment</h2>
          <p className="text-gray-600">Please wait while we confirm your payment...</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return <PaymentSuccessModal />;
  }

  if (status === 'failed') {
    return <PaymentFailedModal />;
  }

  return null;
}
```

---

## 7. Package Grid Component (Update Existing)

```typescript
// components/billing/package-grid.tsx
import { useOneTimeCheckout } from '@/hooks/useCheckout';
import { Button } from '@/components/ui/button';

interface PackageCardProps {
  id: string;
  credits: number;
  price: number;
  popular?: boolean;
}

function PackageCard({ id, credits, price, popular }: PackageCardProps) {
  const checkout = useOneTimeCheckout();

  const handleBuy = () => {
    checkout.mutate(id);
  };

  return (
    <div className={`border rounded-lg p-6 ${popular ? 'border-blue-500 shadow-lg' : ''}`}>
      {popular && (
        <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded">POPULAR</span>
      )}
      <h3 className="text-2xl font-bold mt-2">{credits.toLocaleString()} Credits</h3>
      <p className="text-3xl font-bold text-blue-600 mt-4">${price}</p>
      <p className="text-sm text-gray-600 mt-1">${(price / credits * 1000).toFixed(2)} per 1,000</p>
      <Button
        onClick={handleBuy}
        disabled={checkout.isPending}
        className="w-full mt-6"
      >
        {checkout.isPending ? 'Processing...' : 'Buy Now'}
      </Button>
    </div>
  );
}

export function PackageGrid() {
  // Map package IDs to prices (hardcoded or from API)
  const packages = [
    { id: '1K', credits: 1000, price: 10 },
    { id: '2K', credits: 2000, price: 18 },
    { id: '5K', credits: 5000, price: 40, popular: true },
    { id: '10K', credits: 10000, price: 75 },
    { id: '25K', credits: 25000, price: 175 },
    { id: '50K', credits: 50000, price: 325 },
    { id: '100K', credits: 100000, price: 600 },
    { id: '500K', credits: 500000, price: 2750 },
    { id: '1M', credits: 1000000, price: 5000 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {packages.map((pkg) => (
        <PackageCard key={pkg.id} {...pkg} />
      ))}
    </div>
  );
}
```

---

## 8. Pricing Plan Card Component (Update Existing)

```typescript
// components/billing/pricing-plan-card.tsx
import { useSubscriptionCheckout } from '@/hooks/useCheckout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PricingPlanCardProps {
  planId: string;
  name: string;
  credits: number;
  monthlyPrice: number;
  annualPrice: number;
  billingCycle: 'monthly' | 'annual';
  features: string[];
  popular?: boolean;
  currentPlan?: boolean;
}

export function PricingPlanCard({
  planId,
  name,
  credits,
  monthlyPrice,
  annualPrice,
  billingCycle,
  features,
  popular,
  currentPlan,
}: PricingPlanCardProps) {
  const checkout = useSubscriptionCheckout();

  const price = billingCycle === 'monthly' ? monthlyPrice : annualPrice;
  const fullPlanId = `${planId}-${billingCycle}`;

  const handleSubscribe = () => {
    checkout.mutate(fullPlanId);
  };

  return (
    <div className={`border rounded-lg p-6 ${popular ? 'border-blue-500 shadow-lg' : ''}`}>
      {popular && (
        <Badge className="bg-blue-500">POPULAR</Badge>
      )}
      {currentPlan && (
        <Badge className="bg-green-500">CURRENT PLAN</Badge>
      )}

      <h3 className="text-2xl font-bold mt-2">{name}</h3>
      <p className="text-gray-600 mt-1">{credits.toLocaleString()} credits/{billingCycle === 'monthly' ? 'month' : 'year'}</p>

      <div className="mt-4">
        <span className="text-4xl font-bold">${price}</span>
        <span className="text-gray-600">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
      </div>

      {billingCycle === 'annual' && (
        <p className="text-green-600 text-sm mt-1">Save ${(monthlyPrice * 12 - annualPrice).toFixed(0)}/year</p>
      )}

      <ul className="mt-6 space-y-2">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={handleSubscribe}
        disabled={checkout.isPending || currentPlan}
        className="w-full mt-6"
      >
        {currentPlan ? 'Current Plan' : checkout.isPending ? 'Processing...' : 'Subscribe'}
      </Button>
    </div>
  );
}
```

---

## 9. Payment Success Modal

```typescript
// components/modals/payment-success-modal.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useBilling } from '@/hooks/useBilling';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function PaymentSuccessModal() {
  const router = useRouter();
  const { data: billing } = useBilling();

  return (
    <Dialog open={true}>
      <DialogContent>
        <DialogHeader>
          <div className="text-center">
            <div className="text-green-500 text-6xl mb-4">✓</div>
            <DialogTitle className="text-2xl">Payment Successful!</DialogTitle>
          </div>
        </DialogHeader>

        <div className="text-center space-y-4">
          <p className="text-gray-600">
            Your payment has been processed successfully.
          </p>

          {billing && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">New Balance</p>
              <p className="text-3xl font-bold text-blue-600">
                {billing.balance.toLocaleString()} credits
              </p>
            </div>
          )}

          <Button
            onClick={() => router.push('/home/billing')}
            className="w-full"
          >
            Go to Billing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 10. Payment Failed Modal

```typescript
// components/modals/payment-failed-modal.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function PaymentFailedModal() {
  const router = useRouter();

  return (
    <Dialog open={true}>
      <DialogContent>
        <DialogHeader>
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">✗</div>
            <DialogTitle className="text-2xl">Payment Failed</DialogTitle>
          </div>
        </DialogHeader>

        <div className="text-center space-y-4">
          <p className="text-gray-600">
            Your payment could not be processed. Please try again.
          </p>

          <div className="space-x-4">
            <Button
              onClick={() => router.push('/home/billing/buy-credits')}
              variant="default"
            >
              Try Again
            </Button>

            <Button
              onClick={() => router.push('/home/billing')}
              variant="outline"
            >
              Go Back
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 11. Credit History Table Component (Update Existing)

```typescript
// components/credit-history/credit-history-table.tsx
import { useTransactionHistory, useExportTransactions } from '@/hooks/useTransactionHistory';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function CreditHistoryTable() {
  const [page, setPage] = useState(0);
  const limit = 10;
  const { data, isLoading } = useTransactionHistory(limit, page * limit);
  const exportMutation = useExportTransactions();

  const handleExport = () => {
    exportMutation.mutate();
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Transaction History</h2>
        <Button
          onClick={handleExport}
          disabled={exportMutation.isPending}
          variant="outline"
        >
          {exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">Date</th>
            <th className="text-left p-2">Type</th>
            <th className="text-right p-2">Amount</th>
            <th className="text-right p-2">Balance After</th>
          </tr>
        </thead>
        <tbody>
          {data?.transactions.map((tx) => (
            <tr key={tx.id} className="border-b">
              <td className="p-2">{new Date(tx.createdAt).toLocaleDateString()}</td>
              <td className="p-2">
                <Badge variant={tx.amount > 0 ? 'success' : 'default'}>
                  {tx.type}
                </Badge>
              </td>
              <td className={`p-2 text-right ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
              </td>
              <td className="p-2 text-right">{tx.balanceAfter.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between items-center mt-4">
        <Button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          variant="outline"
        >
          Previous
        </Button>
        <span>Page {page + 1}</span>
        <Button
          onClick={() => setPage(page + 1)}
          disabled={!data?.transactions.length || data.transactions.length < limit}
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
```

---

## Testing Checklist

### Phase 3: One-Time Purchase
- [ ] Package grid displays all 9 packages
- [ ] Click "Buy Now" redirects to Stripe checkout
- [ ] Test card (4242 4242 4242 4242) processes successfully
- [ ] Return page polls for status (2s interval, 30s timeout)
- [ ] Success modal shows with updated credit balance
- [ ] Credits added to account
- [ ] Transaction appears in history

### Phase 4: Subscriptions
- [ ] Pricing plan cards display all 10 plans
- [ ] Billing cycle toggle works (monthly/annual)
- [ ] Discount calculation shown for annual plans
- [ ] Subscribe button redirects to Stripe checkout
- [ ] Subscription activates after payment
- [ ] Subscription credits added to balance
- [ ] Subscription status displayed correctly

### Phase 5: Subscription Management
- [ ] Upgrade button changes plan immediately
- [ ] Downgrade schedules change for next period
- [ ] Cancel button shows confirmation modal
- [ ] Cancel marks subscription for end-of-period cancellation
- [ ] Reactivate button removes cancellation
- [ ] Status badge reflects current state (active, cancelling, past_due)

### Phase 6: Transaction History
- [ ] Table shows recent 10 transactions
- [ ] Pagination works correctly
- [ ] Export CSV button downloads file
- [ ] CSV contains all transactions
- [ ] Type badges colored correctly (green for credits, red for deductions)

### Phase 7: Public Pricing
- [ ] Pricing page accessible without auth
- [ ] All packages and plans displayed
- [ ] Popular items highlighted
- [ ] Current plan highlighted for logged-in users
- [ ] CTA buttons redirect to auth if not logged in

---

## Next Steps

1. **Set up Next.js project** (if not already done)
2. **Install dependencies**: TanStack Query, Radix UI, Tailwind CSS
3. **Implement API client** (`lib/api/billing.ts`)
4. **Create hooks** (useCheckout, useBilling, etc.)
5. **Build components** (package grid, pricing cards, modals)
6. **Create pages** (checkout-return, buy-credits, plans)
7. **Test end-to-end** with Stripe test mode
8. **Add error handling and loading states**
9. **Implement responsive design**
10. **Add accessibility features**

---

**Backend Status**: ✅ Complete and ready for integration
**API Documentation**: See `/docs/BILLING_QUICKSTART.md`
**Implementation Status**: See `/specs/003-billing/IMPLEMENTATION_STATUS.md`
