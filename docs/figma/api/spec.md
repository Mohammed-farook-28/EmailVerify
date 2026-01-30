# API Keys Pages - Figma Design

## Figma Source
- **File**: Emailkit
- **File Key**: r2m4Md3beV9KoBbu3ICOR9

| Page | Node ID | URL |
|------|---------|-----|
| API Empty State | 2001:17999 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-17999&m=dev) |
| API Usage | 2001:27536 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-27536&m=dev) |
| API Keys List | 2001:27650 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-27650&m=dev) |
| API Overview | 2001:27771 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-27771&m=dev) |
| New API Key | 2001:27241 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-27241&m=dev) |

---

## Design System

### Color Palette (API-specific)
| Token | Hex | Usage |
|-------|-----|-------|
| Card Background | #262624 | Form card background |
| Field Background | #323230 | Input fields, option cards |
| Field Border | #4d4d4d | Input field stroke |
| Cancel Button Border | #4a4846 | Cancel button stroke |
| Icon Background | rgba(255,164,58,0.1) | Security type icon bg |

### Typography
| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Page Title | Manrope | 16px | Bold | #ffffff |
| Field Label | Manrope | 12px | Medium | #ffffff |
| Input Placeholder | Manrope | 10.185px | Regular | #a1a1a1 |
| Option Title | Manrope | 14px | Bold | #ffffff |
| Option Description | Manrope | 10px | Regular | #a1a1a1 |
| Button Text | Manrope | 11.813px | SemiBold | #ffffff |

---

## Page Designs

### 1. API Empty State

**Route**: `/home/api-keys` (when no API keys exist)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                          ┌────────┐                                  │
│                          │  </>✦  │                                  │
│                          └────────┘                                  │
│                                                                      │
│              Get Started with Our API 🚀                             │
│                                                                      │
│            Start Verifying Emails in Minutes!                        │
│                                                                      │
│     Ready to take your email verification to the next level?         │
│     Our simple, JSON-based API makes it a breeze! With just a        │
│     few lines of code, you can integrate our powerful email          │
│     verification capabilities into your applications and start       │
│     ensuring your outreach hits the mark.                            │
│                                                                      │
│                      ┌─────────────────┐                             │
│                      │      Verify     │                             │
│                      └─────────────────┘                             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Card Container**
```css
background: #343433;
border-radius: 12px;
width: 683px;
height: 342px;
/* Inherits card shadow from dashboard */
```

**Icon Container**
```css
background: rgba(255,164,58,0.1);
border-radius: 18.27px;
size: 64px;
/* Code icon with sparkle inside */
```

**Typography**
| Element | Style |
|---------|-------|
| Title | Manrope Bold 24px, #ffffff, "Get Started with Our API 🚀" |
| Subtitle | Manrope Bold 14px, #ffffff, centered |
| Description | Manrope Medium 12px, #b3b3b3, centered, line-height: 20px |

**CTA Button**
```css
background: linear-gradient(180deg, #5ace49 0%, #229a3c 100%);
border-radius: 4px;
padding: 10px 20px;
width: 231px;
font: Manrope SemiBold 11.813px;
color: #ffffff;
```

**Action**
| Element | Action |
|---------|--------|
| Verify | Opens New API Key form/modal |

---

### 2. API Usage Dashboard

**Route**: `/home/api-keys` (main dashboard section)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  API Usage                    [All Keys ▼] [Date Range] [Hourly ▼]   │
│                                                                      │
│  Verification   Deliverable    Risky      Undeliverable   Unknown    │
│     120           120          120           120           120       │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Warmup emails sent                                            │  │
│  │                                                                │  │
│  │  28 ┤  ▓▓                                                      │  │
│  │  24 ┤  ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓                                   │  │
│  │  20 ┤  ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓                                   │  │
│  │  16 ┤  ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓                                   │  │
│  │  12 ┤  ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓                                   │  │
│  │   8 ┤  ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓                                   │  │
│  │   4 ┤  ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓                                   │  │
│  │   0 └──Thu──Fri──Sat──Sun──Mon──Tue──Wed                       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Stats Cards**
| Metric | Label Color | Value |
|--------|-------------|-------|
| Verification | #c2c2c2 (gray) | Total count |
| Deliverable | #15c25a (green) | Count |
| Risky | #f0e837 (yellow) | Count |
| Undeliverable | #df1e1e (red) | Count |
| Unknown | #6d5bde (purple) | Count |

**Filter Dropdowns**
```css
background: #3b3b3b;
border: 0.971px solid #4d4d4d;
border-radius: 3.886px;
padding: 7.83px 7.771px;
font: Manrope Regular 10.185px;
color: #ffffff;
```

**Bar Chart**
```css
/* Container */
background: #202020;
border: 1px solid #343434;
border-radius: 4px;
padding: 12px 16px;

/* Bars - stacked vertically for each day */
bar-width: 31px;
border-radius: 8px 8px 0 0;

/* Bar colors (status types) */
deliverable: #72f067 / #15c25a;
risky: #f0ca67;
undeliverable: #df1e1e;
unknown: #6d5bde;

/* Axis labels */
font: Manrope Regular 12px;
color: #edeff4;
```

---

### 3. API Keys List

**Route**: `/home/api-keys` (keys table section)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  API Keys                                           [New key]        │
│                                                                      │
│  Name          Key                      Type     Security            │
│  ─────────────────────────────────────────────────────────────────   │
│  Reachinbox    3dwnjednejncdsc 📋      [Live]   [Private]  Manage   │
│  Reachinbox    3dwnjednejncdsc 📋      [Live]   [Private]  Manage   │
│  Reachinbox    3dwnjednejncdsc 📋      [Live]   [Private]  Manage   │
│  Reachinbox    3dwnjednejncdsc 📋      [Live]   [Private]  Manage   │
│  ...                                                                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Table Header**
```css
background: #2e2c29;
height: 32px;
font: Manrope SemiBold 10px;
color: #c6c6c6;
```

**Table Columns**
| Column | Width | Content |
|--------|-------|---------|
| Name | 95px | Key name |
| Key | 234px | Masked key + copy icon |
| Type | auto | Live/Test badge |
| Security | auto | Private/Public badge |
| Actions | auto | Manage button |

**Badges**
```css
/* Live Badge */
background: #255a3a;
color: #1edf6b;
padding: 2px 4px;
border-radius: 4px;
font: Manrope SemiBold 10px;

/* Private Badge */
background: #3d5457;
color: #30b2ce;
padding: 2px 4px;
border-radius: 4px;
font: Manrope SemiBold 10px;

/* Manage Button */
background: transparent;
border: 1px solid #343434;
padding: 2px 4px;
border-radius: 4px;
font: Manrope SemiBold 10px;
color: #ffffff;
```

**New Key Button**
```css
background: #29ff16;
border-radius: 4px;
padding: 4px 12px;
font: Manrope Medium 10px;
color: #ffffff;
```

---

### 4. API Overview

**Route**: `/home/api-keys` (overview/documentation section)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  API Overview                             [Full Documentation]       │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                      │
│  Verify                                                              │
│  Verify if the given email address is deliverable                    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 395293457234895728572943582794548957394857485745483754835...   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  📋 Copy to Clipboard    🔗 View in browser                          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Card Container**
```css
background: #272725;
border-radius: 12px;
height: 250px;
```

**Endpoint Display**
```css
/* Title */
font: Manrope SemiBold 16px;
color: #ffffff;

/* Description */
font: Manrope SemiBold 12px;
color: #b7b4b4;

/* Endpoint URL Box */
background: #1e1e1c;
border: 0.971px solid #4d4d4d;
border-radius: 3.886px;
padding: 11.83px 12px;
font: Manrope Regular 10.185px;
color: #a1a1a1;
```

**Action Links**
```css
font: Manrope SemiBold 12px;
color: #b7b4b4;
/* Icon size: 24px */
```

**Full Documentation Button**
```css
background: #29ff16;
border-radius: 4px;
padding: 4px 12px;
font: Manrope Medium 10px;
color: #ffffff;
```

---

### 5. New API Key Form

**Route**: `/home/api-keys/new` or Modal on `/home/api-keys`

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  New API Key                                                         │
│                                                                      │
│  Full Name                                                           │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ enter a name for this key                                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Security                                                            │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐   │
│  │  [🔒]                       │  │  [🌐]                       │   │
│  │  Public                     │  │  Private                    │   │
│  │  This type of key can be   │  │  This type of key must be   │   │
│  │  used publicly. An example │  │  kept private. Only use     │   │
│  │  would be using this key   │  │  this key in server-side    │   │
│  │  in the JavaScript of a    │  │  code where it will not     │   │
│  │  website.                  │  │  be exposed.                │   │
│  └─────────────────────────────┘  └─────────────────────────────┘   │
│                                                                      │
│  Trusted IP Addresses                                                │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ enter a comma separated list of IP addresses                   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Key Type                                                            │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐   │
│  │  Live Key                   │  │  Test Key                   │   │
│  │  For production use.        │  │  Returns randomly generated │   │
│  │  Requests will impact your  │  │  API responses. Requests    │   │
│  │  Credit Balance.            │  │  will not impact your       │   │
│  │                             │  │  Credit Balance.            │   │
│  └─────────────────────────────┘  └─────────────────────────────┘   │
│                                                                      │
│  ┌──────────────┐                              ┌──────────────┐      │
│  │    Cancel    │                              │     Save     │      │
│  └──────────────┘                              └──────────────┘      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Form Fields**
| Field | Type | Placeholder | Validation |
|-------|------|-------------|------------|
| Full Name | text | "enter a name for this key" | Required |
| Security | radio | - | Required (Public/Private) |
| Trusted IP Addresses | text | "enter a comma separated list of IP addresses" | Optional, comma-separated IPs |
| Key Type | radio | - | Required (Live/Test) |

**Actions**
| Element | Action |
|---------|--------|
| Cancel | Close form/modal without saving |
| Save | Create API key with entered settings |

---

## Components

### Form Card Container
```css
background: #262624;
border-radius: 12px;
width: 683px;
height: 689px;
/* Inherits card shadow from dashboard */
```

### Input Field
```css
background: #323230;
border: 0.971px solid #4d4d4d (inset);
border-radius: 3.886px;
padding: 11.83px 12px;
font: Manrope Regular 10.185px;
color: #a1a1a1 (placeholder);
width: 100%; /* 620px inside form */
```

### Security Type Card
```css
background: #323230;
border: 0.971px solid #4d4d4d (inset);
border-radius: 3.886px;
height: 94px;
padding: 11.83px 20px;
display: flex;
align-items: center;
gap: 20px;
```

### Security Icon Container
```css
background: rgba(255,164,58,0.1);
border-radius: 9px;
size: 64px;
display: flex;
align-items: center;
justify-content: center;
```

### Key Type Card
```css
background: #323230;
border: 0.971px solid #4d4d4d (inset);
border-radius: 3.886px;
height: 94px;
padding: 11.83px 20px;
```

### Cancel Button
```css
background: transparent;
border: 1px solid #4a4846;
border-radius: 4px;
padding: 12px 20px;
width: 137px;
box-shadow:
  0px 0px 100px rgba(255,71,0,0.15),
  inset 0px -0.5px rgba(0,0,0,0.5),
  inset 0px 0.5px rgba(255,255,255,0.05);
font: Manrope SemiBold 11.813px;
color: #ffffff;
```

### Save Button
```css
background: linear-gradient(180deg, #5ace49 0%, #229a3c 100%);
border-radius: 4px;
padding: 12px 20px;
width: 137px;
box-shadow:
  0px 0px 100px rgba(255,71,0,0.15),
  inset 0px -0.5px rgba(0,0,0,0.5),
  inset 0px 0.5px rgba(255,255,255,0.05);
font: Manrope SemiBold 11.813px;
color: #ffffff;
```

---

## Security Types

| Type | Icon | Description |
|------|------|-------------|
| Public | lock (🔒) | This type of key can be used publicly. An example would be using this key in the JavaScript of a website. |
| Private | public/globe (🌐) | This type of key must be kept private. Only use this key in server-side code where it will not be exposed. |

---

## Key Types

| Type | Description | Credit Impact |
|------|-------------|---------------|
| Live Key | For production use | Requests will impact your Credit Balance |
| Test Key | Returns randomly generated API responses | Requests will not impact your Credit Balance |

---

## Assets

### Screenshots
```
docs/figma/api/screenshots/
├── api-empty-state.png  # Getting started / empty state
└── new-api-key.png      # New API Key form page
```

### Icons (Downloaded)
```
docs/figma/api/icons/
├── code-sparkle.svg  # Code icon with sparkle for empty state
├── lock.svg          # Lock icon for Public key type
└── public.svg        # Globe icon for Private key type
```

### Figma Asset URLs (expire in 7 days)
```
code-sparkle: https://www.figma.com/api/mcp/asset/d204e0d0-d241-44c3-8e5d-d17698dfef4b
lock: https://www.figma.com/api/mcp/asset/76a46a8c-3199-4d8a-aeab-aa5b2fb31225
public: https://www.figma.com/api/mcp/asset/9d7a14d9-5544-4fee-af99-159afa468fdb
```

---

## CSS Variables

```css
:root {
  /* API Form specific */
  --api-form-bg: #262624;
  --api-field-bg: #323230;
  --api-field-border: #4d4d4d;
  --api-cancel-border: #4a4846;
  --api-icon-bg: rgba(255,164,58,0.1);
}
```

---

## Implementation Notes

1. **Security Types**: Visually similar cards but semantically radio buttons - only one can be selected

2. **Key Types**: Same pattern as Security - radio selection between Live and Test

3. **Form Layout**: Fields stacked vertically, option cards side-by-side in 2-column grid

4. **Validation**:
   - Full Name is required
   - Security type selection is required
   - Key type selection is required
   - IP addresses are optional, validate format if provided

5. **On Save**: Generate API key with `sk_` prefix (live) or `sk_test_` prefix (test)
