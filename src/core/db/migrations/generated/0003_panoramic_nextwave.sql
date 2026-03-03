UPDATE "policies"
SET "conditions" = '{}'::jsonb
WHERE "conditions" IS NULL;--> statement-breakpoint
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "tenant_id", "role_id", "effect", "resource", "actions", "conditions"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS rn
  FROM "policies"
  WHERE "tenant_id" IS NOT NULL
    AND "role_id" IS NOT NULL
)
DELETE FROM "policies" p
USING ranked r
WHERE p."id" = r."id"
  AND r.rn > 1;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "conditions" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "conditions" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "unique_policy_identity_per_role" UNIQUE("tenant_id","role_id","effect","resource","actions","conditions");
