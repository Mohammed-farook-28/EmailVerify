CREATE TABLE "verification_result" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"score" real NOT NULL,
	"deliverability" text NOT NULL,
	"attributes" jsonb NOT NULL,
	"server_info" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification_result" ADD CONSTRAINT "verification_result_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_result_user_id_created_at_idx" ON "verification_result" USING btree ("user_id","created_at");