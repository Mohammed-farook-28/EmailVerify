# Authentication Pages - Figma Design

## Figma Source
- **File**: Emailkit
- **File Key**: r2m4Md3beV9KoBbu3ICOR9

| Page | Node ID | URL |
|------|---------|-----|
| Sign In (Full) | 2001:16902 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-16902&m=dev) |
| Sign In (Card) | 2001:17131 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-17131&m=dev) |
| Email Verification | 2001:17227 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-17227&m=dev) |
| Sign Up | 2001:17267 | [Open](https://www.figma.com/design/r2m4Md3beV9KoBbu3ICOR9/Emailkit?node-id=2001-17267&m=dev) |

---

## Design System

### Color Palette
| Token | Hex | Usage |
|-------|-----|-------|
| Background Start | #262626 | Page gradient start |
| Background End | #1a1a1a | Page gradient end |
| Card Background | #333333 | Auth card |
| Input Background | #3b3b3b | Form inputs |
| Input Border | #4d4d4d | Input stroke |
| Button Border | #646161 | Outlined buttons |
| Checkbox Border | #666666 | Checkbox stroke |
| Primary Green | #4dc246 | Logo accent |
| Button Gradient Start | #5ace49 | Submit button top |
| Button Gradient End | #229a3c | Submit button bottom |
| Link Green | #18ff18 | "Sign Up" / "Sign In" links |
| Text Primary | #ededed | Headings, button text |
| Text Secondary | #828282 | Divider text |
| Text Muted | #a1a1a1 | Placeholder text |
| Text Footer | #808080 | Legal text |

### Typography
| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Logo "Email" | Gotham Ultra | 39.84px | Regular | #ededed |
| Logo "KIT" | Gotham Ultra | 39.84px | Regular | #4dc246 |
| Page Title | Manrope | 24.84px | Bold | #ededed |
| OAuth Button | Manrope | 13.84px | Bold | #ededed |
| Divider | Manrope | 11px | SemiBold | #828282 |
| Input Placeholder | Manrope | 10.185px | Regular | #a1a1a1 |
| Submit Button | Manrope | 11.813px | SemiBold | #ffffff |
| Links | Manrope | 10-11.5px | Regular | #ffffff |
| Link Accent | Manrope | 10-11.5px | SemiBold | #18ff18 |
| Footer | Helvetica Neue | 9.5px | Regular | #808080 |

### Shared Components

#### Input Field
```css
background: #3b3b3b;
border: 0.971px solid #4d4d4d (inset);
border-radius: 3.886px;
padding: 7.771px 7.771px;
font: Manrope Regular 10.185px;
color: #a1a1a1 (placeholder);
```

#### Outlined Button (OAuth/Secondary)
```css
background: transparent;
border: 0.971px solid #646161 (inset);
border-radius: 3.886px;
height: 36px;
font: Manrope Bold 13.84px;
color: #ededed;
```

#### Primary Button (Submit)
```css
background: linear-gradient(180deg, #5ace49 0%, #229a3c 100%);
border-radius: 4px;
padding: 10px 20px;
box-shadow:
  0px 0px 100px rgba(255,71,0,0.15),
  inset 0px -0.5px rgba(0,0,0,0.5),
  inset 0px 0.5px rgba(255,255,255,0.05);
font: Manrope SemiBold 11.813px;
color: #ffffff;
```

#### Divider
```css
/* Line */
background: #3b3b3b;
height: 1px;
width: 70px;

/* Text */
font: Manrope SemiBold 11px;
color: #828282;
text-transform: uppercase;
letter-spacing: 0.625px;
```

---

## Page Designs

### 1. Sign In Page

**Route**: `/auth/sign-in`

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│                    Email[KIT]                          │
│                                                        │
│    ┌────────────────────────────────────────────┐     │
│    │               Sign In                      │     │
│    │                                            │     │
│    │    ┌────────────────────────────────┐     │     │
│    │    │  G  Sign In Using Google       │     │     │
│    │    └────────────────────────────────┘     │     │
│    │                                            │     │
│    │    ────── OR SIGN IN THROUGH EMAIL ────── │     │
│    │                                            │     │
│    │    ┌────────────────────────────────┐     │     │
│    │    │  Email                         │     │     │
│    │    └────────────────────────────────┘     │     │
│    │    ┌────────────────────────────────┐     │     │
│    │    │  Password                      │     │     │
│    │    └────────────────────────────────┘     │     │
│    │                                            │     │
│    │    Reset Password ?                        │     │
│    │                                            │     │
│    │    ┌────────────────────────────────┐     │     │
│    │    │          Sign in               │     │     │  ← Green gradient
│    │    └────────────────────────────────┘     │     │
│    │                                            │     │
│    │    Don't have a account ? Sign Up          │     │
│    │                                            │     │
│    └────────────────────────────────────────────┘     │
│                                                        │
│    By signing in, you acknowledge and agree to our     │
│    Legal Terms and Privacy Policy.                     │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Form Fields**
| Field | Type | Placeholder | Validation |
|-------|------|-------------|------------|
| Email | email | "Email" | Required |
| Password | password | "Password" | Required |

**Actions**
| Element | Action |
|---------|--------|
| Sign In Using Google | OAuth redirect to Google |
| Reset Password ? | Navigate to `/auth/password-reset` |
| Sign in | Submit form |
| Sign Up | Navigate to `/auth/sign-up` |
| Legal Terms | Navigate to `/terms` |
| Privacy Policy | Navigate to `/privacy` |

---

### 2. Sign Up Page

**Route**: `/auth/sign-up`

```
┌────────────────────────────────────────────────────────┐
│    ┌────────────────────────────────────────────┐     │
│    │               Sign Up                      │     │
│    │                                            │     │
│    │    ┌────────────────────────────────┐     │     │
│    │    │  G  Sign Up Using Google       │     │     │
│    │    └────────────────────────────────┘     │     │
│    │                                            │     │
│    │    ────── OR SIGN UP THROUGH EMAIL ────── │     │
│    │                                            │     │
│    │    ┌───────────────┐ ┌───────────────┐    │     │
│    │    │  First Name   │ │  Last Name    │    │     │
│    │    └───────────────┘ └───────────────┘    │     │
│    │    ┌────────────────────────────────┐     │     │
│    │    │  Email                         │     │     │
│    │    └────────────────────────────────┘     │     │
│    │    ┌────────────────────────────────┐     │     │
│    │    │  Password                      │     │     │
│    │    └────────────────────────────────┘     │     │
│    │                                            │     │
│    │    [ ] I agree to Email Verify Terms of   │     │
│    │        Use and Privacy policy              │     │
│    │                                            │     │
│    │    ┌────────────────────────────────┐     │     │
│    │    │       Sign in with Google      │     │     │  ← Green gradient
│    │    └────────────────────────────────┘     │     │
│    │                                            │     │
│    │    Already have a account ? Sign In        │     │
│    │                                            │     │
│    └────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────┘
```

**Form Fields**
| Field | Type | Placeholder | Width | Validation |
|-------|------|-------------|-------|------------|
| First Name | text | "First Name" | 172px | Required |
| Last Name | text | "Last Name" | 172px | Required |
| Email | email | "Email" | 360px | Required |
| Password | password | "Password" | 360px | Required, min 8 chars |
| Terms | checkbox | - | 16px | Required |

**Checkbox Spec**
```css
background: #333;
border: 1px solid #666;
border-radius: 4px;
size: 16px × 16px;
```

**Actions**
| Element | Action |
|---------|--------|
| Sign Up Using Google | OAuth redirect to Google |
| Terms of Use | Navigate to `/terms` |
| Privacy policy | Navigate to `/privacy` |
| Sign in with Google | Submit form (note: label seems inconsistent) |
| Sign In | Navigate to `/auth/sign-in` |

---

### 3. Email Verification Page

**Route**: `/auth/verify-email` (assumed)

```
┌────────────────────────────────────────────────────────┐
│    ┌────────────────────────────────────────────┐     │
│    │                                            │     │
│    │         [Verification message area]        │     │
│    │                                            │     │
│    │                                            │     │
│    │                                            │     │
│    │    ┌────────────────────────────────┐     │     │
│    │    │    Change E-mail Address       │     │     │  ← Outlined
│    │    └────────────────────────────────┘     │     │
│    │    ┌────────────────────────────────┐     │     │
│    │    │   Resend Verification E-mail   │     │     │  ← Outlined
│    │    └────────────────────────────────┘     │     │
│    │                                            │     │
│    └────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────┘
```

**Actions**
| Element | Action |
|---------|--------|
| Change E-mail Address | Open email change form/modal |
| Resend Verification E-mail | Trigger verification email resend |

---

## Assets

### Screenshots
```
docs/figma/auth/screenshots/
├── sign-in-full.png       # Full sign-in page (2880×1520)
├── sign-in-card.png       # Sign-in card component (806×1034)
├── email-verification.png # Email verification screen (806×1034)
└── sign-up.png            # Sign-up page (806×1034)
```

### Icons (Implementation Assets)
```
docs/figma/auth/icons/
├── google.svg       # Google OAuth icon
└── input-clear.svg  # Input field clear/validation icon
```

### Figma URLs (expire in 7 days)
```
Google Icon: https://www.figma.com/api/mcp/asset/912e47c2-9d6d-4ac6-85fc-98983f52ddbd
Input Icon: https://www.figma.com/api/mcp/asset/63e3b9f9-a790-4f8e-8650-e867b5acfaac
```

---

## Implementation Notes

### Fonts Required
- **Gotham Ultra** - Logo only
- **Manrope** - Primary UI font (Regular, SemiBold, Bold)
- **Helvetica Neue** - Footer (Regular, Medium)

### Card Container
```css
background: #333;
border-radius: 7.771px;
border: 0.486px solid rgba(255,255,255,0.05) (inset);
box-shadow:
  0px 3.886px 7.771px rgba(0,0,0,0.09),
  0px 7.771px 15.542px rgba(0,0,0,0.09),
  0px 15.542px 31.085px rgba(0,0,0,0.12),
  0px 31.085px 62.169px rgba(0,0,0,0.15),
  0px 62.169px 124.339px rgba(0,0,0,0.18);
width: 403px;
```

### Background
```css
background: radial-gradient(
  ellipse at center,
  #262626 0%,
  #1a1a1a 100%
);
```

### Responsive Considerations
- Card has max-width constraint
- Name fields stack on mobile (First Name / Last Name)
- Buttons full-width within card

---

## Color Variables (CSS/Tokens)

```css
:root {
  /* Background */
  --bg-gradient-start: #262626;
  --bg-gradient-end: #1a1a1a;

  /* Card */
  --card-bg: #333333;
  --card-border: rgba(255,255,255,0.05);

  /* Inputs */
  --input-bg: #3b3b3b;
  --input-border: #4d4d4d;
  --input-placeholder: #a1a1a1;

  /* Buttons */
  --btn-outline-border: #646161;
  --btn-primary-start: #5ace49;
  --btn-primary-end: #229a3c;

  /* Text */
  --text-primary: #ededed;
  --text-secondary: #828282;
  --text-muted: #808080;

  /* Accent */
  --accent-green: #4dc246;
  --link-green: #18ff18;
}
```
