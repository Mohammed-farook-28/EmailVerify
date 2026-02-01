# Better Auth Migration Plan

## Overview

Migrate from custom session-based auth to Better Auth with Drizzle ORM for type-safe, maintainable authentication.

**Timeline**: 2-3 days for full migration
**Risk**: Medium (auth is critical, but Better Auth is well-tested)
**Benefits**: Type safety, built-in social auth, automatic session management, CSRF protection, better DX

---

## Phase 1: Setup & Dependencies

### Backend Dependencies

```bash
cd backend
npm install better-auth drizzle-orm postgres drizzle-kit
npm uninstall passport passport-google-oauth20
```

### Frontend Dependencies

```bash
cd ../EmailVerify-Frontend
npm install @better-auth/react
```

---

## Phase 2: Database Schema Migration

### Current Schema (PostgreSQL)

```sql
users (14 columns)
sessions (6 columns)
verification_codes (8 columns)
```

### Better Auth Schema (Drizzle)

Create `backend/src/db/schema.ts`:

```typescript
import { pgTable, text, timestamp, boolean, integer, serial } from 'drizzle-orm/pg-core';

// Better Auth requires these tables
export const user = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Custom fields
  firstName: text('first_name'),
  lastName: text('last_name'),
  language: text('language').notNull().default('en'),
  dataRetentionDays: integer('data_retention_days').notNull().default(30),
  deletionRequestedAt: timestamp('deletion_requested_at'),
  paymentCustomerId: text('payment_customer_id'),
});

export const session = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  // Custom: track last auth for re-auth
  lastAuthenticatedAt: timestamp('last_authenticated_at').notNull().defaultNow(),
});

export const account = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(), // Google ID
  providerId: text('provider_id').notNull(), // "google"
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const verification = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(), // email or userId
  value: text('value').notNull(), // hashed code
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // Custom: track attempts
  attempts: integer('attempts').notNull().default(0),
});

// Keep existing custom tables
export const creditEvents = pgTable('credit_events', { /* existing */ });
export const billingInfo = pgTable('billing_info', { /* existing */ });
```

### Migration Strategy

**Option A: Fresh migration (clean slate)**
- Drop existing auth tables
- Run Drizzle migrations
- All users need to re-register

**Option B: Data migration (preserve users)**
- Create migration script to transform existing data
- Map `users.first_name + last_name` → `users.name`
- Convert `sessions.token_hash` → Better Auth session format
- Link Google accounts via `accounts` table

---

## Phase 3: Better Auth Configuration

### Backend Setup (`backend/src/lib/auth.ts`)

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';
import * as schema from '../db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendVerificationEmail: async ({ user, url, token }) => {
      // Use existing email service
      const code = token.slice(0, 6); // 6-digit code
      await EmailService.sendVerificationCode(user.email, code);
    },
  },

  socialProviders: {
    google: {
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      redirectURI: `${env.backendUrl}/api/auth/callback/google`,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // Update every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  advanced: {
    cookiePrefix: 'ev',
    crossSubDomainCookies: {
      enabled: false,
    },
    useSecureCookies: env.nodeEnv === 'production',
  },

  // Custom plugin for re-authentication
  plugins: [
    {
      id: 'reauth',
      endpoints: {
        requireReauth: {
          method: 'POST',
          path: '/require-reauth',
          handler: async (ctx) => {
            const session = await ctx.getSession();
            if (!session) return ctx.json({ error: 'Unauthorized' }, 401);

            const lastAuth = session.lastAuthenticatedAt;
            const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

            if (new Date(lastAuth).getTime() < tenMinutesAgo) {
              return ctx.json({
                error: 'Re-authentication required',
                action: 'reauth',
                method: session.user.emailVerified ? 'password' : 'google',
              }, 403);
            }

            return ctx.json({ success: true });
          },
        },
      },
    },
  ],
});

export type Auth = typeof auth;
```

### Express Integration (`backend/src/app.ts`)

```typescript
import { auth } from './lib/auth';
import { toNodeHandler } from 'better-auth/node';

// Mount Better Auth routes at /api/auth/*
app.all('/api/auth/*', toNodeHandler(auth));

// Custom middleware for protected routes
export const requireAuth = async (req, res, next) => {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = session.user;
  req.session = session.session;
  next();
};
```

---

## Phase 4: Frontend Integration

### Auth Client Setup (`frontend/src/lib/auth-client.ts`)

```typescript
import { createAuthClient } from '@better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  useUser,
} = authClient;
```

### Replace Auth Provider (`frontend/src/lib/auth-provider.tsx`)

```typescript
'use client';

import { SessionProvider } from '@better-auth/react';

export function AuthProvider({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}

// Usage in components
import { useSession } from '@/lib/auth-client';

export function ProfileForm() {
  const { data: session, isPending } = useSession();
  const user = session?.user;

  // ... rest of component
}
```

### Update Middleware (`frontend/src/middleware.ts`)

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('ev.session_token');
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth');
  const isProtectedPage = request.nextUrl.pathname.startsWith('/home');

  if (isProtectedPage && !sessionCookie) {
    return NextResponse.redirect(new URL('/auth/sign-in', request.url));
  }

  if (isAuthPage && sessionCookie) {
    return NextResponse.redirect(new URL('/home/quick-verify', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/home/:path*', '/auth/:path*'],
};
```

---

## Phase 5: Route Migration

### Auth Routes (Better Auth provides these automatically)

**Before:**
```
POST /auth/sign-up
POST /auth/sign-in
POST /auth/sign-out
GET  /auth/google
GET  /auth/callback/google
```

**After (Better Auth):**
```
POST /api/auth/sign-up/email
POST /api/auth/sign-in/email
POST /api/auth/sign-out
GET  /api/auth/sign-in/google
GET  /api/auth/callback/google
POST /api/auth/verify-email
POST /api/auth/send-verification-email
```

### Custom Routes to Keep

```
POST /auth/password-reset (custom)
POST /auth/password-reset/verify (custom)
POST /home/profile/deletion-code (custom)
```

### Page Updates

**Sign Up Page:**
```typescript
import { signUp } from '@/lib/auth-client';

const handleSignUp = async (data) => {
  const { error } = await signUp.email({
    email: data.email,
    password: data.password,
    name: `${data.firstName} ${data.lastName}`,
    callbackURL: '/home/quick-verify',
  });

  if (error) {
    toast.error(error.message);
  } else {
    router.push(`/auth/verify-email?email=${data.email}`);
  }
};
```

**Sign In Page:**
```typescript
import { signIn } from '@/lib/auth-client';

const handleSignIn = async (data) => {
  const { error } = await signIn.email({
    email: data.email,
    password: data.password,
    callbackURL: '/home/quick-verify',
  });

  if (error?.status === 403) {
    router.push(`/auth/verify-email?email=${data.email}`);
  }
};

const handleGoogleSignIn = async () => {
  await signIn.social({
    provider: 'google',
    callbackURL: '/home/quick-verify',
  });
};
```

---

## Phase 6: Custom Features Migration

### Email Verification (6-digit code)

Better Auth uses magic links by default. To keep 6-digit codes:

```typescript
// Custom verification plugin
const sixDigitVerification = {
  id: 'six-digit-verification',
  endpoints: {
    sendCode: {
      method: 'POST',
      path: '/send-verification-code',
      handler: async (ctx) => {
        const { email } = await ctx.request.json();
        const code = crypto.randomInt(100000, 999999).toString();

        // Store in verification table
        await db.insert(schema.verification).values({
          identifier: email,
          value: await hashToken(code),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        });

        await EmailService.sendVerificationCode(email, code);
        return ctx.json({ success: true });
      },
    },
  },
};
```

### Account Deletion (30-day grace period)

Keep custom implementation:

```typescript
// routes/profile.ts - No changes needed
POST /home/profile/deletion-code
DELETE /home/profile
```

### Re-authentication

Add custom middleware using Better Auth session:

```typescript
export const requireReauth = async (req, res, next) => {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const lastAuth = session.session.lastAuthenticatedAt;
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

  if (new Date(lastAuth).getTime() < tenMinutesAgo) {
    return res.status(403).json({
      error: 'Re-authentication required',
      action: 'reauth',
      method: session.user.emailVerified ? 'password' : 'google',
    });
  }

  req.user = session.user;
  req.session = session.session;
  next();
};
```

---

## Phase 7: Testing Checklist

- [ ] Sign up with email/password → verify email → land on dashboard
- [ ] Sign in with email/password → dashboard
- [ ] Sign up with Google → dashboard with credits
- [ ] Sign in with Google (existing account) → dashboard
- [ ] Link Google to existing email account
- [ ] Password reset flow
- [ ] Sign out → redirect to sign-in
- [ ] Protected route without session → redirect to sign-in
- [ ] Session persistence (30 days)
- [ ] CSRF protection on mutations
- [ ] Re-authentication for sensitive routes
- [ ] Account deletion with grace period
- [ ] All profile updates work

---

## Phase 8: Cleanup

### Files to Remove

```
backend/src/middleware/auth.ts (replaced by Better Auth)
backend/src/middleware/csrf.ts (Better Auth handles this)
backend/src/services/auth.ts (most logic moved to Better Auth config)
backend/src/config/passport.ts (replaced by Better Auth social)
backend/src/lib/crypto.ts (session token generation - Better Auth handles)
backend/src/models/session.ts (Drizzle + Better Auth handle this)
```

### Files to Keep/Update

```
backend/src/models/user.ts → Update to use Drizzle queries
backend/src/models/verification-code.ts → Update for 6-digit codes
backend/src/services/email.ts → Keep as-is
backend/src/services/user.ts → Keep (email change, deletion, export)
backend/src/middleware/require-reauth.ts → Update to use Better Auth session
```

---

## Migration Risks & Mitigations

### Risk 1: Data Loss
- **Mitigation**: Backup database before migration
- **Rollback Plan**: Keep old tables with `_old` suffix for 30 days

### Risk 2: Session Invalidation
- **Impact**: All users logged out during migration
- **Mitigation**: Schedule migration during low-traffic period, send email notification

### Risk 3: OAuth Callback Changes
- **Impact**: Google OAuth redirect URLs change
- **Mitigation**: Update Google Console callback URL to `/api/auth/callback/google`

### Risk 4: Custom Features Compatibility
- **Impact**: 6-digit codes, re-auth, deletion grace period
- **Mitigation**: Use Better Auth plugins to extend functionality

---

## Benefits Summary

### Developer Experience
✅ Type-safe auth client and server
✅ Automatic session management
✅ Built-in CSRF protection
✅ Social provider integration (no Passport needed)
✅ Better error handling

### Security
✅ Well-tested auth library (10k+ stars)
✅ Automatic security updates
✅ Built-in rate limiting
✅ Secure session handling

### Maintainability
✅ Less custom code to maintain
✅ Better documentation
✅ Active community support
✅ Easier to add new providers (GitHub, Microsoft, etc.)

### Performance
✅ Session caching
✅ Optimized database queries via Drizzle
✅ Smaller bundle size (no Passport)

---

## Next Steps

1. **Review this plan** - Any questions or concerns?
2. **Choose migration strategy**:
   - Option A: Fresh start (faster, users re-register)
   - Option B: Full data migration (slower, preserves users)
3. **Set migration timeline** - When should we start?
4. **Backup current database**
5. **Create feature branch** - `feature/better-auth-migration`

Would you like me to proceed with implementation, or do you have questions about any part of this plan?
