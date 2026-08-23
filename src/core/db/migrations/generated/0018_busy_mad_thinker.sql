CREATE TABLE "rate_limit_counters" (
	"identifier" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pk_rate_limit_counters" PRIMARY KEY("identifier","window_start")
);
--> statement-breakpoint
CREATE INDEX "idx_rate_limit_counters_expires_at" ON "rate_limit_counters" USING btree ("expires_at");