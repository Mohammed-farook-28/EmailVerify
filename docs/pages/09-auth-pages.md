# Authentication Pages

## Overview
Authentication pages handle user sign-in, sign-up, and password recovery flows.

---

## Sign In Page

### Route
`/auth/sign-in`

### Page Title
Sign In | Free Email Checker & Email Verification

### Form Structure
- **Logo**: EmailVerify icon
- **Title**: "Sign In" (h1)
- **Subtitle**: "Sign in to get free email checker & email verification."
- **Last Sign-in Indicator**: "You last signed in with [method]" (e.g., "email and password")

### Form Fields
| Field | Type | Required | Placeholder |
|-------|------|----------|-------------|
| Email Address | text | Yes | Email Address |
| Password | password | Yes | Password |

### Actions
- **Primary Button**: "Sign in with Email"
- **Forgot Password Link**: "Password forgotten?" → /auth/password-reset
- **Divider**: "OR CONTINUE WITH"
- **OAuth Button**: "Sign in with Google" (with Google logo)
- **Sign Up Link**: "Do not have an account yet?" → /auth/sign-up

---

## Sign Up Page

### Route
`/auth/sign-up`

### Page Title
Sign Up | Free Email Checker & Email Verification

### Form Structure
- **Logo**: EmailVerify icon
- **Title**: "Sign Up" (h1)
- **Subtitle**: "Sign up to get free email checker & email verification."

### Form Fields
| Field | Type | Required | Helper Text |
|-------|------|----------|-------------|
| Email Address | email | Yes | - |
| Password | password | Yes | - |
| Repeat password | password | Yes | "Type your password again" |

### Checkbox
- **Label**: "I accept the Terms of Service and Privacy Policy"
- **Links**: Terms of Service (/terms), Privacy Policy (/privacy)

### Actions
- **Primary Button**: "Sign up with Email"
- **Divider**: "OR CONTINUE WITH"
- **OAuth Button**: "Sign in with Google" (with Google logo)
- **Sign In Link**: "Already have an account?" → /auth/sign-in

---

## Password Reset Page

### Route
`/auth/password-reset`

### Page Title
Reset Password

### Form Structure
- **Logo**: EmailVerify icon
- **Title**: "Reset Password" (h1)
- **Subtitle**: "Enter your email address below. You will receive a link to reset your password."

### Form Fields
| Field | Type | Required |
|-------|------|----------|
| Email Address | email | Yes |

### Actions
- **Primary Button**: "Reset Password"
- **Sign In Link**: "Password recovered?" → /auth/sign-in

---

## Common Elements (All Auth Pages)

### Header
- Promo banner: "🎉 Launch Offer: up to 97.2% OFF credits." with "See Plans" link
- Logo (links to /)
- Navigation dropdowns (Product, Free Tools, AI Guides)
- Language selector
- Sign In / Sign Up buttons

### Footer
- Standard site footer with all category links
- Social/extension links (Chrome, Firefox, GitHub, Product Hunt)

---

## URL Parameters

### Sign Up Page
| Parameter | Description | Example |
|-----------|-------------|---------|
| plan | Pre-selected pricing plan | ?plan=starter |
| type | Billing cycle | ?type=monthly or ?type=yearly |

### Sign In Page
| Parameter | Description | Example |
|-----------|-------------|---------|
| next | Redirect after login | ?next=/home |

---

## Related Pages
- Dashboard: /home (after successful auth)
- Pricing: /pricing (plan selection)
- Terms: /terms
- Privacy: /privacy
