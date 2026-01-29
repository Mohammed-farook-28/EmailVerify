# Profile Settings Page

## Route
`/home/profile`

## Page Title
Profile Settings

## Overview
The Profile Settings page allows users to manage their account information including profile picture, name, language preferences, email address, password, and account deletion.

---

## Layout Structure

### Header
- **Logo**: EmailVerify logo (links to /home)
- **Notification Bell**: Opens notification dropdown dialog
- **User Profile Menu**: Dropdown in sidebar footer

### Sidebar Navigation
Standard sidebar navigation (see Dashboard documentation)

### Breadcrumb
Dashboard > Profile

---

## Main Content Sections

### 1. Profile Picture Section
- **Title**: "Your Profile Picture" (h3)
- **Description**: "Please choose a photo to upload as your profile picture."
- **Avatar Display**: Shows current avatar with user initial (e.g., "P")
- **Upload Area**:
  - **Label**: "Upload a Profile Picture"
  - **Description**: "Choose a photo to upload as your profile picture."
  - **Interaction**: Click to upload or drag and drop

---

### 2. Your Name Section
- **Title**: "Your Name" (h3)
- **Description**: "Update your name to be displayed on your profile"
- **Form Fields**:
  - **Label**: "Your Name"
  - **Input**: Text field (pre-filled with current name)
- **Action**: "Update Profile" button

---

### 3. Language Section
- **Title**: "Language" (h3)
- **Description**: "Choose your preferred language"
- **Dropdown**: Language selector

#### Available Languages
| Flag | Language |
|------|----------|
| 🇺🇸 | English |
| 🇨🇳 | 简体中文 (Simplified Chinese) |
| 🇭🇰 | 繁體中文 (Traditional Chinese) |
| 🇪🇸 | Español |
| 🇯🇵 | 日本語 (Japanese) |
| 🇫🇷 | Français |
| 🇩🇪 | Deutsch |
| 🇮🇹 | Italiano |
| 🇵🇱 | Polski |
| 🇮🇳 | हिंदी (Hindi) |
| 🇲🇾 | Melayu |
| 🇵🇹 | Português |
| 🇮🇩 | Indonesia |
| 🇷🇺 | Русский (Russian) |
| 🇰🇷 | 한국어 (Korean) |
| 🇳🇱 | Nederlands |

---

### 4. Update Email Section
- **Title**: "Update your Email" (h3)
- **Description**: "Update your email address you use to login to your account"
- **Form Fields**:
  - **Label**: "Your New Email"
  - **Input**: Email field (required)
  - **Label**: "Repeat Email"
  - **Input**: Email confirmation field (required)
- **Action**: "Update Email Address" button

---

### 5. Update Password Section
- **Title**: "Update Password" (h3)
- **Description**: "Change your account password"
- **Form Fields**:
  - **Label**: "Current Password"
  - **Input**: Password field (required)
  - **Label**: "New Password"
  - **Input**: Password field (required)
  - **Helper Text**: "Ensure it's at least 8 characters"
  - **Label**: "Repeat New Password"
  - **Input**: Password confirmation field (required)
  - **Helper Text**: "Please repeat your new password to confirm it"
- **Action**: "Update Password" button

#### Password Requirements
- Minimum 8 characters

---

### 6. Danger Zone Section
- **Title**: "Danger Zone" (h3)
- **Description**: "Some actions cannot be undone. Please be careful."
- **Visual Style**: Highlighted/warning styling to indicate destructive actions

#### Delete Account
- **Label**: "Delete your Account"
- **Warning**: "This will delete your account and the accounts you own. Furthermore, we will immediately cancel any active subscriptions. This action cannot be undone."
- **Action**: "Delete your Account" button (opens confirmation dialog)

---

## Interactive Elements

### Profile Picture Upload
- Click to open file picker
- Supports image file types (PNG, JPG, etc.)
- Preview updates after upload

### Language Selector
- Dropdown with flag icons
- Changes interface language immediately on selection

### Form Validation
- Email fields must match
- Password fields must match
- New password minimum 8 characters
- Required fields indicated

### Delete Account Dialog
- **Type**: Alert dialog (confirmation)
- **Title**: "Delete your Account"
- **Message**: "We must verify your identity to continue with this action. We'll send a verification code to the email address [user@email.com]."
- **Buttons**:
  - Cancel (secondary)
  - Send Verification Code (primary)
  - Close (X icon)

#### Delete Account Flow
1. User clicks "Delete your Account" button
2. Confirmation dialog appears with email verification requirement
3. User clicks "Send Verification Code"
4. Verification code sent to user's email
5. User enters verification code
6. Account is deleted upon successful verification

---

## Form Behavior

| Form | Fields | Validation | Action |
|------|--------|------------|--------|
| Name | Name | Required | Update Profile |
| Email | New Email, Repeat Email | Required, Must match | Update Email Address |
| Password | Current, New, Repeat New | Required, Min 8 chars, Must match | Update Password |

---

## Security Considerations
- Current password required for password change
- Email confirmation required for email change
- Account deletion requires additional confirmation
- All sensitive actions are logged

---

## Related Pages
- Dashboard: /home
- Billing: /home/billing
- Usage: /home/usage
