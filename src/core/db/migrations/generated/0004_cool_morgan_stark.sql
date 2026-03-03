ALTER TABLE "users" ADD COLUMN "onboarding_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "target_language" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "proficiency_level" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "learning_goal" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;