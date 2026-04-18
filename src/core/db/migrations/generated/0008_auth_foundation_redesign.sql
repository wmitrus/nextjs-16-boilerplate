CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_org_slug_per_tenant" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_organizations_tenant" ON "organizations" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "auth_tenant_identities" DROP CONSTRAINT "auth_tenant_identities_tenant_id_tenants_id_fk";--> statement-breakpoint
DROP INDEX "idx_auth_tenant_identities_tenant";--> statement-breakpoint
ALTER TABLE "auth_tenant_identities" RENAME TO "auth_organization_identities";--> statement-breakpoint
ALTER TABLE "auth_organization_identities" RENAME COLUMN "external_tenant_id" TO "external_org_id";--> statement-breakpoint
ALTER TABLE "auth_organization_identities" RENAME COLUMN "tenant_id" TO "organization_id";--> statement-breakpoint
ALTER TABLE "auth_organization_identities" DROP CONSTRAINT "auth_tenant_identities_provider_external_tenant_id_pk";--> statement-breakpoint
ALTER TABLE "auth_organization_identities" ADD CONSTRAINT "auth_organization_identities_provider_external_org_id_pk" PRIMARY KEY("provider","external_org_id");--> statement-breakpoint
ALTER TABLE "auth_organization_identities" ADD CONSTRAINT "auth_organization_identities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auth_org_identities_org" ON "auth_organization_identities" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_user_id_tenant_id_pk";--> statement-breakpoint
DROP INDEX "idx_memberships_tenant_user";--> statement-breakpoint
ALTER TABLE "memberships" RENAME COLUMN "tenant_id" TO "organization_id";--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_organization_id_pk" PRIMARY KEY("user_id","organization_id");--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_memberships_org_user" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "roles_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "unique_role_name_per_tenant";--> statement-breakpoint
DROP INDEX "idx_roles_tenant";--> statement-breakpoint
ALTER TABLE "roles" RENAME COLUMN "tenant_id" TO "organization_id";--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "unique_role_name_per_org" UNIQUE("organization_id","name");--> statement-breakpoint
CREATE INDEX "idx_roles_org" ON "roles" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "policies" DROP CONSTRAINT "policies_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "policies" DROP CONSTRAINT "unique_policy_identity_per_role";--> statement-breakpoint
DROP INDEX "idx_policies_tenant";--> statement-breakpoint
ALTER TABLE "policies" RENAME COLUMN "tenant_id" TO "organization_id";--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "unique_policy_identity_per_role" UNIQUE("organization_id","role_id","effect","resource","actions","conditions");--> statement-breakpoint
CREATE INDEX "idx_policies_org" ON "policies" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "tenant_attributes" ADD COLUMN "max_organizations" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invited_by_user_id" uuid,
	"email" text NOT NULL,
	"role_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"organization_id" uuid,
	"tenant_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invitations_organization" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_email" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_invitations_token" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_waitlist_status" ON "waitlist_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_waitlist_organization" ON "waitlist_entries" USING btree ("organization_id");
