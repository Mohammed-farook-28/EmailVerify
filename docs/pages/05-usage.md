# Usage History Page

## Route
`/home/usage`

## Page Title
Usage History

## Overview
The Usage History page displays a comprehensive log of all email verification activities, allowing users to search, filter, and export their verification records.

---

## Layout Structure

### Header
- **Logo**: EmailVerify logo (links to /home)
- **Notification Bell**: Opens notification dropdown dialog
- **User Profile Menu**: Dropdown in sidebar footer

### Sidebar Navigation
Standard sidebar navigation (see Dashboard documentation)

### Breadcrumb
Dashboard > Usage

---

## Main Content Sections

### 1. Page Header
- **Title**: "Usage History" (h3)
- **Export Button**: Opens export dialog

### 2. Search & Filter Bar

#### Search Box
- **Placeholder**: "Search by email address..."
- **Type**: Text input
- **Function**: Filters results by email address

#### Status Filter Dropdown
- **Default**: "All statuses"
- **Options**:
  - All statuses
  - Valid
  - Invalid
  - Unknown
  - Risky
  - Disposable
  - Catch-all
  - Role

#### Method Filter Dropdown
- **Default**: "All methods"
- **Options**:
  - All methods
  - Web
  - API

#### Active Filters Section
- **Label**: "Active filters:"
- **Action**: "Clear all" button to reset filters

### 3. Usage History Table
Displays verification records with the following expected columns:
- Email address
- Verification status
- Method (Web/API)
- Timestamp
- Additional details

---

## Interactive Elements

### Export Dialog
- **Title**: "Export Verification History"
- **Description**: "Choose how many records to export (maximum 100 records)"
- **Options** (Radio buttons):
  1. Export current page (X records)
  2. Export all data (up to 100 records)
  3. Export custom range
- **Note**: "Current filter () will be applied"
- **Buttons**:
  - Cancel
  - Export
  - Close (X)

---

## Empty States

### No History Records
- **Message**: "No history records yet"
- **Subtext**: "Start verifying emails and your history will appear here"

---

## Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| method | Filter by verification method | `/home/usage?method=api` |

---

## Data Displayed

| Column | Description |
|--------|-------------|
| Email | The verified email address |
| Status | Verification result (Valid, Invalid, Unknown, Risky, Disposable, Catch-all, Role) |
| Method | How verification was performed (Web, API) |
| Date/Time | When verification occurred |

---

## Filter Behavior
- Filters can be combined (status + method + search)
- Active filters are displayed as tags
- "Clear all" resets all filters to default
- Filters persist during session
- Export respects current filter settings

---

## Related Pages
- Dashboard: /home
- Billing: /home/billing
- API Keys: /home/api-keys
