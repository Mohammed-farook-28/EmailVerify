# History Page (Bulk Verification Jobs)

## Route
`/home/history`

## Page Title
History

## Breadcrumb
Dashboard > History

## Overview
The History page displays a log of all **bulk verification jobs**. Users can view job status, search by file name, filter by status, and access completed results. This is separate from the Usage page which tracks individual credit consumption.

---

## Layout Structure

### Header
- **Logo**: EmailVerify logo (links to /home)
- **Notification Bell**: Opens notification dropdown dialog
- **User Profile Menu**: Dropdown in sidebar footer

### Sidebar Navigation
Standard sidebar navigation (see Dashboard documentation)

### Breadcrumb
Dashboard > History

---

## Main Content Sections

### 1. Page Header
- **Title**: "History" (h3)
- **Back Link**: "Back to Bulk Verify" → /home/bulk-verify
- **Refresh Button**: Refreshes the job list

### 2. Search & Filter Bar

#### Search Box
- **Placeholder**: "Search by file name..."
- **Type**: Text input with search icon
- **Function**: Filters jobs by uploaded file name

#### Status Filter Dropdown
- **Default**: "All statuses"
- **Options**:
  | Status | Description |
  |--------|-------------|
  | All statuses | Show all jobs |
  | Pending | Job queued, not yet started |
  | Processing | Job currently running |
  | Completed | Job finished successfully |
  | Failed | Job encountered an error |

#### Active Filters Section
- **Label**: "Active filters:"
- **Display**: Shows "None" when no filters applied
- Shows filter tags when filters are active

### 3. Jobs Table (When Jobs Exist)

#### Expected Table Columns
| Column | Description |
|--------|-------------|
| File Name | Name of uploaded CSV/file |
| Status | Pending, Processing, Completed, Failed |
| Total Emails | Number of emails in the job |
| Progress | Processing progress (e.g., "45/100") |
| Created Date | When job was submitted |
| Completed Date | When job finished |
| Actions | Download results, View details |

#### Row Interactions
- Click to view job details
- Download results (for completed jobs)
- View progress (for processing jobs)

---

## Empty State

### No Verification Jobs
- **Title**: "No verification jobs yet."
- **Message**: "Start a bulk verification to see jobs here"
- **CTA Button**: "Start a Verification" → /home/bulk-verify

---

## Job Status Indicators

| Status | Visual | Description |
|--------|--------|-------------|
| Pending | Gray/Neutral | Job is queued |
| Processing | Blue/Animated | Job is running |
| Completed | Green | Job finished successfully |
| Failed | Red | Job encountered an error |

---

## Related Pages
- Bulk Verify: /home/bulk-verify (start new bulk jobs)
- Usage: /home/usage (credit consumption tracking)
- Quick Verify: /home/quick-verify (single email verification)

---

## Notes
- History shows **file upload bulk jobs only**, not Copy & Paste bulk verifications
- Copy & Paste bulk verifications are processed inline on the Bulk Verify page
- Individual verification records are in the **Usage** page (/home/usage)
- The Bulk Verify page has a "View History" link that navigates here
- Jobs may take time to process depending on list size
