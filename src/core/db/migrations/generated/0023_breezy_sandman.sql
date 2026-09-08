-- OZI-71 AUD·A: scope the production DDL timeout policy to THIS migration's
-- statements only. Drizzle wraps EVERY pending migration in ONE transaction,
-- so setting these at the connection/subprocess level would run 0000..0022
-- (incl. data-backfill migrations like 0014) — and any migration batched
-- after 0023 — under 0023's short caps. `SET LOCAL` is transaction-scoped;
-- the explicit `SET LOCAL … = DEFAULT` at the end of this file restores the
-- outer transaction's normal policy before it moves on.
--   lock_timeout = 3s      — a blocked ALTER / ADD CONSTRAINT aborts instead
--                            of queueing behind a long transaction.
--   statement_timeout = 30s — 0023's statements are catalog-only on PG 11+
--                            (constant-default ADD COLUMN, ADD … NOT VALID,
--                            CREATE INDEX on the empty audit_log_settings);
--                            ~100x headroom, never a real cap here.
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
SET LOCAL statement_timeout = '30s';--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "ownership_state" text DEFAULT 'unresolved_legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log_settings" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log_settings" ADD COLUMN "ownership_state" text DEFAULT 'unresolved_legacy' NOT NULL;--> statement-breakpoint
-- OZI-71 AUD·A: FK added NOT VALID (hand-applied — drizzle-kit does not encode
-- the staged rollout). ADD CONSTRAINT ... NOT VALID takes a brief
-- SHARE ROW EXCLUSIVE lock on BOTH audit_events and organizations and skips the
-- validating scan. The scan runs later via `VALIDATE CONSTRAINT` in the AUD·A
-- post-migrate step (`src/core/db/post-migrate-steps.ts`), AFTER this migration's
-- transaction has committed — drizzle wraps every pending migration in ONE
-- transaction, so a `VALIDATE CONSTRAINT` in a separate `.sql` file would still
-- share this transaction and hold the ADD-CONSTRAINT lock for the whole scan.
-- See plan section 16 AUD·A "Foreign-key rollout".
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "audit_log_settings" ADD CONSTRAINT "audit_log_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
-- OZI-71 AUD·A: `idx_audit_events_organization_occurred` is intentionally NOT
-- created by any journaled migration. A plain CREATE INDEX takes a SHARE lock
-- that blocks writes (not reads) for the entire build of a large audit_events;
-- CREATE INDEX CONCURRENTLY avoids the write block but cannot run inside a
-- transaction, and drizzle wraps every migration in one. The AUD·A post-migrate
-- step (`src/core/db/post-migrate-steps.ts`) builds it CONCURRENTLY on a fresh
-- connection after this migration commits (plain CREATE INDEX for PGlite). See
-- plan section 16 AUD·A "Production index safety".
CREATE INDEX "idx_audit_log_settings_category_organization" ON "audit_log_settings" USING btree ("category","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_audit_log_settings_category_organization_canonical" ON "audit_log_settings" USING btree ("category","organization_id") WHERE "audit_log_settings"."organization_id" is not null and "audit_log_settings"."ownership_state" = 'canonical_organization';--> statement-breakpoint
-- OZI-71 AUD·A: cross-column ownership CHECK on both tables, hand-applied
-- NOT VALID (drizzle-kit does not encode the staged rollout). ADD CONSTRAINT
-- ... CHECK ... NOT VALID takes a brief ACCESS EXCLUSIVE lock and no scan; it
-- enforces every new/changed row from now on. The historical back-scan is
-- deferred to `VALIDATE CONSTRAINT` at the later plan gate after AUD·C / the
-- Quarantine Disposition Gate — see plan section 14a.9. AUD·A (this migration
-- AND its post-migrate step) must NOT validate these CHECKs.
ALTER TABLE "audit_events" ADD CONSTRAINT "ck_audit_events_ownership_state_org" CHECK (("audit_events"."ownership_state" = 'canonical_organization') or ("audit_events"."ownership_state" in ('organization_owned_orphaned', 'intentional_global', 'unresolved_legacy', 'quarantined') and "audit_events"."organization_id" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "audit_log_settings" ADD CONSTRAINT "ck_audit_log_settings_ownership_state_org" CHECK (("audit_log_settings"."ownership_state" = 'canonical_organization' and "audit_log_settings"."organization_id" is not null) or ("audit_log_settings"."ownership_state" in ('intentional_global', 'unresolved_legacy', 'quarantined') and "audit_log_settings"."organization_id" is null)) NOT VALID;--> statement-breakpoint
-- OZI-71 AUD·A: restore the outer transaction's normal timeout policy. Drizzle
-- may batch a later migration into the SAME transaction as 0023 (catch-up /
-- future); without this reset that migration would inherit 0023's 3s/30s caps.
-- `SET LOCAL … = DEFAULT` reverts to the session default for the remainder of
-- this transaction.
SET LOCAL lock_timeout = DEFAULT;--> statement-breakpoint
SET LOCAL statement_timeout = DEFAULT;
