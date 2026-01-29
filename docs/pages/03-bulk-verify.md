# Bulk Verify Page

## Route
`/home/bulk-verify`

## Page Title
Bulk Verify

## Breadcrumb
Dashboard > Bulk Verify

## Overview
The Bulk Verify page allows users to verify multiple email addresses at once, either by uploading a file or by pasting email addresses directly. This is ideal for cleaning email lists before marketing campaigns.

---

## Page Header

### Title
**Bulk Verify**

### Description
"Upload a CSV file or paste multiple email addresses to verify them in bulk."

---

## Layout Structure

Two-column layout:
- **Left Column**: Input methods (tabs) and submit button
- **Right Column**: Progress indicator and verification results

---

## Left Column: Input Methods

### Tab Navigation
Horizontal tab list with two options:

#### Tab 1: Upload File (Default)
- **Label**: "Upload File"
- **State**: Selected by default

#### Tab 2: Copy & Paste
- **Label**: "Copy & Paste"

---

### Tab Panel: Upload File

#### Drop Zone
- **Type**: Drag and drop file upload area
- **Border**: Dashed border (upload zone indicator)
- **Icon**: Folder icon

#### Instructions
- **Primary Text**: "Drag or click to upload CSV file"
- **Secondary Text**: "or drag & drop"
- **Helper Text**: "File should contain email list"

#### Supported Formats
- **File Types**: CSV, Excel (.csv, .xls, .xlsx)
- **Max Rows**: 100,000 rows
- **Display**: "Supports: CSV, Excel (.csv, .xls, .xlsx) • Max 100,000 rows"

---

### Tab Panel: Copy & Paste

#### Text Area
- **Type**: Multiline textbox (textarea)
- **Placeholder**: "One email address per line, supports bulk paste"
- **Format**: One email per line
- **Supports**: Bulk paste operations

---

### Submit Button
- **Label**: "Start Bulk Verification"
- **Style**: Black background, white text, centered
- **Action**: Initiates bulk verification process
- **Position**: Below the tab panels

### View History Link
- **Label**: "View History"
- **Link**: /home/history
- **Position**: Below submit button
- **Purpose**: Navigate to history page to see past bulk verification jobs

---

## Right Column: Progress & Results

### Verification Progress Section

#### Progress Bar
- **Type**: Horizontal progress bar
- **Initial Value**: 0%
- **Color**: Green fill

#### Progress Display
- **Percentage**: "0%" (dynamic during processing)
- **Status Text**: "Ready to start"

#### Status Messages (Verified)
- "Ready to start" - Initial state
- "⚡ Processing emails..." - During verification
- "✅ Batch completed - X emails" - When finished

#### Credits Display (After Completion)
- "💎 X credits used"

#### Button States
- Initial: "Start Bulk Verification"
- Processing: "⏳ Verifying Emails..." (disabled)

---

### Verification Results Section

#### Title
**Verification Results**

#### Empty State
- **Icon**: Chart/analytics icon (gray)
- **Title**: "No results yet"
- **Message**: "Start verification to see results"

#### Results Display (When Complete)
- **Pie Chart**: Visual distribution of results
- **Percentage Display**: "X% Valid" (large)
- **Breakdown**: "Y% Invalid", "Z% Valid" with counts
- **Export Button**: "Export Results"

**Note**: Copy & Paste bulk verifications are inline - they don't create records in the History page. Only file uploads create History records.

---

## File Upload Specifications

### Supported File Formats
| Format | Extension | Notes |
|--------|-----------|-------|
| CSV | .csv | Comma-separated values |
| Excel | .xls | Legacy Excel format |
| Excel | .xlsx | Modern Excel format |

### Limitations
- **Maximum Rows**: 100,000 emails per file
- **File Content**: Should contain email list (one column expected)

---

## User Flow

### Upload File Flow
1. Navigate to Bulk Verify page
2. "Upload File" tab is selected by default
3. Drag file to drop zone OR click to browse
4. File is uploaded and parsed
5. Click "Start Bulk Verification"
6. Progress bar shows verification status
7. Results appear when complete

### Copy & Paste Flow
1. Navigate to Bulk Verify page
2. Click "Copy & Paste" tab
3. Paste email addresses (one per line)
4. Click "Start Bulk Verification"
5. Progress bar shows verification status
6. Results appear when complete

---

## Progress States

| State | Progress | Status Text |
|-------|----------|-------------|
| Initial | 0% | Ready to start |
| Processing | 1-99% | Processing... |
| Complete | 100% | Complete |

---

## Credit Usage
- Each email in the bulk list consumes 1 credit
- Total credits = Number of emails verified

---

## Empty States

### No File/Input
- Upload zone shows drag & drop instructions
- Results section shows "No results yet"

### No Credits
*Expected behavior:*
- Error message about insufficient credits
- Prompt to purchase more credits

---

## Related Pages
- Quick Verify: /home/quick-verify (for single email verification)
- API Keys: /home/api-keys (for programmatic bulk verification)
- Usage: /home/usage (to view verification history)
- Billing: /home/billing (to purchase credits)

---

## Technical Considerations

### File Parsing
- System parses uploaded file to extract email column
- Supports various CSV delimiters
- Handles Excel workbook format

### Processing
- Batch processing of emails
- Real-time progress updates
- Results downloadable after completion

### Performance
- Max 100,000 rows for performance optimization
- Progress indicator for long-running jobs
