-- Bulk verification tables
CREATE TABLE "bulk_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"filename" text,
	"total_count" integer NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"valid_count" integer DEFAULT 0 NOT NULL,
	"invalid_count" integer DEFAULT 0 NOT NULL,
	"risky_count" integer DEFAULT 0 NOT NULL,
	"unknown_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"result_expires_at" timestamp,
	"result_url" text
);
--> statement-breakpoint
CREATE TABLE "bulk_verification_result" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"deliverable" boolean NOT NULL,
	"risky" boolean NOT NULL,
	"unknown" boolean NOT NULL,
	"risk_score" real NOT NULL,
	"mx_records" jsonb,
	"smtp_provider" text,
	"is_free_email" boolean DEFAULT false NOT NULL,
	"is_role_based" boolean DEFAULT false NOT NULL,
	"is_catch_all" boolean DEFAULT false NOT NULL,
	"is_disposable" boolean DEFAULT false NOT NULL,
	"has_mx_records" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Foreign key constraints
ALTER TABLE "bulk_job" ADD CONSTRAINT "bulk_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bulk_verification_result" ADD CONSTRAINT "bulk_verification_result_job_id_bulk_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."bulk_job"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Indexes for performance
CREATE INDEX "bulk_job_user_id_idx" ON "bulk_job" ("user_id");
--> statement-breakpoint
CREATE INDEX "bulk_job_status_idx" ON "bulk_job" ("status");
--> statement-breakpoint
CREATE INDEX "bulk_job_created_at_idx" ON "bulk_job" ("created_at");
--> statement-breakpoint
CREATE INDEX "bulk_verification_result_job_id_idx" ON "bulk_verification_result" ("job_id");
--> statement-breakpoint
CREATE INDEX "bulk_verification_result_status_idx" ON "bulk_verification_result" ("status");
--> statement-breakpoint
-- Unique constraint: one active job per user
CREATE UNIQUE INDEX "bulk_job_user_active_unique" ON "bulk_job" ("user_id") WHERE status IN ('pending', 'processing');
