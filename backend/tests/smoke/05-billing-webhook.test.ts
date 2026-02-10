/**
 * Billing webhook smoke tests.
 *
 * Mocks stripeClient.verifyWebhookSignature to bypass real Stripe signature checks.
 * The mock parses the raw body and returns it as the "verified" event.
 */
import { describe, it, expect, vi } from 'vitest';
import supertest from 'supertest';
import { nanoid } from 'nanoid';
import { app } from '../helpers/app.js';
import { db } from '../../src/db/index.js';
import { checkoutSession, subscription } from '../../src/db/schema.js';
import { getBalance } from '../../src/services/credit.js';
import { createTestUser, seedCredits } from '../helpers/factories.js';

// Mock Stripe client — verifyWebhookSignature just parses the raw body
vi.mock('../../src/services/stripe-client.js', () => ({
  stripeClient: {
    verifyWebhookSignature: vi.fn().mockImplementation(
      async (payload: Buffer | string) => {
        const body = typeof payload === 'string' ? payload : payload.toString('utf-8');
        return JSON.parse(body);
      }
    ),
  },
  StripeClient: vi.fn(),
}));

describe('billing webhooks', () => {
  it('one-time purchase adds credits', async () => {
    const testUser = await createTestUser();
    const sessionId = `cs_test_${nanoid()}`;

    // Insert checkout session record
    await db.insert(checkoutSession).values({
      id: sessionId,
      userId: testUser.id,
      type: 'one_time_purchase',
      status: 'open',
      paymentStatus: 'unpaid',
      metadata: { credits: 5000, price: 4000 },
      createdAt: new Date(),
    });

    const event = {
      id: `evt_purchase_${nanoid()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          payment_status: 'paid',
          mode: 'payment',
        },
      },
    };

    const res = await supertest(app)
      .post('/api/billing/webhook/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'test_sig')
      .send(JSON.stringify(event));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const balance = await getBalance(testUser.id);
    expect(balance).toBe(5000);
  });

  it('subscription renewal (invoice.paid) adds credits', async () => {
    const testUser = await createTestUser();
    const stripeSubId = `sub_test_${nanoid()}`;

    // Insert subscription record
    await db.insert(subscription).values({
      id: nanoid(),
      userId: testUser.id,
      stripeSubscriptionId: stripeSubId,
      stripePriceId: 'price_growth_monthly',
      planId: 'growth-monthly',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const event = {
      id: `evt_invoice_${nanoid()}`,
      type: 'invoice.paid',
      data: {
        object: {
          id: `inv_test_${nanoid()}`,
          subscription: stripeSubId,
        },
      },
    };

    const res = await supertest(app)
      .post('/api/billing/webhook/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'test_sig')
      .send(JSON.stringify(event));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    // growth-monthly = 5000 credits
    const balance = await getBalance(testUser.id);
    expect(balance).toBe(5000);
  });

  it('idempotency: duplicate event is not re-processed', async () => {
    const testUser = await createTestUser();
    const sessionId = `cs_test_${nanoid()}`;
    const eventId = `evt_idem_${nanoid()}`;

    // Insert checkout session record
    await db.insert(checkoutSession).values({
      id: sessionId,
      userId: testUser.id,
      type: 'one_time_purchase',
      status: 'open',
      paymentStatus: 'unpaid',
      metadata: { credits: 3000 },
      createdAt: new Date(),
    });

    const event = {
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          payment_status: 'paid',
          mode: 'payment',
        },
      },
    };

    // First call
    await supertest(app)
      .post('/api/billing/webhook/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'test_sig')
      .send(JSON.stringify(event));

    const balanceAfterFirst = await getBalance(testUser.id);
    expect(balanceAfterFirst).toBe(3000);

    // Second call (same event ID)
    const res2 = await supertest(app)
      .post('/api/billing/webhook/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'test_sig')
      .send(JSON.stringify(event));

    expect(res2.status).toBe(200);
    expect(res2.body.alreadyProcessed).toBe(true);

    // Balance should not change
    const balanceAfterSecond = await getBalance(testUser.id);
    expect(balanceAfterSecond).toBe(3000);
  });
});
