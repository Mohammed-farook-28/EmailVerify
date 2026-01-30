# Credit History - Figma Design Specification

## Overview

The Credit History page displays a transaction log showing all credit changes including purchases, refunds, and usage. Users can track their credit balance over time and see detailed reasons for each transaction.

**Figma File**: [Emailkit](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit)

---

## Page Index

| # | Page Name | Node ID | Screenshot |
|---|-----------|---------|------------|
| 1 | Credit History | 2001:29915 | [01-credit-history.png](screenshots/01-credit-history.png) |

---

## Design System

### Color Palette

#### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| Page Background | `#1A1A1A` to `#262626` | Radial gradient |
| Row Background | `rgba(255,255,255,0.03)` | Transaction row bg |
| Search Input | `#3B3B3B` | Search field background |

#### Transaction Status Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Credit Added Bg | `#1B4C23` | Positive change badge bg |
| Credit Added Text | `#48F4A5` | Positive change text (+22) |
| Credit Deducted Bg | `#3C1A1A` | Negative change badge bg |
| Credit Deducted Text | `#14E101` | Negative change text (-22) |

#### Text Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Header Text | `#C6C6C6` | Column headers |
| Primary Text | `#FFFFFF` | Date, balance values |
| Secondary Text | `#BFBFBF` | Labels |
| Credits Count | `#D4D4D4` | Active credits value |
| Placeholder | `#A1A1A1` | Search placeholder |

#### Border Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Row Border | `#515151` | Left border on rows |
| Divider | `#3B3B3B` | Horizontal divider |
| Input Border | `#4D4D4D` | Search input border |

### Typography

| Style | Size | Weight | Font | Usage |
|-------|------|--------|------|-------|
| Column Header | 12px | SemiBold | Manrope | Table headers |
| Date | 16px | SemiBold | Manrope | Transaction date |
| Reason | 16px | Medium | Manrope | Transaction reason |
| Change Badge | 16px | SemiBold | Manrope | +/- value |
| Balance | 18px | Medium | Manrope | Balance amount |
| Credits Label | 12px | Regular | Open Sans | "Active Credits" |
| Credits Value | 14px | SemiBold | Open Sans | "400 / 1,250" |
| Search | 10.185px | Regular | Manrope | Search placeholder |
| Button | 11.813px | SemiBold | Manrope | "Add More" |

---

## Page Layout

### Credit History
**Node ID**: `2001:29915`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-29915&m=dev)

#### Layout
```
+------------------------------------------------------------------+
|  [Sidebar]  |  [Search List                    ] Active Credits  |
|             |                                    400 / 1,250      |
|  Bulk Verify|                                    [+ Add More]     |
|  Single Ver.|  ─────────────────────────────────────────────────  |
|  API [Soon] |                                                     |
|  Active [S] |  Transaction Date    Reason       Change   Balance  |
|             |                                                     |
|  ─────────  |  ┃ 23/08/24    Refund of risky   [+22]      243    |
|  GENERAL    |  ┃                emails                            |
|  [Credit H] |  ─────────────────────────────────────────────────  |
|  Support    |  ┃ 23/08/24    Refund of risky   [-22]      243    |
|  Credit His |  ┃                emails                            |
|  Buy Credits|  ─────────────────────────────────────────────────  |
|             |  ┃ 23/08/24    Refund of risky   [+22]      243    |
|  ─────────  |  ┃                emails                            |
|  [User]     |  ─────────────────────────────────────────────────  |
|  Aman Sinha |  ┃ 23/08/24    Refund of risky   [-22]      243    |
|  Basic Plan |  ┃                emails                            |
|             |  ─────────────────────────────────────────────────  |
|             |  ... more rows                                      |
+------------------------------------------------------------------+
```

---

## Components

### Header Section

#### Search Input
```css
.search-input {
  background: #3B3B3B;
  border-radius: 8px;
  padding: 12px 7.771px;
  width: 360px;
  box-shadow: inset 0px 0px 0px 0.971px #4D4D4D;
}

.search-input::placeholder {
  color: #A1A1A1;
  font-size: 10.185px;
  font-family: 'Manrope', sans-serif;
}
```

#### Active Credits Display
```css
.credits-display {
  font-family: 'Open Sans', sans-serif;
}

.credits-label {
  color: #BFBFBF;
  font-size: 12px;
  font-weight: 400;
}

.credits-value {
  color: #D4D4D4;
  font-size: 14px;
  font-weight: 600;
}
```

#### Add More Button
```css
.btn-add-more {
  background: linear-gradient(180deg, #5ACE49 0%, #229A3C 100%);
  border-radius: 4px;
  padding: 12px 20px;
  width: 137px;
  box-shadow:
    0px 0px 100px 0px rgba(255, 71, 0, 0.15),
    inset 0px -0.5px 0px 0px rgba(0, 0, 0, 0.5),
    inset 0px 0.5px 0px 0px rgba(255, 255, 255, 0.05);
}

.btn-add-more span {
  color: #FFFFFF;
  font-size: 11.813px;
  font-weight: 600;
  font-family: 'Manrope', sans-serif;
}
```

### Table Headers

```css
.table-header {
  color: #C6C6C6;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Manrope', sans-serif;
}

/* Column widths */
.col-date { width: 253px; }
.col-reason { width: 336px; }
.col-change { width: 111px; }
.col-balance { width: 209px; text-align: right; }
```

### Transaction Row

```css
.transaction-row {
  background: rgba(255, 255, 255, 0.03);
  border-left: 4px solid #515151;
  border-radius: 16px;
  height: 48px;
  padding: 11px 20px;
  overflow: hidden;
}

.transaction-date {
  color: #FFFFFF;
  font-size: 16px;
  font-weight: 600;
  font-family: 'Manrope', sans-serif;
  width: 253px;
}

.transaction-reason {
  color: #FFFFFF;
  font-size: 16px;
  font-weight: 500;
  font-family: 'Manrope', sans-serif;
  width: 336px;
}

.transaction-balance {
  color: #FFFFFF;
  font-size: 18px;
  font-weight: 500;
  font-family: 'Manrope', sans-serif;
  text-align: right;
  width: 209px;
}
```

### Change Badge

#### Positive (Credit Added)
```css
.badge-positive {
  background: #1B4C23;
  border-radius: 4px;
  padding: 2px 12px;
}

.badge-positive span {
  color: #48F4A5;
  font-size: 16px;
  font-weight: 600;
  font-family: 'Manrope', sans-serif;
}
```

#### Negative (Credit Deducted)
```css
.badge-negative {
  background: #3C1A1A;
  border-radius: 4px;
  padding: 2px 12px;
}

.badge-negative span {
  color: #14E101;
  font-size: 16px;
  font-weight: 600;
  font-family: 'Manrope', sans-serif;
}
```

---

## Sidebar Navigation

The Credit History page shows "Credit History" as an active item in the sidebar under GENERAL section. Note there appear to be two "Credit History" items in the sidebar - one is the active highlighted state with gradient background.

### Active Nav Item (Credit History)
```css
.nav-item-active {
  background: linear-gradient(163deg, rgba(215, 237, 237, 0.16) 47.79%, rgba(204, 235, 235, 0) 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  height: 48px;
  padding: 14px 16px;
}

.nav-item-active span {
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 600;
  font-family: 'Manrope', sans-serif;
}
```

### Coming Soon Badge
```css
.badge-coming-soon {
  background: linear-gradient(90deg, rgba(90, 241, 251, 0.5) 0%, rgba(1, 212, 225, 0.5) 100%);
  border: 0.5px solid #1CF1FF;
  border-radius: 40px;
  padding: 0 10px;
}

.badge-coming-soon span {
  color: #FFFFFF;
  font-size: 8px;
  font-family: 'Inter', sans-serif;
  line-height: 18px;
}
```

---

## Implementation Notes

### Data Structure
```typescript
interface CreditTransaction {
  id: string;
  date: string;           // Format: "23/08/24"
  reason: string;         // e.g., "Refund of risky emails"
  change: number;         // Positive or negative
  balance: number;        // Balance after transaction
}
```

### Possible Transaction Types
Based on the design:
- **Refund of risky emails** - Credits refunded for emails marked as risky
- **Credit purchase** - Credits added via purchase
- **Verification usage** - Credits deducted for verification
- **Subscription renewal** - Monthly/annual credit allocation

### Sorting & Filtering
- Default sort: Most recent first (by date)
- Search functionality for filtering transactions
- Consider adding date range filter

### Pagination
- Not shown in design, but consider infinite scroll or pagination for long histories

---

## Assets

### Screenshots
- `screenshots/01-credit-history.png`

### Icons Needed
- Search icon (magnifying glass)
- Plus icon (for Add More button)
- Add card icon (Credit History nav icon)
- Credit card icon (Credit History alt nav icon)
