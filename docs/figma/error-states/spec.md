# Error States - Figma Design Specification

## Overview

This section documents error pages and feedback modals used throughout the application. These include HTTP error pages (404, 500), payment status modals, and security warning pages.

**Figma File**: [Emailkit](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit)

---

## Page Index

| # | Page Name | Node ID | Screenshot |
|---|-----------|---------|------------|
| 1 | 404 Page Not Found | 2001:20947 | [01-404-page-not-found.png](screenshots/01-404-page-not-found.png) |
| 2 | Server Error (500) | 2001:21170 | [02-server-error.png](screenshots/02-server-error.png) |
| 3 | Payment Success Modal | 2001:21212 | [03-payment-success.png](screenshots/03-payment-success.png) |
| 4 | Payment Failed Modal | 2001:21268 | [04-payment-failed.png](screenshots/04-payment-failed.png) |
| 5 | VPN Detection Warning | 2001:21001 | [05-vpn-detection.png](screenshots/05-vpn-detection.png) |

---

## Design System

### Color Palette

#### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| Page Background | `#1A1A1A` to `#262626` | Radial gradient |
| Card Background | `#333333` | Error card/modal bg |
| Card Mask | `#343433` | Masked overlay |
| Divider | `#3B3B3B` | Horizontal dividers |

#### Text Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Primary Text | `#FFFFFF` | Headings |
| Secondary Text | `#C1C2C5` | Body copy, descriptions |
| Muted Text | `#969186` | Labels, hints |
| Value Text | `#E8E8E8` | Transaction values |
| Highlight Text | `#E6E6E6` / `#F4F4F4` | Bold values |
| Link Text | `#54FFDA` | Clickable links (cyan) |

#### Button Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Primary Green Start | `#5ACE49` | Gradient start |
| Primary Green End | `#229A3C` | Gradient end |
| Secondary Border | `#4A4846` | Outline button border |
| Dark Button | `#24211D` | Cancel/Download buttons |

#### Status Colors
| Token | Hex | Usage |
|-------|-----|-------|
| 404 Green | `#5ACE49` | 404 number color |
| Error Red | `#E53935` | X icon in failed payment |
| Success Green | `#28943A` | Checkmark in success |

### Typography

| Style | Size | Weight | Font | Usage |
|-------|------|--------|------|-------|
| Page Heading | 32px | Bold | Open Sans | 404, VPN page titles |
| Modal Heading | 24px | Bold | Open Sans / Manrope | Modal titles |
| Body Text | 14-16px | SemiBold | Open Sans / Manrope | Descriptions |
| Button Text | 11.813px | SemiBold | Manrope | Button labels |
| Label | 14px | SemiBold | Open Sans | Transaction labels |
| Value | 13px | Regular | Open Sans | Transaction values |

### Shadows

#### Card Shadow
```css
box-shadow:
  0px 3.886px 7.771px 0px rgba(0, 0, 0, 0.09),
  0px 7.771px 15.542px 0px rgba(0, 0, 0, 0.09),
  0px 15.542px 31.085px 0px rgba(0, 0, 0, 0.12),
  0px 31.085px 62.169px 0px rgba(0, 0, 0, 0.15),
  0px 62.169px 124.339px 0px rgba(0, 0, 0, 0.18);
```

#### Inner Border
```css
box-shadow: inset 0px 0px 0px 0.486px rgba(255, 255, 255, 0.05);
```

#### Button Inner Shadow
```css
box-shadow:
  inset 0px -0.5px 0px 0px rgba(0, 0, 0, 0.5),
  inset 0px 0.5px 0px 0px rgba(255, 255, 255, 0.05);
```

---

## Page Layouts

### 1. 404 Page Not Found
**Node ID**: `2001:20947`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-20947&m=dev)

#### Layout
```
+------------------------------------------------------------------+
|                                                                  |
|                     +------------------------+                   |
|                     |                        |                   |
|                     |        4 😟 4          |                   |
|                     |      (green 404)       |                   |
|                     |                        |                   |
|                     |   Oops! Page Not Found |                   |
|                     |                        |                   |
|                     |   It looks like the    |                   |
|                     |   page you're trying   |                   |
|                     |   to access doesn't    |                   |
|                     |   exist.               |                   |
|                     |                        |                   |
|                     | ────────────────────── |                   |
|                     |                        |                   |
|                     | [Contact Support] [Go Home]               |
|                     |                        |                   |
|                     +------------------------+                   |
|                                                                  |
+------------------------------------------------------------------+
```

#### Components

##### Error Card
```css
.error-card {
  background: #333333;
  border-radius: 18.77px;
  width: 682px;
  height: 518px;
  box-shadow:
    0px 3.886px 7.771px 0px rgba(0, 0, 0, 0.09),
    0px 7.771px 15.542px 0px rgba(0, 0, 0, 0.09),
    0px 15.542px 31.085px 0px rgba(0, 0, 0, 0.12),
    0px 31.085px 62.169px 0px rgba(0, 0, 0, 0.15),
    0px 62.169px 124.339px 0px rgba(0, 0, 0, 0.18);
}
```

##### 404 Illustration
- Large green "404" text with sad face emoji in the "0"
- Dimensions: 388px × 166px

##### Heading
```css
.page-heading {
  font-family: 'Open Sans', sans-serif;
  font-weight: 700;
  font-size: 32px;
  color: #FFFFFF;
  text-align: center;
}
```

##### Description
```css
.description {
  font-family: 'Open Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: #C1C2C5;
  text-align: center;
  width: 394px;
}
```

---

### 2. Server Error (500)
**Node ID**: `2001:21170`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-21170&m=dev)

#### Layout
```
+------------------------------------------------------------------+
|                                                                  |
|     +------------------------------------------------------+     |
|     |                                                      |     |
|     |    [Unplugged Cable       Uh-oh! Server Error       |     |
|     |     Illustration]                                    |     |
|     |                          Something went wrong on     |     |
|     |                          our end.                    |     |
|     |                                                      |     |
|     |                          Please try:                 |     |
|     |                          • Refreshing the page       |     |
|     |                          • Returning to the Home Page|     |
|     |                          • Contacting Us Contact US  |     |
|     |                                                      |     |
|     |                          We're working to fix the    |     |
|     |                          issue. Thank you for your   |     |
|     |                          patience!                   |     |
|     |                                                      |     |
|     +------------------------------------------------------+     |
|                                                                  |
+------------------------------------------------------------------+
```

#### Components

##### Error Card
```css
.server-error-card {
  background: #333333;
  border-radius: 18.77px;
  width: 803px;
  height: 386px;
}
```

##### Illustration
- Unplugged cable/connectivity illustration
- Size: 280px × 280px
- Green accent colors on cables

##### Heading
```css
.server-error-heading {
  font-family: 'Manrope', sans-serif;
  font-weight: 700;
  font-size: 32px;
  color: #FFFFFF;
}
```

##### Recovery Steps
```css
.recovery-list {
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: #C1C2C5;
}

.recovery-list a {
  color: #54FFDA;
}
```

---

### 3. Payment Success Modal
**Node ID**: `2001:21212`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-21212&m=dev)

#### Layout
```
+--------------------------------------------+
|                                        [X] |
|                                            |
|              🎉 (party popper)             |
|              ✓ (green check)               |
|                                            |
|    Your Payment has been successful        |
|                                            |
|    We have received a payment of $49 USD.  |
|    You have been subscribed to the         |
|    25,000 Credits/Month                    |
|                                            |
|    Transaction ID:        00454534532      |
|    Next Billing Date:     29th Dec 2023    |
|                                            |
|    ──────────────────────────────────────  |
|                                            |
|           [📥 Download Invoice]            |
|                                            |
+--------------------------------------------+
```

#### Components

##### Modal Container
```css
.payment-success-modal {
  background: #333333;
  border-radius: 18.77px;
  width: 542px;
  height: 417px;
}
```

##### Close Button
```css
.close-button {
  position: absolute;
  top: 22px;
  right: 22px;
  width: 24px;
  height: 24px;
  color: #FFFFFF;
}
```

##### Success Illustration
- Party popper with green checkmark
- Size: 153px × 140px

##### Heading
```css
.success-heading {
  font-family: 'Manrope', sans-serif;
  font-weight: 700;
  font-size: 24px;
  color: #FFFFFF;
  text-align: center;
}
```

##### Payment Details
```css
.payment-description {
  font-family: 'Manrope', sans-serif;
  font-weight: 400;
  font-size: 16px;
  color: #969186;
  text-align: center;
  line-height: 1.6;
}

.payment-description .amount {
  font-weight: 700;
  color: #E6E6E6;
}

.payment-description .plan {
  font-weight: 700;
  color: #F4F4F4;
}
```

##### Transaction Info
```css
.transaction-label {
  font-family: 'Open Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: #969186;
}

.transaction-value {
  font-family: 'Open Sans', sans-serif;
  font-weight: 400;
  font-size: 13px;
  color: #E8E8E8;
}
```

##### Download Button
```css
.btn-download {
  background: #24211D;
  border-radius: 4px;
  padding: 13px 37px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-download span {
  font-family: 'Open Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: #FFFFFF;
}
```

---

### 4. Payment Failed Modal
**Node ID**: `2001:21268`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-21268&m=dev)

#### Layout
```
+--------------------------------------------+
|                                        [X] |
|                                            |
|              📄 (document)                 |
|              ❌ (red X)                    |
|                                            |
|    Your Payment has been unsuccessful      |
|                                            |
|    If you have any issues with subscription|
|    reach out to our support                |
|                                            |
|                                            |
|         [Cancel]    [Retry Payment]        |
|                                            |
+--------------------------------------------+
```

#### Components

##### Modal Container
```css
.payment-failed-modal {
  background: #333333;
  border-radius: 18.77px;
  width: 659px;
  height: 503px;
}
```

##### Error Illustration
- Document with magnifying glass and red X
- Size: 171px × 140px

##### Heading
```css
.failed-heading {
  font-family: 'Open Sans', sans-serif;
  font-weight: 700;
  font-size: 24px;
  color: #FFFFFF;
  text-align: center;
}
```

##### Description
```css
.failed-description {
  font-family: 'Open Sans', sans-serif;
  font-weight: 400;
  font-size: 16px;
  color: #FFFFFF;
  text-align: center;
}
```

##### Cancel Button
```css
.btn-cancel {
  background: #24211D;
  border-radius: 4px;
  padding: 13px 37px;
}

.btn-cancel span {
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: #FFFFFF;
}
```

##### Retry Button
```css
.btn-retry {
  background: linear-gradient(180deg, #5ACE49 0%, #229A3C 100%);
  border-radius: 4px;
  padding: 12px 20px;
  width: 148px;
  height: 48px;
  box-shadow: 0px 0px 100px 0px rgba(255, 71, 0, 0.15);
}

.btn-retry span {
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: #FFFFFF;
}
```

---

### 5. VPN Detection Warning
**Node ID**: `2001:21001`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-21001&m=dev)

#### Layout
```
+------------------------------------------------------------------+
|                                                                  |
|                     +------------------------+                   |
|                     |                        |                   |
|                     |    [Developer at       |                   |
|                     |     computer with      |                   |
|                     |     globe/VPN icon]    |                   |
|                     |                        |                   |
|                     | Oops! Seems like you   |                   |
|                     | are using VPN          |                   |
|                     |                        |                   |
|                     | Please Close to use    |                   |
|                     | application            |                   |
|                     |                        |                   |
|                     | ────────────────────── |                   |
|                     |                        |                   |
|                     | [Contact Support] [Refresh]               |
|                     |                        |                   |
|                     +------------------------+                   |
|                                                                  |
+------------------------------------------------------------------+
```

#### Components

##### Warning Card
```css
.vpn-warning-card {
  background: #333333;
  border-radius: 18.77px;
  width: 682px;
  height: 518px;
}
```

##### Illustration
- Developer at computer with globe/VPN icon
- Size: 310px × 205px
- Green accents (#5ACE49)

##### Heading
```css
.vpn-heading {
  font-family: 'Open Sans', sans-serif;
  font-weight: 700;
  font-size: 32px;
  color: #FFFFFF;
  text-align: center;
}
```

##### Description
```css
.vpn-description {
  font-family: 'Open Sans', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: #C1C2C5;
  text-align: center;
  width: 394px;
}
```

---

## Shared Components

### Primary Button (Green)
```css
.btn-primary {
  background: linear-gradient(180deg, #5ACE49 0%, #229A3C 100%);
  border-radius: 4px;
  padding: 12px 20px;
  box-shadow:
    0px 0px 100px 0px rgba(255, 71, 0, 0.15),
    inset 0px -0.5px 0px 0px rgba(0, 0, 0, 0.5),
    inset 0px 0.5px 0px 0px rgba(255, 255, 255, 0.05);
}

.btn-primary span {
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  font-size: 11.813px;
  color: #FFFFFF;
  letter-spacing: 0.12px;
  line-height: 16px;
}
```

### Secondary Button (Outline)
```css
.btn-secondary {
  background: transparent;
  border: 1px solid #4A4846;
  border-radius: 4px;
  padding: 12px 20px;
  box-shadow:
    0px 0px 100px 0px rgba(255, 71, 0, 0.15),
    inset 0px -0.5px 0px 0px rgba(0, 0, 0, 0.5),
    inset 0px 0.5px 0px 0px rgba(255, 255, 255, 0.05);
}

.btn-secondary span {
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  font-size: 11.813px;
  color: #FFFFFF;
  letter-spacing: 0.12px;
  line-height: 16px;
}
```

### Dark Button
```css
.btn-dark {
  background: #24211D;
  border-radius: 4px;
  padding: 13px 37px;
}

.btn-dark span {
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  font-size: 14px;
  color: #FFFFFF;
}
```

### Modal Close Button
```css
.modal-close {
  position: absolute;
  top: 22px;
  right: 22px;
  width: 24px;
  height: 24px;
  cursor: pointer;
}

.modal-close svg {
  color: #FFFFFF;
}
```

---

## Implementation Notes

### Error Page Behavior
- 404: Show when route not found
- 500: Show when server returns 5xx error
- VPN: Show when VPN/proxy detected (security measure)

### Payment Modal Behavior
- Success: Show after Stripe webhook confirms payment
- Failed: Show when payment processing fails
- Both modals should be closeable via X button

### Button Actions

| Page | Button | Action |
|------|--------|--------|
| 404 | Contact Support | Navigate to support page |
| 404 | Go Home | Navigate to `/home` |
| 500 | Home Page link | Navigate to `/home` |
| 500 | Contact US link | Navigate to support |
| Payment Success | Download Invoice | Download PDF invoice |
| Payment Failed | Cancel | Close modal |
| Payment Failed | Retry Payment | Retry Stripe checkout |
| VPN | Contact Support | Navigate to support |
| VPN | Refresh | Reload page |

### Accessibility
- All images need alt text
- Modals should trap focus
- Close buttons need aria-labels
- Error pages should have appropriate HTTP status codes

---

## Assets

### Screenshots
- `screenshots/01-404-page-not-found.png`
- `screenshots/02-server-error.png`
- `screenshots/03-payment-success.png`
- `screenshots/04-payment-failed.png`
- `screenshots/05-vpn-detection.png`

### Illustrations Needed
- 404 with sad face emoji
- Unplugged cable/connectivity
- Party popper with checkmark (success)
- Document with magnifying glass and X (failed)
- Developer at computer with globe/VPN icon
- Download icon (for invoice button)
- Close/X icon (for modal close)
