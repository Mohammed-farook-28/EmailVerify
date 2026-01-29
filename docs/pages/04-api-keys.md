# API Keys Page

## Route
`/home/api-keys`

## Page Title
EmailVerify - Professional Email Verification Service

## Breadcrumb
Dashboard > API Keys

## Overview
The API Keys page allows users to manage their API keys for programmatic access to the email verification service. Users can create, view, and manage multiple API keys with different expiration settings.

---

## Page Header

### Title
**API Keys** (with key icon)

### Action Button
- **Label**: "Create API Key"
- **Style**: Black background, white text
- **Position**: Top right
- **Action**: Opens Create API Key dialog

---

## Main Content

### Empty State (No API Keys)
When no API keys exist:
- **Icon**: Key icon (gray)
- **Title**: "No API Keys yet"
- **Message**: "Create your first API key to start using the API"

### API Keys List (When Keys Exist)
Table with the following columns:

| Column | Description | Example |
|--------|-------------|---------|
| Name | User-defined name | Test Key |
| API Key ID | Masked key ID | 6c92d00c...7eeef803a981 |
| Status | Active or Expired | Active |
| Expires At | Expiration date/time | 2027-01-29 16:35 |
| Created At | Creation date/time | 2026-01-29 16:35 |
| Last Used | Last usage timestamp | - (if never used) |
| Actions | Delete button | Delete (opens dialog) |

---

## Create API Key Dialog

### Dialog Title
"Create API Key"

### Form Fields

#### Name
- **Type**: Text input
- **Placeholder**: "Enter key name"
- **Required**: Yes
- **Purpose**: Descriptive name for the API key

#### Expiration
- **Type**: Dropdown/Select
- **Default Value**: "1 Year"
- **Options**:
  | Option | Description |
  |--------|-------------|
  | 1 Year | Expires in 12 months |
  | 6 Months | Expires in 6 months |
  | 3 Months | Expires in 3 months |
  | 1 Month | Expires in 1 month |
  | Never | No expiration |

### Dialog Actions
| Button | Style | Action |
|--------|-------|--------|
| Create | Black, primary | Creates the API key |
| Cancel | White, secondary | Closes dialog without saving |
| Close (X) | Icon button | Closes dialog |

### Key Created Dialog (After Creation)
After clicking Create, the dialog transforms to show the new key:

- **Label**: "Plaintext Key (shown only once)"
- **Key Display**: Full key value (e.g., `sk_Ue7HpvL9GPaakY3LIn8V4fFzR9C47JIR`)
- **Copy Button**: Copies key to clipboard
- **Warning**: "Please save this key securely. You will not be able to view it again after closing this dialog. If lost, please reset the key."
- **Close Button**: Closes dialog and returns to key list

---

## User Flow

### Creating an API Key
1. User clicks "Create API Key" button
2. Dialog opens with form fields
3. User enters a descriptive name
4. User selects expiration period
5. User clicks "Create"
6. System generates API key
7. *Expected: Key is displayed for user to copy (shown only once)*
8. Key appears in the list

### Managing API Keys
*Expected functionality:*
- Copy key to clipboard
- Delete key (with confirmation)
- View key details
- Regenerate key

---

## API Key Properties

| Property | Description |
|----------|-------------|
| Name | User-defined identifier |
| Key Value | Unique API key string (secret) |
| Created Date | When the key was generated |
| Expiration Date | When the key will expire |
| Status | Active or Expired |

---

## Security Considerations

### Key Display
- API keys are typically shown only once upon creation
- Users must copy the key immediately
- Masked display in list (e.g., `ev_****...****abc`)

### Key Expiration Options
- Configurable expiration periods
- "Never" option for permanent keys (use with caution)
- Expired keys cannot be used for API calls

---

## Empty States

### No API Keys
- Visual: Key icon
- Message: "No API Keys yet"
- Subtext: "Create your first API key to start using the API"
- CTA: "Create API Key" button available

---

## Related Pages
- Usage: /home/usage (view API call history)
- Documentation: External link to API docs

---

## API Key Format (Verified)
```
sk_Ue7HpvL9GPaakY3LIn8V4fFzR9C47JIR
```
- Prefix: `sk_`
- Key body: 32-character alphanumeric string

---

## Technical Integration

### API Endpoint Usage
Once created, API keys are used in the Authorization header:
```
Authorization: Bearer ev_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Rate Limits (Expected)
- API keys may have associated rate limits
- Limits based on subscription plan

---

## Actions Available (Verified)

| Action | Description |
|--------|-------------|
| Delete | Remove API key (opens confirmation dialog) |

### Delete API Key Dialog
- **Title**: "Delete API Key"
- **Warning**: "This action cannot be undone. Are you sure you want to delete this key?"
- **Buttons**:
  - Cancel (secondary)
  - Delete (destructive/primary)
  - Close (X icon)
