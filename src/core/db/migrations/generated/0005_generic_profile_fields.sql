ALTER TABLE "users" DROP COLUMN "target_language";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "proficiency_level";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "learning_goal";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text;
