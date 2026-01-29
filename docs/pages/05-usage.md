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

#### Table Columns
| Column | Sortable | Description |
|--------|----------|-------------|
| Email Address | No | The verified email address |
| Verification Status | No | Result (Valid, Invalid, Unknown, Risky, Disposable, Catch-all, Role) |
| Verification Date | Yes | When verification occurred (clickable to sort) |
| API Key | No | Which API key was used (or "System Default Key" for web) |
| Verification Type | No | "Single Email" or "Bulk" |
| Usage Method | No | "Web" or "API" |
| Credits Cost | No | Number of credits consumed |
| Actions | - | Menu button with options |

#### Row Actions Menu
- **Export**: Export this single record

#### Sample Row Data
```
| test@gmail.com | Role Email | 2026-01-29 16:12 | System Default Key | Single Email | Web | 1 | [...] |
```

### 4. Pagination
- **Record Count**: "Showing X to Y of Z records"
- **Rows Per Page**: Dropdown (default: 20)
  - Options: 10, 20, 50, 100
- **Navigation**:
  - First page button (disabled when on first page)
  - Previous page button (disabled when on first page)
  - Page number buttons
  - Next page button (disabled when on last page)
  - Last page button (disabled when on last page)

---

## Interactive Elements

### Export Dialog
- **Title**: "Export Verification History"
- **Description**: "Choose how many records to export (maximum 100 records)"
- **Options** (Radio buttons):
  1. Export current page (X records) - default selected
  2. Export all data (up to 100 records)
  3. Export custom range
- **Note**: "Current filter () will be applied"
- **Buttons**:
  - Cancel
  - Export
  - Close (X)

#### Custom Range Fields (shown when "Export custom range" selected)
- **Start position**: Spinbutton (default: 1, min: 1)
- **End position**: Spinbutton (default: 100, max: 100, min: 1)
- **Helper text**: "Export records from position 1 to 100 (newest first)"

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
