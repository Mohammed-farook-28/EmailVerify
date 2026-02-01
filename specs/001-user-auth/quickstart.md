# Quickstart: User Authentication & Profile Management

**Feature**: 001-user-auth | **Date**: 2026-01-31

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Google OAuth 2.0 credentials (client ID + secret)
- Resend API key (for transactional emails)
- DigitalOcean Spaces credentials (for avatar uploads)

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/emailkit

# Redis
REDIS_URL=redis://localhost:6379

# Auth
SESSION_SECRET=<random-256-bit-string>
CSRF_SECRET=<random-256-bit-string>
GOOGLE_CLIENT_ID=<from-google-console>
GOOGLE_CLIENT_SECRET=<from-google-console>
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/callback/google

# Email
RESEND_API_KEY=<resend-api-key>
FROM_EMAIL=noreply@emailkit.com

# Storage
DO_SPACES_KEY=<spaces-key>
DO_SPACES_SECRET=<spaces-secret>
DO_SPACES_BUCKET=emailkit-avatars
DO_SPACES_REGION=nyc3
DO_SPACES_CDN_URL=https://emailkit-avatars.nyc3.cdn.digitaloceanspaces.com

# Credits
SIGNUP_BONUS_CREDITS=100
```

## Setup Steps

### 1. Backend Setup

```bash
# From repository root
cd backend
npm install

# Run database migrations
npm run migrate

# Seed initial data (optional, for development)
npm run seed

# Start development server
npm run dev
# → Backend running at http://localhost:3000
```

### 2. Frontend Setup

```bash
# From frontend repository
cd /path/to/EmailVerify-Frontend
npm install

# Set API URL in .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:3000" > .env.local

# Start development server
npm run dev
# → Frontend running at http://localhost:3001
```

### 3. Verify Setup

1. Open http://localhost:3001
2. Click "Sign Up" → fill form → check email for verification code
3. Enter code → should redirect to dashboard with credits

## Key Implementation Notes

### Session Flow
- Backend creates session → sets `ev_session` httpOnly cookie → frontend automatically includes it on all requests (credentials: 'include')
- Frontend checks auth on load via `GET /home/profile` → if 401, redirect to sign-in
- No tokens in localStorage/sessionStorage — all auth via secure cookies

### Rate Limiting
- Auth endpoints are rate-limited via Redis sliding window
- Frontend should handle 429 responses by showing retry-after message
- Account lockout (5 failed sign-ins) lasts 30 minutes

### Google OAuth
- Backend initiates OAuth (`GET /auth/google`)
- Google redirects to backend (`GET /auth/callback/google`)
- Backend creates session, redirects to frontend (`/auth/callback?success=true`)
- Frontend callback page reads params, fetches profile, redirects to dashboard

### CSRF
- Backend generates CSRF token per session, delivers it via `X-CSRF-Token` response header on `GET /home/profile` (and any authenticated GET)
- Frontend reads the `X-CSRF-Token` response header and includes it as `X-CSRF-Token` request header on all POST/PUT/DELETE requests
- Token is NOT in a cookie — it's a response header that the frontend API client caches and sends back

## Testing

```bash
# Backend tests
cd backend
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:int      # Integration tests only

# Frontend E2E
cd frontend
npx playwright test   # End-to-end auth flow tests
```

## API Quick Reference

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | /auth/sign-up | None | Register |
| POST | /auth/verify-email | None | Verify email code |
| POST | /auth/resend-verification | None | Resend code |
| POST | /auth/sign-in | None | Sign in |
| POST | /auth/sign-out | Cookie | Sign out |
| GET | /auth/google | None | Start OAuth |
| GET | /auth/callback/google | None | OAuth callback |
| POST | /auth/password-reset | None | Request reset code |
| POST | /auth/password-reset/verify | None | Reset password |
| GET | /home/profile | Cookie | Get profile |
| PUT | /home/profile/name | Cookie | Update name |
| PUT | /home/profile/email | Cookie | Start email change |
| POST | /home/profile/email/verify | Cookie | Confirm email change |
| PUT | /home/profile/password | Cookie | Change password |
| PUT | /home/profile/language | Cookie | Update language |
| POST | /home/profile/avatar | Cookie | Upload avatar |
| DELETE | /home/profile | Cookie | Request deletion |
| POST | /home/profile/deletion-code | Cookie | Request deletion code |
| GET | /home/profile/export | Cookie | Export data |
| GET | /home/profile/billing-info | Cookie | Get billing info |
| PUT | /home/profile/billing-info | Cookie | Update billing |
| PUT | /home/profile/data-retention | Cookie | Update retention |
