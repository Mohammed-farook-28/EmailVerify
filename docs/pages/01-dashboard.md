# Dashboard Page

## Route
`/home`

## Page Title
Dashboard

## Overview
The main dashboard provides an overview of the user's email verification account, displaying key metrics and analytics at a glance.

---

## Layout Structure

### Header
- **Logo**: EmailVerify logo (links to /home)
- **Notification Bell**: Opens notification dropdown dialog
  - Shows "No notifications" when empty
- **User Profile Menu**: Dropdown in sidebar footer

### Sidebar Navigation
Located on the left side with collapsible toggle button.

#### Navigation Groups:
1. **Dashboard** (link to /home)

2. **Email Verification**
   - Quick Verify (/home/quick-verify)
   - Bulk Verify (/home/bulk-verify)
   - History (/home/history)
   - API Keys (/home/api-keys)

3. **Billing**
   - Usage (/home/usage)
   - Billing (/home/billing)

4. **Account**
   - Profile (/home/profile)

#### Sidebar Footer
- User avatar with initial "P"
- Username: "prabhakaran"
- Email: "prabhakaran@xquare.vc"
- Expandable profile menu

### Breadcrumb
Shows current location: "Dashboard"

---

## Main Content Sections

### 1. Daily Login Bonus Banner (Conditional)
**Status**: Not visible during testing - may be removed or shown only under specific conditions.

*Expected structure (if present):*
- **Title**: "Daily Login Bonus Available!"
- **Description**: "Claim your free 100 credits for logging in today"
- **Actions**:
  - "Claim Now" button
  - "Close" button (X)

### 2. Stats Cards Row (3 Cards)

#### Card 1: Credit Balance
- **Icon**: Credit card icon
- **Title**: "Credit Balance"
- **Value**: Number (e.g., "0")
- **Description**: "Available credits in your account"
- **Action**: "View Details" link → /home/billing

#### Card 2: Total Verifications
- **Icon**: Checkmark icon
- **Title**: "Total Verifications"
- **Value**: Number (e.g., "0")
- **Description**: "Total emails verified"
- **Action**: "View Details" link → /home/usage

#### Card 3: API Calls
- **Icon**: API/code icon
- **Title**: "API Calls"
- **Value**: Number (e.g., "0")
- **Description**: "API calls made from your account"
- **Action**: "View Details" link → /home/usage?method=api

### 3. Email Validity Distribution Chart
- **Type**: Donut chart with center percentage
- **Title**: "Email Validity Distribution"
- **Center Display**: "X.X% Valid" (percentage of valid emails)
- **Empty State**:
  - Message: "No data available"
  - Subtext: "Start verifying emails to see the distribution"
- **Data Categories** (clickable buttons showing percentage and count):
  - Invalid (e.g., "50.0% Invalid 2")
  - Valid (e.g., "25.0% Valid 1")
  - Role (e.g., "25.0% Role 1")
  - Unknown (e.g., "0.0% Unknown 0")
  - Risky (e.g., "0.0% Risky 0")
  - Disposable (e.g., "0.0% Disposable 0")
  - Catchall (e.g., "0.0% Catchall 0")

### 4. Verification Trend Chart
- **Type**: Line chart
- **Title**: "Verification Trend"
- **Time Range Selector** (Dropdown - Verified):
  - 7 Days (default, selected)
  - 30 Days
  - 90 Days
- **Action Link**: "Usage History" → /home/usage
- **Chart Legend**:
  - Total (blue/teal)
  - Valid (green)
  - Invalid (red)
  - Unknown (gray)
- **X-Axis**: Date labels (e.g., 01/18, 01/19, etc.)
- **Y-Axis**: Count values (0, 1, 2, 3, 4, etc.)

---

## Interactive Elements

### Profile Menu (Bottom Left)
Accessible by clicking on user profile in sidebar footer.

**Menu Items**:
1. **Signed in as**: Displays email (prabhakaran@xquare.vc)
2. **Dashboard**: Link to dashboard
3. **Documentation**: Link to documentation (external)
4. **Theme**: Expandable submenu
   - Light
   - Dark
   - System
5. **Sign out**: Button to log out

### Notification Dialog
- Triggered by bell icon in header
- Modal/dialog overlay
- Shows notification list or "No notifications" empty state

### Sidebar Toggle
- Button to collapse/expand sidebar
- Labeled "Toggle Sidebar"

---

## Data Displayed
| Metric | Description | Link |
|--------|-------------|------|
| Credit Balance | Available verification credits | /home/billing |
| Total Verifications | Count of all verified emails | /home/usage |
| API Calls | Count of API-based verifications | /home/usage?method=api |

---

## Charts Data Structure

### Email Validity Distribution
```
Categories: Valid, Invalid, Unknown
Values: Count/percentage for each category
```

### Verification Trend
```
Time Range: 7/30/90 days
Series:
  - Total: Combined count
  - Valid: Valid email count
  - Invalid: Invalid email count
  - Unknown: Unknown status count
X-Axis: Date
Y-Axis: Count
```

---

## Empty States
- **Email Validity Distribution**: "No data available - Start verifying emails to see the distribution"
- **Verification Trend**: Shows flat line at 0 when no data

---

## Responsive Behavior
- Sidebar is collapsible via toggle button
- Content adjusts to available space

---

## Related Pages
- Billing Details: /home/billing
- Usage History: /home/usage
- API Usage: /home/usage?method=api
