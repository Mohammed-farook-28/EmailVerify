# Figma Design Documentation Index

**Figma File**: [Emailkit](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit)

This index provides an overview of all Figma design specifications for the EmailVerify platform.

---

## Summary

| Section | Pages | Spec Lines | Description |
|---------|-------|------------|-------------|
| [Auth](auth/spec.md) | 4 | 354 | Sign-in, sign-up, email verification, password reset |
| [Dashboard](dashboard/spec.md) | 5 | 705 | Stats cards, charts, sidebar navigation |
| [Bulk Verify](bulk-verify/spec.md) | 23 | 1,002 | File upload, copy/paste, progress states, list view |
| [Active Verification](active-verification/spec.md) | 8 | 889 | Real-time verification monitoring |
| [API Keys](api/spec.md) | 5 | 541 | API key management, webhooks |
| [Settings](settings/spec.md) | 9 | 976 | Account, billing, pricing, subscription modals |
| [Credit History](credit-history/spec.md) | 1 | 336 | Transaction log, credit tracking |
| [Error States](error-states/spec.md) | 5 | 674 | 404, 500, payment modals, VPN detection |
| **Total** | **60** | **5,477** | |

---

## Section Details

### Authentication
**Path**: [`auth/spec.md`](auth/spec.md)

| # | Page | Node ID |
|---|------|---------|
| 1 | Sign In | 2001:4804 |
| 2 | Sign Up | 2001:5201 |
| 3 | Email Verification | 2001:5565 |
| 4 | Password Reset | 2001:5870 |

---

### Dashboard
**Path**: [`dashboard/spec.md`](dashboard/spec.md)

| # | Page | Node ID |
|---|------|---------|
| 1 | Dashboard - Empty State | 2001:7359 |
| 2 | Dashboard - With Data | 2001:8135 |
| 3 | Dashboard - Dropdown Open | 2001:8919 |
| 4 | Dashboard - Notifications | 2001:9703 |
| 5 | Dashboard - User Menu | 2001:10487 |

---

### Bulk Verify
**Path**: [`bulk-verify/spec.md`](bulk-verify/spec.md)

| # | Page | Node ID |
|---|------|---------|
| 1-4 | Upload States | Various |
| 5-8 | Copy/Paste States | Various |
| 9-14 | Progress & Processing | Various |
| 15-22 | Results & Completion | Various |
| 23 | List View | 2001:29681 |

---

### Active Verification
**Path**: [`active-verification/spec.md`](active-verification/spec.md)

| # | Page | Node ID |
|---|------|---------|
| 1-7 | Verification Flow States | Various |
| 8 | List View | 2001:18705 |

---

### API Keys
**Path**: [`api/spec.md`](api/spec.md)

| # | Page | Node ID |
|---|------|---------|
| 1 | API Keys - Empty | 2001:11271 |
| 2 | API Keys - With Keys | 2001:12055 |
| 3 | Create Key Modal | 2001:12839 |
| 4 | Key Created Success | 2001:13623 |
| 5 | Delete Key Modal | 2001:14407 |

---

### Settings
**Path**: [`settings/spec.md`](settings/spec.md)

| # | Page | Node ID |
|---|------|---------|
| 1 | Account Settings | 2001:20431 |
| 2 | Billing - Empty | 2001:20786 |
| 3 | Buy Credits | 2001:22302 |
| 4 | Pricing Plans | 2001:28532 |
| 5 | Billing - Active | 2001:21291 |
| 6 | Cancel Subscription Modal | 2001:21829 |
| 7 | Plan Cancelled Modal | 2001:22267 |
| 8 | Delete Account Modal | 2001:22048 |
| 9 | Billing with Invoice | 2001:21482 |

---

### Credit History
**Path**: [`credit-history/spec.md`](credit-history/spec.md)

| # | Page | Node ID |
|---|------|---------|
| 1 | Credit History | 2001:29915 |

---

### Error States
**Path**: [`error-states/spec.md`](error-states/spec.md)

| # | Page | Node ID |
|---|------|---------|
| 1 | 404 Page Not Found | 2001:20947 |
| 2 | Server Error (500) | 2001:21170 |
| 3 | Payment Success Modal | 2001:21212 |
| 4 | Payment Failed Modal | 2001:21268 |
| 5 | VPN Detection Warning | 2001:21001 |

---

## Design System Overview

### Color Palette (Common)
| Token | Hex | Usage |
|-------|-----|-------|
| Page Background | `#1A1A1A` to `#262626` | Radial gradient |
| Card Background | `#333333` | Cards, modals |
| Primary Green | `#5ACE49` to `#229A3C` | CTAs, success |
| Text Primary | `#FFFFFF` | Headings |
| Text Secondary | `#C1C2C5` / `#BFBFBF` | Body text |
| Border | `#3B3B3B` / `#515151` | Dividers, borders |
| Link | `#54FFDA` | Clickable links |

### Typography (Common)
| Style | Font | Weight | Size |
|-------|------|--------|------|
| Heading | Manrope / Open Sans | Bold | 24-32px |
| Body | Manrope | Medium/SemiBold | 14-16px |
| Button | Manrope | SemiBold | 11.8-14px |
| Label | Open Sans | SemiBold | 12-14px |

### Status Colors
| Status | Background | Text |
|--------|------------|------|
| Deliverable | `#1B4C23` | `#48F4A5` |
| Undeliverable | `#3C1A1A` | `#14E101` |
| Risky | `#504320` | `#E1B001` |
| Verifying | `#504843` | `#E6E6E6` |
| Completed | `#28943A` | `#FFFFFF` |

---

## Folder Structure

```
docs/figma/
├── index.md                    # This file
├── auth/
│   ├── spec.md
│   ├── screenshots/            # 4 PNGs
│   └── icons/                  # Google icon, input icons
├── dashboard/
│   ├── spec.md
│   └── screenshots/            # 5 PNGs
├── bulk-verify/
│   ├── spec.md
│   ├── screenshots/            # 23 PNGs
│   └── icons/
├── active-verification/
│   ├── spec.md
│   └── screenshots/            # 8 PNGs
├── api/
│   ├── spec.md
│   └── screenshots/            # 5 PNGs
├── settings/
│   ├── spec.md
│   └── screenshots/            # 9 PNGs
├── credit-history/
│   ├── spec.md
│   └── screenshots/            # 1 PNG
├── error-states/
│   ├── spec.md
│   └── screenshots/            # 5 PNGs
└── shared/
    └── icons/                  # Shared icon assets
```

---

## Quick Links

- **Figma File**: [Emailkit](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit)
- **Project Architecture**: [/docs/architecture.md](../architecture.md)
- **UI Page Specs**: [/docs/pages/](../pages/)
- **Project Constitution**: [/.specify/memory/constitution.md](../../.specify/memory/constitution.md)
