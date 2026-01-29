# Billing Page

## Route
`/home/billing`

## Page Title
Billing

## Overview
The Billing page manages user subscription status, credit balance, and provides options for purchasing credits or subscribing to plans.

---

## Layout Structure

### Header
- **Logo**: EmailVerify logo (links to /home)
- **Notification Bell**: Opens notification dropdown dialog
- **User Profile Menu**: Dropdown in sidebar footer

### Sidebar Navigation
Standard sidebar navigation (see Dashboard documentation)

### Breadcrumb
Dashboard > Billing

---

## Main Content Sections

### 1. Stats Cards Row (3 Cards)

#### Card 1: Subscription Status
- **Title**: "Subscription Status" (h3)
- **Value**: Plan name or "No Subscription"
- **Description**: "Your current plan"
- **Action**: "Change Plan" button

#### Card 2: Current Balance
- **Title**: "Current Balance" (h3)
- **Value**: Number (e.g., "100")
- **Description**: "Available credits"
- **Action**: "Add Credits" link → /home/billing#purchase

#### Card 3: Total Consumption
- **Title**: "Total Consumption" (h3)
- **Value**: Number (e.g., "0")
- **Description**: "Credits used all time"
- **Action**: "View Usage" link → /home/usage

---

### 2. One-Time Purchase Section
- **Title**: "One-Time Purchase"

#### Credit Packages
| Credits | Price | Savings |
|---------|-------|---------|
| 1,000 | $5 | - |
| 5,000 | $20 | Save 20% |
| 10,000 | $35 | Save 30% |
| 20,000 | $60 | Save 40% |
| 50,000 | $75 | Save 70% |
| 100,000 | $100 | Save 80% |
| 200,000 | $150 | Save 85% |
| 500,000 | $200 | Save 92% |
| 1,000,000 | $350 | Save 93% (Best Value) |

---

### 3. Subscription Plans Section
- **Title**: "Subscription Plans"
- **Billing Toggle**: Monthly / Yearly (Save 50%)

#### Monthly Plans
| Plan | Credits/Month | Price/Month | Discount |
|------|---------------|-------------|----------|
| Titan | 1,000,000 | $280 | 94.4% OFF (Best Value) |
| Mega | 500,000 | $160 | 93.6% OFF |
| Ultimate | 200,000 | $120 | 88% OFF |
| Premium | 100,000 | $80 | 84% OFF |
| Enterprise | 50,000 | $60 | 76% OFF |
| Business | 20,000 | $48 | 52% OFF |
| Professional | 10,000 | $28 | 44% OFF |
| Popular | 5,000 | $16 | 36% OFF |
| Starter | 1,000 | $4 | 20% OFF |

#### Yearly Plans (Verified)
| Plan | Credits/Year | Price/Month | Price/Year | Original/Year | Discount |
|------|--------------|-------------|------------|---------------|----------|
| Titan | 12,000,000 | $140 | $1,680 | $3,360 | 97.2% OFF (Best Value) |
| Mega | 6,000,000 | $80 | $960 | $1,920 | 96.8% OFF |
| Ultimate | 2,400,000 | $60 | $720 | $1,440 | 94% OFF |
| Premium | 1,200,000 | $40 | $480 | $960 | 92% OFF |
| Enterprise | 600,000 | $30 | $360 | $720 | 88% OFF |
| Business | 240,000 | $24 | $288 | $576 | 76% OFF |
| Professional | 120,000 | $14 | $168 | $336 | 72% OFF |
| Popular | 60,000 | $8 | $96 | $192 | 68% OFF |
| Starter | 12,000 | $2 | $24 | $48 | 60% OFF |

---

### 4. Order Summary Panel
Displays dynamically based on selected package/plan.

#### For One-Time Purchase
- **Total Price**: Dollar amount
- **Per Credit Price**: Price per credit
- **Order Details**:
  - Credits count
  - Unit Price
  - Total Price
- **Action**: "Buy Now" button

#### For Subscription (Monthly)
- **Total Price**: Dollar amount / mo
- **Per Credit Price**: Price per credit
- **Order Details**:
  - Credits count
  - Unit Price
  - Total Price
- **Action**: "Buy Now" button

#### For Subscription (Yearly)
- **Total Price**: Dollar amount / yr
- **Per Credit Price**: Price per credit
- **Savings Badge**: "Save 50%"
- **Order Details**:
  - Annual Credits Total
  - Billing Cycle: Yearly
  - Total Price
- **Note**: "Automatically charged yearly"
- **Action**: "Buy Now" button

---

## Payment Information
- **Processor**: Stripe (secure payment processing)
- **Notes**:
  - No credit card required (for signup/trial)
  - Cancel subscription anytime

---

## Interactive Elements

### Billing Toggle
- **Monthly**: Shows monthly pricing
- **Yearly**: Shows yearly pricing with "Save 50%" badge

### Plan Selection
- Clicking a plan updates the Order Summary panel
- Selected plan is visually highlighted
- "Best Value" badge on top-tier plans

### Buy Now Button
- Initiates Stripe checkout process
- Disabled if no plan selected

---

## URL Anchors

| Anchor | Description |
|--------|-------------|
| #purchase | Scrolls to purchase section |

---

## Related Pages
- Dashboard: /home
- Usage History: /home/usage
- Profile: /home/profile
