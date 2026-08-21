CREATE TYPE "public"."audit_category" AS ENUM('auth', 'admin_access', 'organization', 'membership', 'rbac_policy', 'feature_flag', 'waitlist', 'billing', 'security_event', 'server_action');--> statement-breakpoint
CREATE TABLE "audit_log_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "audit_category" NOT NULL,
	"tenant_id" text,
	"enabled" boolean NOT NULL,
	"retention_days" smallint NOT NULL,
	"sample_rate" real,
	"capture_input_on_success" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_audit_log_settings_category_tenant" UNIQUE NULLS NOT DISTINCT("category","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "audit_log_settings" ADD CONSTRAINT "audit_log_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_settings_category" ON "audit_log_settings" USING btree ("category");