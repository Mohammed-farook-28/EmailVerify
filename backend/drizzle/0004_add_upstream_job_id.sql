-- Add upstream_job_id column to bulk_job table
-- Stores the task_id from the upstream /verify/file API
ALTER TABLE "bulk_job" ADD COLUMN "upstream_job_id" text;
