-- OZI-54: trigram indexes for the admin audit-log "contains" filter mode.
-- pg_trgm ships as a standard Postgres contrib extension (available on Neon
-- and any managed Postgres used by this repo); local/PGlite dev registers it
-- explicitly in src/core/db/drivers/create-pglite.ts.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "idx_audit_events_target_type_trgm" ON "audit_events" USING gin ("target_type" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_events_target_id_trgm" ON "audit_events" USING gin ("target_id" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_events_actor_user_id_trgm" ON "audit_events" USING gin (("actor_user_id"::text) gin_trgm_ops);
