# Settings - Figma Design Specification

## Overview

The Settings section provides user account management, billing controls, and subscription management for the EmailVerify platform. It includes profile settings, SSO connections, billing information, data retention policies, credit purchases, and subscription management.

**Figma File**: [Emailkit](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit)

---

## Page Index

| # | Page Name | Node ID | Screenshot |
|---|-----------|---------|------------|
| 1 | Account Settings | 2001:20431 | [01-account-settings.png](screenshots/01-account-settings.png) |
| 2 | Billing - Empty State | 2001:20786 | [02-billing-empty.png](screenshots/02-billing-empty.png) |
| 3 | Buy Credits | 2001:22302 | [03-buy-credits.png](screenshots/03-buy-credits.png) |
| 4 | Pricing Plans | 2001:28532 | [04-pricing-plans.png](screenshots/04-pricing-plans.png) |
| 5 | Billing - Active Subscription | 2001:21291 | [05-billing-active.png](screenshots/05-billing-active.png) |
| 6 | Cancel Subscription Modal | 2001:21829 | [06-cancel-subscription-modal.png](screenshots/06-cancel-subscription-modal.png) |
| 7 | Plan Cancelled Modal | 2001:22267 | [07-plan-cancelled-modal.png](screenshots/07-plan-cancelled-modal.png) |
| 8 | Delete Account Modal | 2001:22048 | [08-delete-account-modal.png](screenshots/08-delete-account-modal.png) |
| 9 | Billing with Invoice | 2001:21482 | [09-billing-with-invoice.png](screenshots/09-billing-with-invoice.png) |

---

## Design System

### Color Palette

#### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| Background Primary | `#1A1A1A` | Main page background |
| Background Secondary | `#262626` | Radial gradient center |
| Sidebar Background | `#232121` to `#2D2B2B` | Gradient sidebar |
| Card Background | `#333333` | Content cards, modals |
| Card Dark | `#262624` | Inner card sections |
| Input Background | `#202020` | Form inputs |
| Input Background Alt | `#3B3B3B` | Dropdown backgrounds |
| Package Card | `#262624` | Credit package cards |
| Package Selected | `#34291C` | Selected package bg |
| Pricing Card | `#272725` | Plan cards |
| Card Inner | `#343433` | Card inner background |
| Secondary Button Bg | `#2B2825` | Back button background |
| Dark Button Bg | `#1D2024` | Enterprise CTA button |
| Input Alt | `#323230` | Secondary input fields |
| Credits Box | `#262624` | Credits display container |

#### Brand Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Primary Green | `#0DFF1D` | Logo accent, active text |
| Green Gradient Start | `#5ACE49` | CTA button gradient |
| Green Gradient End | `#229A3C` | CTA button gradient |
| Credits Progress | `#1EDF6B` | Progress bar fill |
| Stem Green | `#B6F09C` | Plan badge text |
| Support Link | `#5CFA61` | Support Team link |

#### Status Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Connected Badge | `#1EDF6B` | Google SSO connected |
| Connect Button | `#1EDF6B` | ReachInbox connect |
| Error/Danger | `#E03737` | Cancel, Delete buttons |
| Warning Icon Bg | `#F9DDBB` | Warning badge outer |
| Warning Icon Border | `#F4D496` | Warning badge outer border |
| Warning Icon Inner | `#FFE2C0` | Warning badge inner |
| Warning Icon Inner Border | `#FCF2E6` | Warning badge inner border |
| Annual Badge | `#FF520E` | Annual discount badge border |
| Annual Button Start | `#1EFF1A` | Annual toggle gradient start |
| Annual Button End | `#05FF6D` | Annual toggle gradient end |
| Progress Green | `#18FF18` | Active credits progress fill |
| Progress Track Green | `rgba(23,255,66,0.15)` | Progress track background |
| Progress Track Orange | `rgba(255,97,23,0.15)` | Alternative progress track |
| Support Link Orange | `#FAA85C` | Support Team link (delete modal) |

#### Text Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Text Primary | `#FFFFFF` | Headings, primary text |
| Text Secondary | `#E8E8E8` | Body text |
| Text Muted | `#C1C2C5` | Description text |
| Text Placeholder | `#A1A1A1` | Input placeholders |
| Text Disabled | `#686B6E` | Section headers |
| Text Label | `#C0C5C9` | Form labels |
| Feature Text | `#8A8E93` | Plan feature items |
| Price Secondary | `#BFBFBF` | Price suffix |
| Price Title | `#D9D9D9` | Plan titles |
| Strikethrough | `#C7C7C7` | Original price |
| Nav Text | `#C0C6C6` | Sidebar navigation items |
| Nav Active | `#E8E9E9` | Active sidebar item |
| Tab Inactive | `#E1E0E0` | Inactive tab text |
| Input Text Alt | `#9A9999` | Secondary input text |
| Credits Used | `#D4D4D4` | Credits count text |
| Credits Total | `#25B122` | Credits total highlight |
| Description | `#B3B3B3` | Description/help text |

#### Border Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Border Default | `#3B3B3B` | Input borders |
| Border Light | `#4A4846` | Button borders |
| Border Divider | `#26292D` | Section dividers |
| Border Card | `#4A5055` | Pricing cards |
| Border Selected | `#FF520E` | Selected package |
| Border Section | `#303333` | Plan section dividers |
| Border Tab | `#343A40` | Tab bar bottom border |
| Border Input Alt | `#4D4D4D` | Credits container border |
| Glass Stroke | `rgba(255,255,255,0.08)` | Subtle white borders |
| Inner Shadow | `rgba(255,255,255,0.05)` | Card inner shadow border |
| Checkbox Border | `#7F56D9` | Purple checkbox border |
| Checkbox Fill | `#F9F5FF` | Checkbox background |

### Gradients

| Name | Value | Usage |
|------|-------|-------|
| Page Background | `radial-gradient(ellipse at center, #262626 0%, #1A1A1A 100%)` | Main page background |
| Sidebar | `linear-gradient(180deg, #232121 0%, #2D2B2B 100%)` | Sidebar background |
| CTA Button | `linear-gradient(180deg, #5ACE49 0%, #229A3C 100%)` | Primary action buttons |
| Annual Toggle | `linear-gradient(180deg, #1EFF1A 0%, #05FF6D 110.87%)` | Annual pricing toggle |
| Buy Credits Button | `linear-gradient(258deg, #373534 0.81%, #3C3C3C 98.2%)` | Sidebar buy credits |
| User Card | `linear-gradient(152deg, rgba(215,237,237,0.07) 47.79%, rgba(204,235,235,0) 100%)` | User section footer |
| Credit Card Button | `linear-gradient(180deg, #3448B9 0%, #216A9F 100%)` | Blue action button |
| Toggle Track | `linear-gradient(181deg, #1F1F1F 12.78%, #858484 593.53%)` | Billing toggle track |

### Typography

#### Font Families
| Font | Usage |
|------|-------|
| GRIFTER Bold | Logo text |
| Manrope | All UI text |
| Open Sans | Mixed pricing text |

#### Text Styles
| Style | Size | Weight | Line Height |
|-------|------|--------|-------------|
| Logo | 19.84px | Bold | 16px |
| Page Title | 16px | Bold | 35px |
| Section Title | 16px | SemiBold | 1.55 |
| Plan Title | 24px | SemiBold | 1.55 |
| Plan Price | 32px | Bold | 1.55 |
| Modal Title | 24px | Bold | normal |
| Body Text | 14px | Regular/Medium | 1.55 |
| Body Semibold | 14px | SemiBold | 1.55 |
| Label | 14px | Medium | 1.55 |
| Small Text | 12px | Regular | 1.55 |
| Credits Amount | 12px | Bold | 1.55 |
| Feature Item | 14px | Regular | 1.5 |
| Section Header | 14px | SemiBold | 20px |
| Nav Item | 14px | Regular/Medium | 20px |
| User Name | 14px | SemiBold | 20px |
| Plan Badge | 11px | SemiBold | 20px |

### Shadows

#### Card Shadow (Modal)
```css
box-shadow:
  0px 3.886px 7.771px 0px rgba(0, 0, 0, 0.09),
  0px 7.771px 15.542px 0px rgba(0, 0, 0, 0.09),
  0px 15.542px 31.085px 0px rgba(0, 0, 0, 0.12),
  0px 31.085px 62.169px 0px rgba(0, 0, 0, 0.15),
  0px 62.169px 124.339px 0px rgba(0, 0, 0, 0.18);
```

#### Pricing Card Shadow
```css
box-shadow: 0px 4px 16px 0px rgba(0, 0, 0, 0.1);
```

#### Button Inset Shadow
```css
box-shadow:
  inset 0px -0.5px 0px 0px rgba(0, 0, 0, 0.5),
  inset 0px 0.5px 0px 0px rgba(255, 255, 255, 0.05);
```

#### Card Inset Border
```css
box-shadow: inset 0px 0px 0px 0.486px rgba(255, 255, 255, 0.05);
```

### Border Radius
| Element | Radius |
|---------|--------|
| Modal | 18.77px |
| Card Inner | 12px |
| Pricing Card | 8px |
| Button | 4px |
| Input | 4px |
| Toggle | 8px |
| Checkbox | 4px |
| User Avatar | 8px |
| Package Card | 4px |
| Sidebar | 20px |

---

## Pages

### 1. Account Settings
**Node ID**: `2001:20431`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-20431&m=dev)

#### Layout
```
+------------------------------------------------------------------+
|  [Sidebar]  |  Account Setting    Billing                        |
|             |  ─────────────────────────────                      |
|  Bulk Verify|                                                     |
|  Single Ver.|  +------------------------------------------------+ |
|  API        |  | Profile                                        | |
|             |  |                                                 | |
|  ─────────  |  | First Name          Last Name                  | |
|  GENERAL    |  | [Aman          ]    [Sinha           ]         | |
|  Help Desk  |  |                                                 | |
|  Buy Credits|  | Email                                           | |
|             |  | [aman@outbox.vc                    ]            | |
|  ─────────  |  |                                     [Save]      | |
|  [User]     |  +------------------------------------------------+ |
|  Aman Sinha |                                                     |
|  Basic Plan |  +------------------------------------------------+ |
|             |  | Single Sign On                                  | |
|             |  |                                                 | |
|             |  | G Sign In Using Google      [Connected]        | |
|             |  |                                                 | |
|             |  | M Sign In Using Reachinbox  [100 Credits Free] | |
|             |  |                             [Connect]          | |
|             |  +------------------------------------------------+ |
|             |                                                     |
|             |  +------------------------------------------------+ |
|             |  | Billing Information                            | |
|             |  |                                                 | |
|             |  | Address Line 1        Address Line 2           | |
|             |  | [                ]    [                ]       | |
|             |  |                                                 | |
|             |  | City                  Country                   | |
|             |  | [                ]    [                ]       | |
|             |  |                                                 | |
|             |  | State/Region          Postal Code               | |
|             |  | [                ]    [                ]       | |
|             |  |                                     [Save]      | |
|             |  +------------------------------------------------+ |
|             |                                                     |
|             |  +------------------------------------------------+ |
|             |  | Data Retention                                  | |
|             |  |                                                 | |
|             |  | Your account's data will automatically be...   | |
|             |  |                                                 | |
|             |  | API Single Verification  API Batch Verification| |
|             |  | [7 days         v]    [30 days        v]       | |
|             |  |                                     [Save]      | |
|             |  +------------------------------------------------+ |
+------------------------------------------------------------------+
```

#### Components

##### Tab Navigation
- **Tabs**: "Account Setting" | "Billing"
- **Active Tab**: Green underline (#0DFF1D), 2px thick
- **Active Text**: Green (#0DFF1D)
- **Inactive Text**: Gray (#A0A0A0)

##### Profile Section
- **Card**: Dark background (#333333), rounded corners (12px)
- **Title**: "Profile" - 16px Bold white
- **Fields**: 2-column layout
  - First Name / Last Name (row 1)
  - Email (full width, row 2)
- **Input Style**:
  - Background: #202020
  - Border: 1px solid #343434
  - Border Radius: 4px
  - Padding: 12px 16px
  - Text: #FFFFFF, 14px Manrope
  - Placeholder: #686B6E
- **Save Button**: Green gradient (#5ACE49 to #229A3C), right-aligned

##### Single Sign On Section
- **Google SSO Row**:
  - Google icon (24px)
  - Text: "Sign In Using Google"
  - Badge: "Connected" - Green bg (#1EDF6B), white text

- **ReachInbox SSO Row**:
  - ReachInbox icon (24px)
  - Text: "Sign In Using Reachinbox"
  - Badge: "100 Credits Free" - Blue bg (#3B82F6)
  - Button: "Connect" - Green bg (#1EDF6B)

##### Billing Information Section
- **Fields**: 2-column grid
  - Address Line 1 / Address Line 2
  - City / Country
  - State/Region / Postal Code
- **Same input styling as Profile**

##### Data Retention Section
- **Description**: Muted text explaining auto-deletion policy
- **Dropdowns**: 2-column layout
  - API Single Verification: Default "7 days"
  - API Batch Verification: Default "30 days"
- **Dropdown Options**: 7 days, 14 days, 30 days, 60 days, 90 days

---

### 2. Billing - Empty State
**Node ID**: `2001:20786`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-20786&m=dev)

#### Layout
```
+------------------------------------------------------------------+
|  [Sidebar]  |  Account Settings    Billing                       |
|             |                      ───────                        |
|             |                                                     |
|             |  +------------------------------------------------+ |
|             |  | Credits                                        | |
|             |  |                                                 | |
|             |  | Purchase credits on a recurring basis to       | |
|             |  | save money and have consistent billing.        | |
|             |  | You can use these credits with our Bulk,       | |
|             |  | Single, API, and Form products                 | |
|             |  |                                                 | |
|             |  | [Purchase Now]                                 | |
|             |  +------------------------------------------------+ |
+------------------------------------------------------------------+
```

#### Components

##### Credits Card (Empty State)
- **Title**: "Credits" - 16px Bold white
- **Description**: Multi-line text explaining credit benefits
- **CTA Button**: "Purchase Now"
  - Green gradient (#5ACE49 to #229A3C)
  - Border radius: 4px
  - Padding: 8px 20px

---

### 3. Buy Credits
**Node ID**: `2001:22302`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-22302&m=dev)

#### Layout
```
+------------------------------------------------------------------+
|  < Back                                                           |
|                                                                   |
|  +--------------------------------------------------------------+ |
|  | Buy Credits                                                  | |
|  |                                                              | |
|  | +--------------+  +---------------------------------------+  | |
|  | | Choose a     |  | Pay-as-You-Go  [====] Subscription   |  | |
|  | | Package      |  |                                       |  | |
|  | |              |  |              $290                      |  | |
|  | | [5000] [5000]|  |              $480 (strikethrough)     |  | |
|  | | [5000]       |  |                                       |  | |
|  | | [5000][5000*]|  |          cost per credit              |  | |
|  | | [5000]       |  |                                       |  | |
|  | | [5000] [5000]|  |  25,000 credits        $150.00        |  | |
|  | | [5000]       |  |  ──────────────────────────────       |  | |
|  | |              |  |  Total                 $150.00        |  | |
|  | | ──── OR ──── |  |  ──────────────────────────────       |  | |
|  | |              |  |                          [Next]       |  | |
|  | | [  25,000  ] |  |                                       |  | |
|  | +--------------+  +---------------------------------------+  | |
|  +--------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

#### Components

##### Back Navigation
- **Icon**: Chevron left (14px)
- **Text**: "Back" - 12px Medium #C2C2C2

##### Package Selection Grid
- **Title**: "Choose a Package"
- **Grid**: 3x3 credit package cards
- **Package Card**:
  - Size: 120px x ~60px
  - Background: #262624
  - Border: 1px solid #3B3B3B
  - Border Radius: 4px
  - Amount: 12px Bold white (e.g., "5000")
  - Label: 10px Regular white ("Credits")

##### Selected Package Card
- **Background**: #34291C
- **Border**: 1px solid #FF520E
- **Text Color**: #0DFF1D (green)
- **Checkbox**: Purple checkbox with white check mark

##### Custom Amount Input
- **Divider**: "OR Enter An Amount Of Credit"
- **Input Field**:
  - Background: #202020
  - Border: 1px solid #3B3B3B
  - Border Radius: 8px
  - Width: 145px
  - Text: 14px SemiBold centered

##### Payment Toggle
- **Options**: "Pay-as-You-Go" | "Subscription"
- **Toggle Switch**: Green when on (#1EDF6B)

##### Price Summary
- **Current Price**: $290 - 32px SemiBold white
- **Original Price**: $480 - 23px Regular strikethrough #C7C7C7
- **Label**: "cost per credit" - 12px Regular white
- **Line Items**: Credit count left, price right
- **Divider**: 1px line #3B3B3B
- **Total**: Bold text

##### Next Button
- **Background**: Green gradient (#5ACE49 to #229A3C)
- **Text**: "Next" - 11.813px SemiBold white
- **Border Radius**: 4px

---

### 4. Pricing Plans
**Node ID**: `2001:28532`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-28532&m=dev)

#### Layout
```
+------------------------------------------------------------------+
|  +----------------+  +----------------+  +----------------+       |
|  | Growth Plan    |  | Pro Plan       |  | Enterprise     |       |
|  |                |  |                |  |                |       |
|  | $99 / month    |  | $499 / month   |  | $999 / month   |       |
|  | ────────────── |  | ────────────── |  | ────────────── |       |
|  |                |  |                |  |                |       |
|  | Include        |  | Include        |  | Include        |       |
|  | [x] All Start..|  | [x] All Growth.|  | [x] All Pro... |       |
|  | [x] 50K Active.|  | [x] 500K Leads |  | [x] 1M Active..|       |
|  | [x] 250K Month.|  | [x] 2.5M Email.|  | [x] Unlimited..|       |
|  | [x] 500 AI Cr..|  | [x] 5000 AI Cr.|  | [x] Unlimited..|       |
|  | [x] 10 Worksp..|  | [x] Unlimited..|  | [x] 10K AI Cr..|       |
|  | [x] Webhooks.. |  | [x] API Access |  | [x] Unlimited..|       |
|  |                |  |                |  | [x] Dedicated..|       |
|  | [Upgrade Plan] |  | [Upgrade Plan] |  | [Book meeting] |       |
|  +----------------+  +----------------+  +----------------+       |
+------------------------------------------------------------------+
```

#### Plan Cards

##### Growth Plan - $99/month
**Features**:
- All Starter features
- 50,000 Active Leads
- 250,000 Monthly E-mails
- 500 AI E-mail Credits
- 10 Workspaces
- Webhooks and Integrations

**CTA**: "Upgrade Plan" - Green gradient button

##### Pro Plan - $499/month
**Features**:
- All Growth features
- 500,000 Leads
- 2.5 M E-mails Monthly
- 5000 AI E-mail Credits
- Unlimited Workspaces
- API Access

**CTA**: "Upgrade Plan" - Green gradient button

##### Enterprise Plan - $999/month
**Features**:
- All Pro Plan features
- 1 Million Active Leads
- Unlimited Warmup
- Unlimited Mailboxes
- 10,000 AI Credits
- Unlimited Emails
- Dedicated Account Manager

**CTA**: "Book a meeting" - Dark button (#1D2024)

#### Card Styling
- **Background**: #272725
- **Border**: 1px solid #4A5055
- **Border Radius**: 8px
- **Size**: 297px x 543px
- **Padding**: ~32px
- **Title**: 24px SemiBold #D9D9D9
- **Price**: 32px Bold #BFBFBF
- **Divider**: 1px solid #303333
- **Feature Checkbox**: Purple (#7F56D9) with white background
- **Feature Text**: 14px Regular #8A8E93, -0.28px tracking

---

### 5. Billing - Active Subscription
**Node ID**: `2001:21291`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-21291&m=dev)

#### Layout
```
+------------------------------------------------------------------+
|  [Sidebar]  |  Account Settings    Billings                      |
|             |                      ────────                       |
|             |                                                     |
|             |        [Monthly]  [Annual (50% off)]               |
|             |                                                     |
|             |  +------------------------------------------------+ |
|             |  | Credits                                        | |
|             |  |                                                 | |
|             |  | Current Subscription                           | |
|             |  | Valid Upto: 22-Nov-2023                        | |
|             |  |                                                 | |
|             |  | Active Credits                                 | |
|             |  | [████████████████░░░░░░░░░░░░░░░░░░░░]        | |
|             |  | 400 / 1,250                                    | |
|             |  |                                                 | |
|             |  | [Purchase More] [Delete Account] [Cancel Sub]  | |
|             |  +------------------------------------------------+ |
+------------------------------------------------------------------+
```

#### Components

##### Billing Toggle
- **Options**: "Monthly" | "Annual (50% off)"
- **Monthly**: Dark background (#333333)
- **Annual Badge**: Green background (#1EDF6B), "50% off" text

##### Credits Card (Active)
- **Title**: "Credits"
- **Subscription Info**:
  - "Current Subscription"
  - "Valid Upto: 22-Nov-2023"
- **Progress Section**:
  - Label: "Active Credits"
  - Progress Bar: Green fill (#1EDF6B), gray track (#3B3B3B)
  - Count: "400 / 1,250"

##### Action Buttons
- **Purchase More**: Green gradient button
- **Delete Account**: Outlined button (border #4A4846)
- **Cancel Subscription**: Outlined button (border #4A4846)

---

### 6. Cancel Subscription Modal
**Node ID**: `2001:21829`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-21829&m=dev)

#### Layout
```
+------------------------------------------+
|                                    [X]   |
|                                          |
|              [Sad Envelope Icon]         |
|                                          |
|    Are You Sure You Want to Cancel?      |
|                                          |
|    If you cancel your plan, all your     |
|    data will be deleted after your       |
|    current credits period ends.          |
|                                          |
|    Need assistance or facing issues?     |
|    Contact our Support Team—we're        |
|    here to help!                         |
|                                          |
|    [    Back    ] [Cancel Subscription]  |
+------------------------------------------+
```

#### Modal Styling
- **Background**: #333333
- **Border Radius**: 18.77px
- **Size**: 524px x 460px
- **Shadow**: Multi-layer shadow (see Design System)

#### Components

##### Illustration
- Sad envelope character with green/dark green colors
- Positioned centered at top

##### Content
- **Title**: "Are You Sure You Want to Cancel?"
  - 24px Bold white, centered
- **Body Text**: #C1C2C5, 14px SemiBold, centered
- **Support Link**: "Support Team" in green (#5CFA61)

##### Buttons
- **Back Button**:
  - Background: #2B2825
  - Border: 1px solid #4A4846
  - Width: 191px
  - Border Radius: 4px

- **Cancel Subscription Button**:
  - Background: #E03737 (red)
  - No border
  - Border Radius: 4px

---

### 7. Plan Cancelled Modal
**Node ID**: `2001:22267`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-22267&m=dev)

#### Layout
```
+------------------------------------------+
|                                    [X]   |
|                                          |
|         [Two Sad Characters Icon]        |
|                                          |
|    Your plan has been cancelled.         |
|                                          |
|    We're sorry to see you go! Your       |
|    account will remain active until      |
|    the end of your current billing       |
|    period.                               |
|                                          |
|    Can you take a minute to give us      |
|    your feedback? It'll help us improve. |
|                                          |
|           [Share feedback]               |
+------------------------------------------+
```

#### Components

##### Illustration
- Two sad green blob characters waving goodbye

##### Content
- **Title**: "Your plan has been cancelled."
  - 24px Bold white, centered
- **Body Text**: #C1C2C5, 14px SemiBold, centered

##### Feedback Button
- **Background**: Green gradient (#5ACE49 to #229A3C)
- **Text**: "Share feedback"
- **Full width within content area**

---

### 8. Delete Account Modal
**Node ID**: `2001:22048`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-22048&m=dev)

#### Layout
```
+------------------------------------------+
|                                    [X]   |
|                                          |
|              [Warning Icon]              |
|                                          |
|    Are You Sure You Want to Delete?      |
|                                          |
|    If you delete your account, all       |
|    your data will be deleted             |
|                                          |
|    Need assistance or facing issues?     |
|    Contact our Support Team—we're        |
|    here to help!                         |
|                                          |
|    [    Back    ]   [Delete Account]     |
+------------------------------------------+
```

#### Components

##### Warning Icon
- **Shape**: Rounded square with exclamation mark
- **Color**: Orange/amber (#FFA43A background tint)
- **Icon**: Exclamation mark in orange

##### Buttons
- **Back Button**: Same as Cancel modal
- **Delete Account Button**:
  - Background: #E03737 (red)
  - Text: "Delete Account"

---

### 9. Billing with Invoice
**Node ID**: `2001:21482`
**Figma URL**: [View in Figma](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-21482&m=dev)

#### Layout
```
+------------------------------------------------------------------+
|  [Sidebar]  |  Account Settings    Billings                      |
|             |                      ────────                       |
|             |                                                     |
|             |  +------------------------------------------------+ |
|             |  | Credits                                        | |
|             |  |                                                 | |
|             |  | Current Subscription                           | |
|             |  | Valid Upto: 22-Nov-2023                        | |
|             |  |                                                 | |
|             |  | Active Credits                                 | |
|             |  | [████████████████░░░░░░░░░░░░░░░░░░░░]        | |
|             |  | 400 / 1,250                                    | |
|             |  |                                                 | |
|             |  | [Purchase More] [Delete Account] [Cancel Sub]  | |
|             |  +------------------------------------------------+ |
|             |                                                     |
|             |  +------------------------------------------------+ |
|             |  | Invoice                                        | |
|             |  |                                                 | |
|             |  |              [Invoice Stack Icon]              | |
|             |  |                                                 | |
|             |  |    There are currently no current invoice      | |
|             |  |    history to display                          | |
|             |  +------------------------------------------------+ |
+------------------------------------------------------------------+
```

#### Invoice Section (Empty State)
- **Title**: "Invoice"
- **Icon**: Orange invoice/document stack icon
- **Message**: "There are currently no current invoice history to display"
- **Text**: Centered, muted color

---

## Component Specifications

### Form Input
```css
.form-input {
  background: #202020;
  border: 1px solid #343434;
  border-radius: 4px;
  padding: 12px 16px;
  font-family: 'Manrope', sans-serif;
  font-size: 14px;
  color: #FFFFFF;
}

.form-input::placeholder {
  color: #686B6E;
}

.form-input:focus {
  border-color: #5ACE49;
  outline: none;
}
```

### Primary Button (Green Gradient)
```css
.btn-primary {
  background: linear-gradient(180deg, #5ACE49 0%, #229A3C 100%);
  border: none;
  border-radius: 4px;
  padding: 8px 20px;
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  font-size: 11.813px;
  color: #FFFFFF;
  letter-spacing: 0.12px;
  box-shadow:
    inset 0px -0.5px 0px 0px rgba(0, 0, 0, 0.5),
    inset 0px 0.5px 0px 0px rgba(255, 255, 255, 0.05);
}
```

### Secondary Button (Outlined)
```css
.btn-secondary {
  background: #2B2825;
  border: 1px solid #4A4846;
  border-radius: 4px;
  padding: 13px 54px;
  font-family: 'Manrope', sans-serif;
  font-weight: 700;
  font-size: 14px;
  color: #FFFFFF;
}
```

### Danger Button
```css
.btn-danger {
  background: #E03737;
  border: none;
  border-radius: 4px;
  padding: 13px 54px;
  font-family: 'Manrope', sans-serif;
  font-weight: 700;
  font-size: 14px;
  color: #FFFFFF;
}
```

### Progress Bar
```css
.progress-bar {
  background: #3B3B3B;
  border-radius: 4px;
  height: 8px;
  width: 100%;
}

.progress-bar-fill {
  background: #1EDF6B;
  border-radius: 4px;
  height: 100%;
  transition: width 0.3s ease;
}
```

### Badge (Connected)
```css
.badge-connected {
  background: #1EDF6B;
  border-radius: 4px;
  padding: 4px 12px;
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  font-size: 12px;
  color: #FFFFFF;
}
```

### Package Card
```css
.package-card {
  background: #262624;
  border: 1px solid #3B3B3B;
  border-radius: 4px;
  padding: 9px 8px;
  width: 120px;
  text-align: center;
}

.package-card.selected {
  background: #34291C;
  border-color: #FF520E;
}

.package-card.selected .amount,
.package-card.selected .label {
  color: #0DFF1D;
}
```

### Pricing Card
```css
.pricing-card {
  background: #272725;
  border: 1px solid #4A5055;
  border-radius: 8px;
  padding: 27px 32px;
  width: 297px;
  height: 543px;
  box-shadow: 0px 4px 16px 0px rgba(0, 0, 0, 0.1);
}

.pricing-card-title {
  font-family: 'Manrope', sans-serif;
  font-weight: 600;
  font-size: 24px;
  color: #D9D9D9;
}

.pricing-card-price {
  font-family: 'Manrope', sans-serif;
  font-size: 32px;
  color: #BFBFBF;
}

.pricing-card-price .amount {
  font-weight: 700;
}

.pricing-card-price .period {
  font-weight: 400;
}
```

### Modal
```css
.modal {
  background: #333333;
  border-radius: 18.77px;
  box-shadow:
    0px 3.886px 7.771px 0px rgba(0, 0, 0, 0.09),
    0px 7.771px 15.542px 0px rgba(0, 0, 0, 0.09),
    0px 15.542px 31.085px 0px rgba(0, 0, 0, 0.12),
    0px 31.085px 62.169px 0px rgba(0, 0, 0, 0.15),
    0px 62.169px 124.339px 0px rgba(0, 0, 0, 0.18);
}

.modal::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0px 0px 0px 0.486px rgba(255, 255, 255, 0.05);
  pointer-events: none;
}
```

---

## Implementation Notes

### Navigation
- Settings is accessed via the cog icon in sidebar user section
- Two main tabs: "Account Settings" and "Billing"
- "Buy Credits" is accessed from sidebar or Billing tab CTA

### Data Flow
1. Account Settings saves user profile and billing information
2. SSO connections manage OAuth integrations
3. Data retention settings control automatic data deletion
4. Billing tab manages subscription and credit purchases
5. Modals confirm destructive actions (cancel, delete)

### Validation
- Email field should validate email format
- Postal code may need country-specific validation
- Credit amount input should only accept numbers
- Minimum/maximum credit purchase limits may apply

### Accessibility
- All form inputs need associated labels
- Color contrast meets WCAG AA for text
- Modal focus trap for keyboard navigation
- Progress bar needs ARIA attributes
- Destructive actions have confirmation modals

### Responsive Behavior
- Sidebar collapses on smaller screens
- Form fields stack vertically on mobile
- Pricing cards stack vertically on mobile
- Modals center and may reduce padding

---

## Assets

### Screenshots
- `screenshots/01-account-settings.png`
- `screenshots/02-billing-empty.png`
- `screenshots/03-buy-credits.png`
- `screenshots/04-pricing-plans.png`
- `screenshots/05-billing-active.png`
- `screenshots/06-cancel-subscription-modal.png`
- `screenshots/07-plan-cancelled-modal.png`
- `screenshots/08-delete-account-modal.png`
- `screenshots/09-billing-with-invoice.png`

### Icons Needed
- Google logo (SSO)
- ReachInbox logo (SSO)
- Chevron left (back navigation)
- Chevron down (dropdowns)
- Close/X (modal close)
- Check mark (checkboxes, feature lists)
- Cog/Settings (sidebar)
- Credit card (billing nav)
- Exclamation mark (warning)
- Invoice stack (empty state)
- Sad envelope character (cancel modal)
- Sad blob characters (cancelled modal)
