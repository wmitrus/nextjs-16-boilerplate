ALTER TABLE "feature_flags" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD COLUMN "ownership_state" text DEFAULT 'unresolved_legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_feature_flags_key_organization" ON "feature_flags" USING btree ("key","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_feature_flags_key_organization_canonical" ON "feature_flags" USING btree ("key","organization_id") WHERE "feature_flags"."organization_id" is not null and "feature_flags"."ownership_state" = 'canonical_organization';--> statement-breakpoint
-- OZI-71 FF·A: hand-applied NOT VALID (drizzle-kit does not encode the staged
-- CHECK rollout). The constraint still enforces every new/changed row from now
-- on; the historical back-scan is deferred to a later validation step at the
-- plan gate after FF·C / the Quarantine Disposition Gate — see plan section 14a.9.
ALTER TABLE "feature_flags" ADD CONSTRAINT "ck_feature_flags_ownership_state_org" CHECK (("feature_flags"."ownership_state" = 'canonical_organization' and "feature_flags"."organization_id" is not null) or ("feature_flags"."ownership_state" in ('intentional_global', 'unresolved_legacy', 'quarantined') and "feature_flags"."organization_id" is null)) NOT VALID;
