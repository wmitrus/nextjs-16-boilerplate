CREATE TABLE "user_mfa_recovery_codes" (
	"user_id" uuid NOT NULL,
	"code_id" text NOT NULL,
	"secret_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_mfa_recovery_codes_user_id_code_id_pk" PRIMARY KEY("user_id","code_id")
);
--> statement-breakpoint
CREATE TABLE "user_mfa_totp" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret_envelope" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_used_time_step" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_mfa_recovery_codes" ADD CONSTRAINT "user_mfa_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mfa_totp" ADD CONSTRAINT "user_mfa_totp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_mfa_recovery_codes_user" ON "user_mfa_recovery_codes" USING btree ("user_id");