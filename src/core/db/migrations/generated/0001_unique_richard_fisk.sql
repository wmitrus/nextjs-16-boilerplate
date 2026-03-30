CREATE TABLE "auth_tenant_identities" (
	"provider" text NOT NULL,
	"external_tenant_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tenant_identities_provider_external_tenant_id_pk" PRIMARY KEY("provider","external_tenant_id")
);
--> statement-breakpoint
CREATE TABLE "auth_user_identities" (
	"provider" text NOT NULL,
	"external_user_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_identities_provider_external_user_id_pk" PRIMARY KEY("provider","external_user_id")
);
--> statement-breakpoint
ALTER TABLE "auth_tenant_identities" ADD CONSTRAINT "auth_tenant_identities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_user_identities" ADD CONSTRAINT "auth_user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auth_tenant_identities_tenant" ON "auth_tenant_identities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_auth_user_identities_user" ON "auth_user_identities" USING btree ("user_id");