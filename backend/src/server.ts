// IMPORTANT: Import instrumentation FIRST, before any other imports
import './instrumentation.js';

import { app } from './app.js';
import { env } from './config/env.js';
import { validateStripePriceIds, getStripeConfigSummary } from './config/stripe-validation.js';

// Validate Stripe configuration on startup (non-strict mode for development)
const strictMode = env.isProduction;
validateStripePriceIds(strictMode);

const stripeConfig = getStripeConfigSummary();
console.log(
  `Stripe configuration: ${stripeConfig.configured}/${stripeConfig.total} price IDs configured (${stripeConfig.percentage}%)`
);

app.listen(env.port, () => {
  console.log(`EmailKit backend running on port ${env.port} [${env.nodeEnv}]`);
});
