# Epic 7: Landing Page & Public Pages

## Epic Goal

Landing page with hero section, feature grid, integration logos, pricing table (9 tiers with monthly/annual toggle), and footer. Error pages for 404, 500, and VPN detection. This epic is primarily frontend with minimal backend involvement (pricing data API and VPN detection middleware).

**FRs covered:** FR62, FR63
**Dependencies:** None — can be built in parallel with other epics. Pricing data may reference Epic 3 tiers.

> **Frontend Reality:** The landing page (`src/app/page.tsx`) is a **28-line placeholder** with only a title ("VerifyInbox"), two links ("Sign In" and "Dashboard"), and no content sections. There is no hero section, no feature grid, no pricing table, no integration logos, and no footer. The error pages (`error.tsx`, `not-found.tsx`) and VPN detection page (`vpn-detected/page.tsx`) exist but have issues: dead `/support` links (route does not exist) and vague VPN copy. All must be built or fixed from scratch.
>
> **Decision #9:** Brand name is **EmailKit** (not "VerifyInbox" as currently in the placeholder).

---

# Backend Stories

## Story 7.1: Pricing Data API & VPN Detection

As a platform,
I want to serve pricing data from a central source and detect VPN/proxy traffic,
So that the landing page shows accurate prices and suspicious traffic is flagged.

**FRs:** FR62, FR63

**Acceptance Criteria:**

**Given** a GET to `/home/billing/packages` (no auth required — public endpoint)
**When** the request is processed
**Then** response returns all credit packages and subscription plans with prices
**And** the data matches the payment provider's configured products

**Given** an incoming request from a VPN or proxy
**When** the request passes through the middleware
**Then** the middleware checks against IP intelligence headers (e.g., Cloudflare `CF-IPCountry`, `CF-Connecting-IP`) or a third-party API
**And** if VPN detected: sets a header or query param that the frontend can read to redirect to `/vpn-detected`
**And** API endpoints still function (VPN detection is advisory, not blocking for API users)

**Edge Cases:**
- No VPN detection service configured → skip check, allow all traffic
- False positive VPN detection → user can contact support
- Pricing data from payment provider → cache for 1 hour to avoid rate limits
- Pricing not yet configured in payment provider → return hardcoded fallback data

**Technical Context:**
- Pricing endpoint: `GET /home/billing/packages` (defined in Epic 3 API Contract, reused here)
- VPN detection: middleware layer — Cloudflare headers, MaxMind GeoIP, or ipinfo.io
- VPN detection is best-effort, not security-critical
- No new tables needed

---

# API Contract

## Pricing (Public)

### `GET /home/billing/packages`

**Auth:** None (public)

> Already defined in Epic 3 API Contract. Reused by the landing page for pricing display.

```json
// Response 200
{
  "packages": [
    {
      "id": "string",
      "credits": "number",
      "price": "number (in cents)",
      "pricePerCredit": "number",
      "popular": "boolean"
    }
  ],
  "plans": [
    {
      "id": "string",
      "name": "string",
      "monthlyPrice": "number (in cents)",
      "annualPrice": "number (in cents)",
      "creditsPerMonth": "number",
      "features": ["string"],
      "popular": "boolean"
    }
  ]
}
```

## VPN Detection

No dedicated API endpoint. Detection happens via middleware that sets a response header:

```
X-EV-VPN-Detected: true|false
```

The frontend reads this header and redirects to `/vpn-detected` if `true`.

---

# Frontend Integration Stories

## Story 7.2: Landing Page Pricing Integration

As a frontend developer,
I want to wire the landing page pricing section to the backend packages API,
So that pricing data is accurate and consistent with the payment provider.

**Depends on:** Backend Story 7.1 (pricing endpoint) or Epic 3 Story 3.1 deployed

**Acceptance Criteria:**

**Given** the landing page at `/`
**When** it loads
**Then** `GET /home/billing/packages` is called (or data is fetched at build time via SSG)
**And** the pricing table displays all 9 subscription tiers with monthly/annual toggle
**And** one-time credit packages are shown in a separate section

**Given** the monthly/annual toggle
**When** the user switches billing period
**Then** plan prices update to show either monthlyPrice or annualPrice
**And** annual shows: per-month equivalent, annual total, savings badge (50% discount)

**Given** a "Get Started" CTA
**When** clicked
**Then** the user is redirected to `/auth/sign-up`

**Edge Cases:**
- Pricing API unavailable → show hardcoded fallback prices
- SSG: fetch at build time for fast load, revalidate periodically
- Mobile: pricing table stacks vertically or scrolls horizontally

**Technical Context:**
- Existing landing page: `src/app/page.tsx` — **28-line placeholder only** (title + 2 links, no content sections). Must be built from scratch: hero section, feature grid, pricing table, integration logos, footer, "Get Started" CTA.
- Brand: "EmailKit" (not "VerifyInbox" as in current placeholder at `page.tsx:8`)
- Replace placeholder with full landing page + API call or build-time fetch for pricing
- Next.js SSG: `fetch` in server component with `revalidate: 3600` (1 hour)
- Current plan names in mock: need to update to match backend tiers

---

## Story 7.3: Error Pages & VPN Detection Integration

As a frontend developer,
I want to ensure error pages work with the backend and VPN detection is functional,
So that users see appropriate messages for errors and VPN restrictions.

**Depends on:** Backend Story 7.1 (VPN middleware)

**Acceptance Criteria:**

**Given** a 404 error
**When** the user navigates to a non-existent page
**Then** the existing `not-found.tsx` page renders with: message, link to home/dashboard

**Given** a 500 error
**When** a server-side error occurs
**Then** the existing `error.tsx` boundary renders with: message, retry suggestion

**Given** VPN detection
**When** the backend middleware sets `X-EV-VPN-Detected: true`
**Then** the Next.js middleware reads the header and redirects to `/vpn-detected`
**And** the VPN page explains the restriction and provides guidance

**Given** API requests to non-existent endpoints
**When** a 404 occurs on `/api/*` or `/home/*` routes
**Then** the backend returns JSON `{ error: "Not found" }` (not HTML)

**Edge Cases:**
- Error pages work without JavaScript (SSR)
- Error pages maintain dark theme branding
- VPN page includes: link to disable VPN, contact support email
- Nested route 404s → catch-all routing

**Technical Context:**
**Frontend Reality Notes (verified against source):**
- Error pages (`error.tsx`, `not-found.tsx`) link to `/support` which **does not exist** as a route — dead link. Must either create a support route or change to a support email address.
- VPN page (`vpn-detected/page.tsx`) copy is vague: "Please Close to use application" — needs improved copy explaining why VPN is restricted and how to disable it.
- Error pages and VPN page do exist and are functional otherwise.

- Existing pages: `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/vpn-detected/page.tsx`
- Next.js middleware: `src/middleware.ts` — read `X-EV-VPN-Detected` header from backend responses
- Backend API 404s: Express catch-all route returns JSON
- These pages exist but need fixes: `/support` dead links, VPN copy improvement, VPN detection wiring
