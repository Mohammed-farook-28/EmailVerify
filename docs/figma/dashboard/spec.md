# Dashboard Pages - Figma Design

## Figma Source
- **File**: Emailkit
- **File Key**: r2m4Md3beV9KoBbu3ICOR9

| Page | Node ID | URL |
|------|---------|-----|
| Single Verify (Empty) | 2001:17470 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-17470&m=dev) |
| Single Verify (Input Filled) | 2001:27897 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-27897&m=dev) |
| Recent Verifications List | 2001:28447 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-28447&m=dev) |
| Email Verification Detail | 2001:27934 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-27934&m=dev) |
| Cookie Policy Modal | 2001:17905 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-17905&m=dev) |

---

## Design System

### Color Palette
| Token | Hex | Usage |
|-------|-----|-------|
| Background Start | #262626 | Page gradient start |
| Background End | #1a1a1a | Page gradient end |
| Sidebar Background | #232121 → #2d2b2b | Sidebar gradient |
| Card Background | #333333 | Content cards |
| Card Background Alt | #343433 | Single verify card |
| Card Background Dark | #262624 | Recent verifications |
| Input Background | #3b3b3b | Form inputs |
| Input Border | #4d4d4d | Input stroke |
| Input Focus Background | #2f332e | Active input |
| Input Focus Border | #49ff17 | Active input border |
| Input Focus Glow | #a56f59 | Active input glow |
| Nav Item Active | rgba(215,237,237,0.16) | Active nav gradient |
| Nav Border | #26292d | Section dividers |
| Button Gradient Start | #5ace49 | Verify button top |
| Button Gradient End | #229a3c | Verify button bottom |
| Buy Credits Gradient | #373534 → #3c3c3c | Buy credits button |
| Settings Button | #3448b9 → #216a9f | Settings gradient |
| Text Primary | #ededed | Headings |
| Text Secondary | #c0c6c6 | Nav items |
| Text Active | #e8e9e9 | Active nav item |
| Text Muted | #b3b3b3 | Descriptions |
| Text Label | #686b6e | Section labels |
| Accent Green | #0dff1d | Logo accent |
| Credits Green | #1aff4c | Credit count |
| Plan Green | #b6f09c | Plan badge |
| Warning Orange | #ffa43a | Empty state icon bg |
| Cookie Accept | #14ff3f | Cookie accept button |
| Deliverable Badge | #15c25a | Status badge background |
| Score Green | #1edf6b | Score badge, progress bar |
| Score Green Dark | #10793a | Score gradient end |
| Score Yellow | #e4b14e | Progress bar segment |
| Score Yellow Dark | #7e622b | Progress gradient end |
| Score Purple | #361fcb | Progress bar segment |
| Score Purple Dark | #1b0f65 | Progress gradient end |
| Field Background | #323230 | Read-only field background |
| Badge Background | #252522 | Score multiplier badge |
| Panel Border | #515151 | Results panel left border |
| Domain Link | #ee722d | Clickable domain link |
| Status Risky | #b1ab1d | Risky status badge |
| Status Undeliverable | #df1e1e | Undeliverable status badge |
| Status Unknown | #5a46d6 | Unknown status badge |

### Typography
| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Logo "Verify" | GRIFTER | 19.84px | Bold | #ededed |
| Logo "Inbox" | GRIFTER | 19.84px | Bold | #0dff1d |
| Section Label | Manrope | 14px | SemiBold | #686b6e |
| Nav Item | Manrope | 14px | Regular | #c0c6c6 |
| Nav Item Active | Manrope | 14px | SemiBold | #e8e9e9 |
| Card Title | Manrope | 24px | Bold | #ffffff |
| Card Subtitle | Manrope | 16px | Bold | #ffffff |
| Card Description | Manrope | 14px | Medium | #b3b3b3 |
| Input Placeholder | Manrope | 10.185px | Regular | #a1a1a1 |
| Input Text (Active) | Manrope | 10.185px | SemiBold | #ffffff |
| Button Text | Manrope | 11.813px | SemiBold | #ffffff |
| User Name | Manrope | 14px | SemiBold | #ffffff |
| User Plan | Manrope | 11px | SemiBold | #b6f09c |
| Modal Title | Manrope | 22px | ExtraBold | #ffffff |
| Modal Body | Manrope | 14px | Regular | #cacdcf |
| Modal Link | Manrope | 14px | Bold | #ffffff (underlined) |
| Modal Button | Inter | 16px | Bold | #ffffff |

### Shared Components

#### Input Field
```css
/* Default State */
background: #3b3b3b;
border: 0.971px solid #4d4d4d (inset);
border-radius: 3.886px;
padding: 11.83px 7.771px;
font: Manrope Regular 10.185px;
color: #a1a1a1 (placeholder);

/* Focus/Active State */
background: #2f332e;
border: 1px solid #49ff17;
box-shadow: 0px 0px 3px 0.971px #a56f59;
font: Manrope SemiBold 10.185px;
color: #ffffff;
```

#### Primary Button (Verify)
```css
background: linear-gradient(180deg, #5ace49 0%, #229a3c 100%);
border-radius: 4px;
padding: 10px 20px;
width: 129px;
box-shadow:
  0px 0px 100px rgba(255,71,0,0.15),
  inset 0px -0.5px rgba(0,0,0,0.5),
  inset 0px 0.5px rgba(255,255,255,0.05);
font: Manrope SemiBold 11.813px;
color: #ffffff;
```

#### Content Card
```css
background: #333333;
border-radius: 18.77px;
box-shadow:
  0px 3.886px 7.771px rgba(0,0,0,0.09),
  0px 7.771px 15.542px rgba(0,0,0,0.09),
  0px 15.542px 31.085px rgba(0,0,0,0.12),
  0px 31.085px 62.169px rgba(0,0,0,0.15),
  0px 62.169px 124.339px rgba(0,0,0,0.18);
border: 0.486px solid rgba(255,255,255,0.05) inset;
```

---

## Page Designs

### 1. Single Verify Page

**Route**: `/home/quick-verify`

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  ┌─────────────────────┐  ┌──────────────────────────────────────────────┐ │
│  │                     │  │                                              │ │
│  │   Verify [Inbox]    │  │  Single Verify: One Click and Done! ✨       │ │
│  │                     │  │                                              │ │
│  │   ───────────────   │  │  Got a single email that needs a little TLC? │ │
│  │   ☐ Bulk Verify     │  │  Just pop it into the box below, and let our │ │
│  │   ☑ Single Verify   │  │  super-smart verification wizard work its    │ │
│  │   ☐ Deliverability  │  │  magic!                                      │ │
│  │   ☐ API             │  │                                              │ │
│  │                     │  │  ┌───────────────────────────┐ ┌──────────┐  │ │
│  │   ───────────────   │  │  │ Enter Email Here...       │ │  Verify  │  │ │
│  │   GENERAL           │  │  └───────────────────────────┘ └──────────┘  │ │
│  │                     │  │                                              │ │
│  │   ☐ Billing         │  └──────────────────────────────────────────────┘ │
│  │   ☐ Support         │                                                   │
│  │                     │  ┌──────────────────────────────────────────────┐ │
│  │   ┌───────────────┐ │  │                                              │ │
│  │   │ ✦ Buy Credits │ │  │  Recent Verifications                        │ │
│  │   │           279 │ │  │                                              │ │
│  │   └───────────────┘ │  │            ┌──────────┐                      │ │
│  │                     │  │            │    📥    │                      │ │
│  │   ┌───────────────┐ │  │            └──────────┘                      │ │
│  │   │ AS │ Aman     │ │  │                                              │ │
│  │   │    │ Basic ⚙  │ │  │  There are currently no recent verifications │ │
│  │   └───────────────┘ │  │  to display.                                 │ │
│  │                     │  │                                              │ │
│  └─────────────────────┘  └──────────────────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Form Fields**
| Field | Type | Placeholder | Width | Validation |
|-------|------|-------------|-------|------------|
| Email | email | "Enter Email Here..." | 473px | Required, valid email format |

**Actions**
| Element | Action |
|---------|--------|
| Verify | Submit single email for verification |
| Bulk Verify | Navigate to `/home/bulk-verify` |
| Single Verify | Current page (active) |
| Deliverability | Navigate to `/home/deliverability` |
| API | Navigate to `/home/api-keys` |
| Billing | Navigate to `/home/billing` |
| Support | Open support modal/page |
| Buy Credits | Navigate to `/home/billing` |
| Settings (⚙) | Navigate to `/home/profile` |

**States**

#### Empty State (Default)
- Input shows placeholder "Enter Email Here..."
- Recent Verifications shows empty state with inbox icon and message

#### Input Filled State
- Input background changes to `#2f332e`
- Input border changes to `#49ff17` (green)
- Input has glow effect `box-shadow: 0px 0px 3px 0.971px #a56f59`
- Input text color is `#ffffff` (white), SemiBold weight

---

### 2. Cookie Policy Modal

**Trigger**: Shown on first visit or when cookie consent is needed

```
┌────────────────────────────────────────────────────────────────┐
│                                                          ✕     │
│  Cookie policy                                                 │
│                                                                │
│  This site uses cookies to make it work properly, help us to   │
│  understand how it's used and to display content that is more  │
│  relevant to you. For more information, see our Cookie Policy  │
│                                                                │
│  ┌──────────┐  ┌──────────┐                                    │
│  │  Accept  │  │  Reject  │                                    │
│  └──────────┘  └──────────┘                                    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Modal Spec**
```css
background: #353534;
border: 2px solid #49ff17;
border-radius: 20px;
width: 480px;
padding: 20px 58px 20px 20px;
```

**Actions**
| Element | Action |
|---------|--------|
| Accept | Store cookie consent, close modal |
| Reject | Decline cookies, close modal |
| ✕ (close) | Close modal without action |
| Cookie Policy (link) | Navigate to `/privacy#cookies` |

**Button Specs**
```css
/* Accept Button */
background: #14ff3f;
padding: 8px 16px;
border-radius: 8px;
font: Inter Bold 16px;
color: #ffffff;

/* Reject Button */
background: transparent;
border: 1px solid #ffffff;
padding: 8px 16px;
border-radius: 8px;
font: Inter Bold 16px;
color: #ffffff;
```

---

### 3. Recent Verifications List

**Location**: Replaces the empty state in "Recent Verifications" card on `/home/quick-verify`

**Node ID**: 2001:28447

```
┌──────────────────────────────────────────────────────────────────┐
│  Recent Verifications                                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ [AS] aman@outbox.vc                        [Deliverable]   │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ [AS] aman@outbox.vc                        [Risky]         │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ [AS] aman@outbox.vc                        [Undeliverable] │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ [AS] aman@outbox.vc                        [Unknown]       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Verification Row Card**
```css
background: rgba(255,255,255,0.03);
border-left: 4px solid #515151;
border-radius: 16px;
height: 62px;
overflow: hidden;
padding: 11px 20px;
display: flex;
align-items: center;
gap: 10px;
```

**Row Contents**
| Element | Style |
|---------|-------|
| Avatar | 40px circle, gradient background based on status, initials centered |
| Email | Manrope Medium 18px, #ffffff, width: 393px |
| Status Badge | Manrope SemiBold 12px, #ffffff, padding: 5px 8px, border-radius: 8px |

**Status Badge Colors**
| Status | Background | Avatar Gradient |
|--------|------------|-----------------|
| Deliverable | #15c25a (green) | Green tones |
| Risky | #b1ab1d (yellow/olive) | Yellow tones |
| Undeliverable | #df1e1e (red) | Red/purple tones |
| Unknown | #5a46d6 (purple) | Dark green tones |

**Interaction**: Clicking a row opens the Email Verification Detail panel

---

### 4. Email Verification Detail

**Location**: Slide-out panel or expanded view when clicking an email from Recent Verifications

**Node ID**: 2001:27934

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  [AS] aman@outbox.vc                              ┌─────────────┐   │
│                                                   │ Deliverable │   │
│  ════════════════════════════════════════════○    └─────────────┘   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   [8.5]                  │
│                                                                     │
│  General                                                            │
│  ┌─────────────────────────┐  ┌─────────────────────────┐          │
│  │ Full Name               │  │ Gender                  │          │
│  │ Aman Sinha              │  │ Male                    │          │
│  └─────────────────────────┘  └─────────────────────────┘          │
│  ┌─────────────────────────┐  ┌─────────────────────────┐          │
│  │ State                   │  │ Reason                  │          │
│  │ ✓ Deliverable           │  │ Accepted Mail           │          │
│  └─────────────────────────┘  └─────────────────────────┘          │
│  ┌─────────────────────────┐                                       │
│  │ Domain                  │                                       │
│  │ gmail.com (link)        │                                       │
│  └─────────────────────────┘                                       │
│                                                                     │
│  Attributes                                                         │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ ✓ Free                  │ Yes                    │ .95X │     │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │ ✓ Role                  │ Yes                    │ .95X │     │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │ ✓ Disposable            │ Yes                    │ .95X │     │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │ ✓ Account               │ Yes                    │ .95X │     │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │ ✓ Accept All            │ Yes                    │ .95X │     │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │ ✓ Tags                  │ Yes                    │ .95X │     │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ... (more attributes)                                              │
│                                                                     │
│  Attributes (Server Info)                                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ SMTP Provider           │ Google                               │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │ MX Records              │ gmail.com/http/::                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Panel Container**
```css
background: rgba(255,255,255,0.03);
border-left: 4px solid #515151;
border-radius: 16px;
overflow: hidden;
```

**Header Section**
| Element | Style |
|---------|-------|
| Avatar | 40px circle, gradient background, initials centered |
| Email | Manrope Medium 18px, #ffffff |
| Status Badge | Manrope SemiBold 12px, #ffffff, bg: #15c25a, padding: 5px 8px, border-radius: 8px |

**Score Progress Bar**
```css
/* Container */
display: flex;
gap: 9px;

/* Segments (left to right) */
segment-1: linear-gradient(#361fcb → #1b0f65), width: 42px;   /* Purple - Low */
segment-2: linear-gradient(#5cd34a → #2b6d26), width: 137px;  /* Green */
segment-3: linear-gradient(#e4b14e → #7e622b), width: 232px;  /* Yellow/Gold */
segment-4: linear-gradient(#1edf6b → #10793a), width: 137px;  /* Bright Green - High */

/* All segments */
height: 12px;
border-radius: 10px;

/* Score Indicator (draggable position) */
background: #6ce9a6;
border: 4px solid #ffffff;
width: 22px;
height: 18px;
border-radius: 30px;

/* Score Badge */
background: #1edf6b;
padding: 5px 8px;
border-radius: 8px;
font: Manrope Bold 13px;
color: #ffffff;
```

**Section Headers**
```css
font: Manrope Bold 14px;
color: #ffffff;
```

**Field Labels**
```css
font: Manrope Medium 12px;
color: #ffffff;
```

**Field Values (Read-only Inputs)**
```css
background: #323230;
border: 0.971px solid #4d4d4d (inset);
border-radius: 3.886px;
padding: 11.83px 7.771px;
font: Manrope SemiBold 10.185px;
color: #ffffff;
```

**Domain Link**
```css
color: #ee722d;
text-decoration: underline;
```

**Attribute Row**
```css
/* Container */
background: #323230;
border: 0.971px solid #4d4d4d (inset);
border-radius: 3.886px;
padding: 11.83px 7.771px;
display: flex;
align-items: center;
gap: 12px;

/* Check Icon */
size: 16px;
color: #15c25a; /* green checkmark */

/* Attribute Name */
font: Manrope Bold 10.185px;
color: #ffffff;
width: 184px;

/* Value */
font: Manrope SemiBold 10.185px;
color: #ffffff;

/* Score Badge */
background: #252522;
border-radius: 4px;
width: 40px;
font: Manrope SemiBold 10.185px;
color: #ffffff;
```

**Attributes List**
| Attribute | Description |
|-----------|-------------|
| Free | Is this a free email provider (Gmail, Yahoo, etc.) |
| Role | Is this a role-based email (info@, support@, etc.) |
| Disposable | Is this a temporary/disposable email |
| Account | Does the account exist |
| Accept All | Does the domain accept all emails |
| Tags | Email has associated tags |
| Numerical Characters | Contains numbers |
| Alphabetical Characters | Contains letters |
| Unicode Symbols | Contains special characters |
| Mailbox Full | Is the mailbox full |

**Server Info Section**
| Field | Example Value |
|-------|---------------|
| SMTP Provider | Google, Microsoft, etc. |
| MX Records | Domain MX record info |

---

## Components

### Sidebar
- **Width**: 314px
- **Height**: 740px
- **Background**: Linear gradient (#232121 → #2d2b2b)
- **Border Radius**: 20px
- **Backdrop Filter**: blur(37px)
- **Position**: Fixed left, 10px margin

### Navigation Item
```css
/* Default */
height: 48px;
width: 296px;
padding: 14px 16px;
border-radius: 8px;
gap: 16px;

/* Active State */
background: linear-gradient(162.75deg, rgba(215,237,237,0.16) 47.79%, rgba(204,235,235,0) 100%);
border-top: 1px solid rgba(255,255,255,0.08);
```

### Buy Credits Button
```css
background: linear-gradient(258.33deg, #373534 0.81%, #3c3c3c 98.2%);
height: 48px;
width: 296px;
padding: 14px 16px;
border-radius: 8px;
```

### User Profile Card
```css
background: linear-gradient(152.38deg, rgba(215,237,237,0.07) 47.79%, rgba(204,235,235,0) 100%);
border-top: 1px solid rgba(255,255,255,0.08);
padding: 16px;
border-radius: 16px;
```

### Avatar
```css
size: 40px × 40px;
border-radius: 50%;
background: gradient;
/* Initials centered */
font: Manrope SemiBold 14px;
color: #ffffff;
```

---

## Sidebar Navigation Items

| Icon | Label | Route | Active |
|------|-------|-------|--------|
| inbox-double | Bulk Verify | /home/bulk-verify | No |
| mail-plus | Single Verify | /home/quick-verify | Yes |
| inbox-newsletter | Deliverability | /home/deliverability | No |
| api-code | API | /home/api-keys | No |
| credit-card | Billing | /home/billing | No |
| support | Support | /support | No |

---

## Empty State (Recent Verifications)

```css
/* Icon Container */
background: rgba(255,164,58,0.1); /* #ffa43a at 10% */
size: 64px × 64px;
border-radius: 18.27px;

/* Icon */
size: 32px × 32px;
color: #ffa43a;
```

**Text**: "There are currently no recent verifications to display."

---

## Assets

### Screenshots
```
docs/figma/dashboard/screenshots/
├── single-verify.png              # Full page, empty state (2880×1520)
├── single-verify-input-filled.png # Card with email entered
├── recent-verifications-list.png  # Recent Verifications list with status badges
├── email-verification-detail.png  # Detailed email verification breakdown
└── cookie-policy-modal.png        # Cookie consent modal
```

### Icons (Downloaded)
```
docs/figma/dashboard/icons/
├── inbox-double.svg      # Bulk Verify nav icon
├── mail-plus.svg         # Single Verify nav icon
├── inbox-newsletter.svg  # Deliverability nav icon
├── api-code.svg          # API nav icon
├── credit-card.svg       # Billing nav icon
├── support.svg           # Support nav icon
├── sparkle.svg           # Decorative sparkle (Buy Credits)
├── user-avatar.svg       # User avatar placeholder
├── cog-settings.svg      # Settings gear icon
├── inbox-empty.svg       # Empty state icon
└── check-circle.svg      # Verification attribute checkmark
```

### Figma Asset URLs (expire in 7 days)
```
inbox-double: https://www.figma.com/api/mcp/asset/7b44d746-8150-421d-ae0b-8f547b3356ba
mail-plus: https://www.figma.com/api/mcp/asset/9871403a-63c4-4662-890a-27e3229a9517
inbox-newsletter: https://www.figma.com/api/mcp/asset/0a0216fe-a07d-4c9d-a367-5fbc89dc8e24
api-code: https://www.figma.com/api/mcp/asset/23a58a90-609f-4d0c-bf18-108cbb37ece1
credit-card: https://www.figma.com/api/mcp/asset/1c38bbfd-ef27-4619-a0c9-0afccf6b4b2b
support: https://www.figma.com/api/mcp/asset/a11968e6-8d3b-40cf-ba51-9cf4c26a3497
sparkle: https://www.figma.com/api/mcp/asset/45a26841-b5ae-47f8-9099-aa04d93cdacf
user-avatar: https://www.figma.com/api/mcp/asset/223be20b-afa8-44f6-b8b8-0caa359f799e
cog-settings: https://www.figma.com/api/mcp/asset/e63029dd-e4c5-4fad-acee-73873800ea49
inbox-empty: https://www.figma.com/api/mcp/asset/9d5bd362-4210-4e35-8f8c-fbe9dd2854b6
close-icon: https://www.figma.com/api/mcp/asset/7acdd10b-70ea-4061-bd17-4d1ea5660dc4
```

---

## CSS Variables

```css
:root {
  /* Background */
  --bg-gradient-start: #262626;
  --bg-gradient-end: #1a1a1a;

  /* Sidebar */
  --sidebar-gradient-start: #232121;
  --sidebar-gradient-end: #2d2b2b;
  --sidebar-border: #26292d;
  --sidebar-width: 314px;

  /* Cards */
  --card-bg: #333333;
  --card-bg-alt: #343433;
  --card-bg-dark: #262624;
  --card-radius: 18.77px;

  /* Navigation */
  --nav-item-height: 48px;
  --nav-active-gradient: linear-gradient(162.75deg, rgba(215,237,237,0.16) 47.79%, transparent 100%);

  /* Inputs */
  --input-bg: #3b3b3b;
  --input-border: #4d4d4d;
  --input-placeholder: #a1a1a1;
  --input-focus-bg: #2f332e;
  --input-focus-border: #49ff17;
  --input-focus-glow: #a56f59;

  /* Text */
  --text-primary: #ededed;
  --text-secondary: #c0c6c6;
  --text-muted: #b3b3b3;
  --text-label: #686b6e;

  /* Accent */
  --accent-green: #0dff1d;
  --credits-green: #1aff4c;
  --plan-green: #b6f09c;
  --warning-orange: #ffa43a;

  /* Buttons */
  --btn-primary-start: #5ace49;
  --btn-primary-end: #229a3c;
  --btn-cookie-accept: #14ff3f;

  /* Modal */
  --modal-bg: #353534;
  --modal-border: #49ff17;
}
```

---

## Implementation Notes

1. **Fonts Required**:
   - GRIFTER Bold (logo only)
   - Manrope (primary UI font: Regular, Medium, SemiBold, Bold, ExtraBold)
   - Inter (modal buttons: Bold)

2. **Sidebar**: Fixed position, blurred background effect with backdrop-filter

3. **Active Navigation**: Gradient background with subtle top border

4. **Cards**: Multi-layer shadow for depth, very subtle inner border

5. **Input Focus State**: Green border with orange glow creates a unique effect

6. **Responsive**: Sidebar collapses on mobile, content cards stack

7. **Cookie Modal**: Should appear as overlay with semi-transparent backdrop
