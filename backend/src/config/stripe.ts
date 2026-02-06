import Stripe from 'stripe';
import { env } from './env.js';

/**
 * Stripe SDK instance configured with EmailKit credentials.
 * Uses test mode in development, live mode in production.
 */
export const stripe = new Stripe(env.stripeSecretKey, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
  appInfo: {
    name: 'EmailKit',
    version: '1.0.0',
  },
});

/**
 * Stripe configuration constants
 */
export const stripeConfig = {
  publishableKey: env.stripePublishableKey,
  webhookSecret: env.stripeWebhookSecret,

  // Checkout session configuration
  checkoutSessionExpiration: 30 * 60, // 30 minutes in seconds

  // Polling configuration for checkout status
  pollInterval: 2000, // 2 seconds
  pollTimeout: 30000, // 30 seconds total

  // Currency
  currency: 'usd' as const,

  // Success/cancel URLs (will be constructed at runtime with session ID)
  getSuccessUrl: (sessionId: string) => `${env.frontendUrl}/home/billing/checkout-return?session_id=${sessionId}`,
  getCancelUrl: () => `${env.frontendUrl}/home/billing`,
} as const;
