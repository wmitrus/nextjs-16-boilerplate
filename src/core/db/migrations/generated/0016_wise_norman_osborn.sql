CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" "audit_category" NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"tenant_id" text,
	"actor_user_id" uuid,
	"target_type" text,
	"target_id" text,
	"ip" text,
	"user_agent" text,
	"correlation_id" text,
	"request_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_events_tenant_occurred" ON "audit_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_category_occurred" ON "audit_events" USING btree ("category","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_actor_occurred" ON "audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_audit_events_target" ON "audit_events" USING btree ("target_type","target_id");