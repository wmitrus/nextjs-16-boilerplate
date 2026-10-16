SET LOCAL lock_timeout = '3s';
--> statement-breakpoint

ALTER TABLE "policies"
ADD CONSTRAINT "policies_organization_id_not_null"
CHECK ("organization_id" IS NOT NULL) NOT VALID;
--> statement-breakpoint

LOCK TABLE "waitlist_entries" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "waitlist_entries"
    WHERE "tenant_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'S7 destructive cutover refused: waitlist_entries.tenant_id contains populated values';
  END IF;
END
$$;
--> statement-breakpoint

ALTER TABLE "waitlist_entries"
DROP COLUMN "tenant_id";
--> statement-breakpoint

SET LOCAL lock_timeout = DEFAULT;
