# Better Auth Implementation Plan

**Status**: Ready for Implementation
**Timeline**: 2-3 days
**Migration Type**: Clean Implementation (No existing users)

## Simplified Approach

Since there are no existing users:
- ✅ No data migration needed
- ✅ No downtime concerns
- ✅ No user notifications required
- ✅ No credit export/import
- ✅ Skip Redis session cache (start simple, add later if needed)

## Implementation Phases

### Phase 1: Backend Setup (Day 1)
1. Install dependencies (Better Auth, Drizzle)
2. Configure Drizzle ORM
3. Define database schema
4. Setup Better Auth core
5. Configure Email OTP plugin

### Phase 2: Express Integration (Day 1-2)
1. Update app.ts with Better Auth routes
2. Create new auth middleware
3. Remove old Passport.js code
4. Update environment variables

### Phase 3: Frontend Integration (Day 2)
1. Install @better-auth/react
2. Create auth client
3. Update AuthProvider
4. Migrate sign-up page
5. Migrate sign-in page
6. Update protected routes

### Phase 4: Testing (Day 2-3)
1. Unit tests for auth flows
2. Integration tests
3. Manual testing checklist
4. Security validation

### Phase 5: Cleanup (Day 3)
1. Remove old auth files
2. Update documentation
3. Update environment examples
4. Final verification

## Critical Configuration Points

### 1. Express Middleware Order
```typescript
// CRITICAL: Better Auth BEFORE express.json()
app.all('/api/auth/*', toNodeHandler(auth));
app.use(express.json());
```

### 2. Production Cookie Setup
```typescript
advanced: {
  cookiePrefix: 'ev',
  useSecureCookies: env.nodeEnv === 'production',
}
```

### 3. CORS Configuration
```typescript
cors({
  origin: env.frontendUrl,
  credentials: true, // Required for cookies
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
})
```

## Session Strategy (Simplified)

**Storage**: PostgreSQL only (via Drizzle)
- No Redis cache initially (can add later)
- Database-backed sessions
- 30-day expiration
- Compact cookie cache (5 minutes)

## Testing Checklist

- [ ] Sign up with email/password → 6-digit OTP → verify
- [ ] Sign in with email/password
- [ ] Sign up with Google OAuth
- [ ] Sign in with Google OAuth
- [ ] Link Google to email account
- [ ] Password reset with OTP
- [ ] Sign out
- [ ] Protected routes
- [ ] Session persistence (30 days)
- [ ] CSRF protection
- [ ] Re-authentication (10min timeout)
- [ ] Rate limiting

## Files to Create

```
backend/drizzle.config.ts
backend/src/db/index.ts
backend/src/db/schema.ts
backend/src/lib/auth.ts
backend/src/middleware/auth.ts (new)
```

## Files to Modify

```
backend/package.json
backend/src/app.ts
backend/src/config/env.ts
backend/tsconfig.json
frontend/package.json
frontend/src/lib/auth-client.ts
frontend/src/lib/auth-provider.tsx
frontend/src/app/(auth)/auth/sign-up/page.tsx
frontend/src/app/(auth)/auth/sign-in/page.tsx
```

## Files to Remove After Migration

```
backend/src/config/passport.ts
backend/src/middleware/csrf.ts (Better Auth handles)
backend/src/lib/crypto.ts (session tokens)
backend/src/models/session.ts (Drizzle replaces)
backend/src/models/verification-code.ts (Better Auth OTP)
backend/migrations/*.sql (old migrations)
```

## Next Steps

1. Start with Phase 1: Backend Setup
2. Test each phase thoroughly before proceeding
3. Keep old code until new system is fully validated
4. Remove old code only after all tests pass

## Rollback Plan

If issues arise:
1. Revert Git commits
2. Restart services
3. Old code remains in repo until stable

---

**Implementation Start**: 2026-02-01
