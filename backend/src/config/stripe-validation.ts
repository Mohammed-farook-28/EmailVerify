/**
 * Stripe Configuration Validation
 *
 * Validates that all required Stripe price IDs are configured at startup.
 * Prevents application from starting with missing configuration.
 */

import { logger } from './logger.js';

/**
 * Required Stripe price ID environment variables
 */
const REQUIRED_PRICE_IDS = [
  // One-time packages (9)
  'STRIPE_PRICE_1K',
  'STRIPE_PRICE_2K',
  'STRIPE_PRICE_5K',
  'STRIPE_PRICE_10K',
  'STRIPE_PRICE_25K',
  'STRIPE_PRICE_50K',
  'STRIPE_PRICE_100K',
  'STRIPE_PRICE_500K',
  'STRIPE_PRICE_1M',

  // Subscription plans (10 - 5 tiers × 2 billing cycles)
  'STRIPE_PRICE_STARTER_MONTHLY',
  'STRIPE_PRICE_STARTER_ANNUAL',
  'STRIPE_PRICE_GROWTH_MONTHLY',
  'STRIPE_PRICE_GROWTH_ANNUAL',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_ANNUAL',
  'STRIPE_PRICE_SCALE_MONTHLY',
  'STRIPE_PRICE_SCALE_ANNUAL',
  'STRIPE_PRICE_TITAN_MONTHLY',
  'STRIPE_PRICE_TITAN_ANNUAL',
] as const;

/**
 * Validate Stripe price ID configuration
 *
 * @param strictMode - If true, throws error on missing IDs. If false, only warns.
 * @returns true if all price IDs are configured, false otherwise
 */
export function validateStripePriceIds(strictMode: boolean = false): boolean {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const varName of REQUIRED_PRICE_IDS) {
    const value = process.env[varName];

    if (!value) {
      missing.push(varName);
    } else if (value === 'price_placeholder' || value.includes('placeholder')) {
      invalid.push(varName);
    } else if (!value.startsWith('price_')) {
      invalid.push(varName);
    }
  }

  if (missing.length === 0 && invalid.length === 0) {
    logger.info('Stripe price ID validation: All 19 price IDs configured correctly');
    return true;
  }

  // Log issues
  if (missing.length > 0) {
    logger.warn(
      { missing, count: missing.length },
      'Stripe price ID validation: Missing environment variables'
    );
  }

  if (invalid.length > 0) {
    logger.warn(
      { invalid, count: invalid.length },
      'Stripe price ID validation: Invalid or placeholder price IDs'
    );
  }

  if (strictMode) {
    const errorMsg = `Stripe price ID validation failed. Missing: ${missing.length}, Invalid: ${invalid.length}. Please configure all price IDs in .env file.`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  } else {
    logger.warn(
      'Stripe price ID validation failed, but running in non-strict mode. Some billing features may not work correctly.'
    );
    return false;
  }
}

/**
 * Get summary of Stripe configuration status
 */
export function getStripeConfigSummary(): {
  total: number;
  configured: number;
  missing: number;
  invalid: number;
  percentage: number;
} {
  let configured = 0;
  let missing = 0;
  let invalid = 0;

  for (const varName of REQUIRED_PRICE_IDS) {
    const value = process.env[varName];

    if (!value) {
      missing++;
    } else if (value === 'price_placeholder' || value.includes('placeholder')) {
      invalid++;
    } else if (!value.startsWith('price_')) {
      invalid++;
    } else {
      configured++;
    }
  }

  return {
    total: REQUIRED_PRICE_IDS.length,
    configured,
    missing,
    invalid,
    percentage: Math.round((configured / REQUIRED_PRICE_IDS.length) * 100),
  };
}
