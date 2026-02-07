import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { env } from '../config/env.js';
import * as EmailService from '../services/email.js';
import * as CreditService from '../services/credit.js';

export const auth = betterAuth({
  baseURL: env.backendUrl,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),

  // Trust frontend origin for CORS
  trustedOrigins: [env.frontendUrl],

  // Email and password authentication (disabled - using Email OTP instead)
  emailAndPassword: {
    enabled: false,
  },

  // Social OAuth providers
  socialProviders: {
    google: {
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      redirectURI: `${env.backendUrl}/api/auth/callback/google`,
    },
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // Update session once per day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
      strategy: 'compact', // Base64 + HMAC (fastest, smallest)
    },
  },

  // Advanced configuration
  advanced: {
    cookiePrefix: 'ev', // EmailKit cookie prefix
    useSecureCookies: env.isProduction,
    crossSubDomainCookies: {
      enabled: false,
    },
  },

  // Rate limiting (auto-enabled in production)
  rateLimit: {
    enabled: true,
    window: 60, // seconds
    max: 100, // requests per window
  },

  // Plugins
  plugins: [
    // Email OTP for 6-digit verification codes
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type === 'email-verification') {
          await EmailService.sendVerificationCode(email, otp);
        } else if (type === 'forget-password') {
          await EmailService.sendPasswordResetCode(email, otp);
        }
      },
      otpLength: 6,
      expiresIn: 900, // 15 minutes
    }),
  ],
});

export type Auth = typeof auth;
