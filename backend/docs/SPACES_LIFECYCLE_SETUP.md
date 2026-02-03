# DigitalOcean Spaces Lifecycle Policy Setup

## Overview
Configure automatic deletion of bulk verification results after 14 days to manage storage costs.

## Steps

1. **Access DigitalOcean Console**
   - Navigate to Spaces in your DigitalOcean dashboard
   - Select the `emailkit-bulk-results` bucket (or create it if it doesn't exist)

2. **Configure Lifecycle Policy**
   - Go to Settings → Lifecycle Policy
   - Add a new rule with the following configuration:
     - **Rule Name**: `auto-delete-bulk-results`
     - **Prefix**: `results/` (optional, targets only result files)
     - **Expiration**: 14 days
     - **Action**: Delete objects

3. **Verify Configuration**
   - Test by uploading a file with a specific date prefix
   - Wait 14 days or use the console to verify policy is active

## Alternative: No Lifecycle Policy
If lifecycle policies are not available or preferred, implement a cleanup worker:
- Run daily cron job
- Query `bulk_jobs` table for jobs older than 14 days
- Delete corresponding S3 objects
- Update `result_url` to null

## Environment Variables
Ensure these are configured in `.env`:
```
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_REGION=nyc3
SPACES_ACCESS_KEY=<your-access-key>
SPACES_SECRET_KEY=<your-secret-key>
SPACES_BUCKET=emailkit-bulk-results
RETENTION_DAYS=14
```
