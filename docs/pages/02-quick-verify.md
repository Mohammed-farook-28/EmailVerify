# Quick Verify Page

## Route
`/home/quick-verify`

## Page Title
EmailVerify - Professional Email Verification Service

## Breadcrumb
Dashboard > Quick Verify

## Overview
The Quick Verify page allows users to verify individual email addresses in real-time. It provides instant verification results with detailed information about email validity, risk level, and other metrics.

---

## Page Header

### Title
**Quick Verify**

### Description
"Enter an email address and the system will automatically verify its validity, risk level and other detailed information."

---

## Layout Structure

Two-column layout:
- **Left Column**: Email verification form
- **Right Column**: Verification results display

---

## Left Column: Email Verification Form

### Section Title
**Email Verification**

### Form Elements

#### Email Input Field
- **Type**: Text input
- **Placeholder**: "Please enter the email address to verify"
- **Required**: Yes
- **Validation**: Email format expected

#### Submit Button
- **Label**: "Verify Now"
- **Style**: Black background, white text, full-width
- **Action**: Triggers email verification process

### Feature Highlights
Listed below the form with icons:

1. **Green checkmark icon**
   - "No API Key configuration required, ready to use"

2. **Green checkmark icon**
   - "Supports syntax, domain, network level detection"

3. **Orange/yellow info icon**
   - "Each verification consumes 1 credit"

---

## Right Column: Verification Results

### Empty State
- **Icon**: Mail/envelope icon (gray)
- **Message**: "Enter an email on the left to start verification"

### Results Display (When Verification Complete)
*Expected fields based on the service description:*

- **Email Address**: The verified email
- **Validity Status**: Valid/Invalid/Unknown
- **Risk Level**: Low/Medium/High
- **Syntax Check**: Pass/Fail
- **Domain Check**: Pass/Fail
- **Network Level Detection**: Results

---

## Verification Process

### Credit Usage
- Each single email verification consumes **1 credit**

### Verification Checks Performed
1. **Syntax Level**: Email format validation
2. **Domain Level**: Domain existence and MX records
3. **Network Level**: SMTP verification and deliverability

### No API Key Required
- This feature works directly in the dashboard
- Users don't need to configure API keys for quick verification

---

## User Flow

1. User navigates to Quick Verify page
2. Enters email address in the input field
3. Clicks "Verify Now" button
4. System processes verification (consumes 1 credit)
5. Results appear in the right column

---

## Empty States

### No Email Entered
- Right panel shows: "Enter an email on the left to start verification"
- Mail icon displayed

### No Credits
*Expected behavior:*
- User may see an error or prompt to purchase credits
- Verification button may be disabled

---

## Related Pages
- Bulk Verify: /home/bulk-verify (for batch verification)
- API Keys: /home/api-keys (for programmatic access)
- Billing: /home/billing (to purchase credits)
- Usage: /home/usage (to view verification history)

---

## Technical Details

### Endpoint (Internal)
Quick Verify likely calls an internal API endpoint for single email verification.

### Response Time
Real-time verification with instant results display.

### Credit Deduction
Automatic deduction of 1 credit per successful verification request.
