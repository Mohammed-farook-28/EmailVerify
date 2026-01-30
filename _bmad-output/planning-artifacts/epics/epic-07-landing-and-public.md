# Epic 7: Landing Page & Public Pages

## Epic Goal

Landing page with hero section (headline, subheadline, primary signup CTA), feature grid (6+ cards), integration logos bar, pricing table (9 subscription tiers with monthly/yearly prices), and footer with ToS and Privacy Policy links. Error pages for 404, 500, and VPN detection.

**FRs covered:** FR62, FR63
**Dependencies:** None — can be built in parallel with other epics (static content). Pricing table data may reference Epic 3 subscription tiers.

---

## Story 7.1: Landing Page

As a potential user,
I want to see a compelling landing page that explains EmailKit's value and pricing,
So that I can understand the product and decide to sign up.

**FRs:** FR62

**Acceptance Criteria:**

**Given** a visitor navigating to the root URL (/)
**When** the landing page loads
**Then** the following sections are rendered in order:

1. **Hero Section**: Headline, subheadline, primary signup CTA button ("Get Started Free" or similar)
2. **Feature Grid**: 6+ feature cards highlighting key capabilities (bulk verify, API access, real-time results, active verification, fair pricing, etc.)
3. **Integration Logos Bar**: Logos of supported/upcoming integrations (ReachInbox active; Mailchimp, SendGrid, HubSpot, etc. as "coming soon")
4. **Pricing Table**: 9 subscription tiers displayed with monthly and yearly toggle (yearly at 50% discount). Each tier shows: name, price, credits included, key features. One-time credit packages also shown.
5. **Footer**: Links to Terms of Service, Privacy Policy, and any legal requirements

**Given** the pricing toggle
**When** the user switches between monthly and yearly
**Then** all tier prices update without page reload
**And** yearly shows the per-month equivalent + annual total + savings badge

**Edge Cases:**
- Mobile responsive: all sections stack vertically, pricing table scrolls horizontally or cards
- Pricing data: may be hardcoded initially (exact pricing TBD per PRD)
- CTA buttons: "Get Started Free" → redirect to /auth/sign-up
- SEO: proper meta tags, Open Graph, structured data for pricing
- Performance: static/SSG page for fast load (Next.js static generation)

**Technical Context:**
- Framework: Next.js App Router — static generation (SSG) for landing page performance
- UI: Tailwind CSS + shadcn/ui, dark theme
- UI screens: `docs/figma/dashboard/spec.md` (if landing included) or separate landing Figma
- Page spec: `docs/pages/00-landing-page.md` — full landing page specification
- Subscription tiers: Starter, Popular, Professional, Business, Enterprise, Premium, Ultimate, Mega, Titan
- Pricing: exact amounts TBD — structure mirrors original EmailVerify baseline
- Route: `/` (public, no auth required)

---

## Story 7.2: Error Pages & Payment State Modals

As a user,
I want to see clear error pages when something goes wrong,
So that I understand what happened and what to do next.

**FRs:** FR63

**Acceptance Criteria:**

**Given** a user navigating to a non-existent page
**When** the server returns a 404
**Then** a styled 404 error page is displayed with: message, illustration/icon, link to dashboard or home

**Given** a server error occurs
**When** the server returns a 500
**Then** a styled 500 error page is displayed with: message, suggestion to try again, link to status page or support

**Given** VPN or suspicious traffic is detected
**When** the system flags the request
**Then** a VPN detection page is displayed explaining the restriction
**And** guidance on how to proceed (disable VPN, contact support)

**Edge Cases:**
- Error pages should work without JavaScript (SSR fallback)
- Error pages should maintain consistent branding (dark theme, logo)
- 404 for API endpoints → JSON error response (not HTML page)
- Nested routes that don't exist → catch-all 404

**Technical Context:**
- Next.js: `not-found.tsx` (404), `error.tsx` (500), custom middleware for VPN detection
- UI screens: `docs/figma/error-states/spec.md` — 404, 500, VPN detection pages
- VPN detection: may use Cloudflare headers or IP intelligence service
- Routes: catch-all in Next.js App Router
