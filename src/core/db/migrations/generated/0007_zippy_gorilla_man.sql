DROP INDEX "uq_feature_flags_key_tenant";--> statement-breakpoint
ALTER TABLE "feature_flags" ALTER COLUMN "tenant_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "uq_feature_flags_key_tenant" UNIQUE NULLS NOT DISTINCT("key","tenant_id");