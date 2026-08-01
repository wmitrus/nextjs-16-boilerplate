INSERT INTO "auth_user_identities" (
  "provider",
  "external_user_id",
  "user_id"
)
SELECT
  'authjs',
  "email",
  "user_id"
FROM "user_credentials"
ON CONFLICT ("provider", "external_user_id") DO UPDATE
SET "user_id" = EXCLUDED."user_id"
WHERE "auth_user_identities"."user_id" IS DISTINCT FROM EXCLUDED."user_id";
