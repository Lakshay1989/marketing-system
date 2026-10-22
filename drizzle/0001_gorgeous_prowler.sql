CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"via" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"ok" boolean NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "cta" text;--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "caption" text;--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "product_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "llm_calls_at" ON "llm_calls" USING btree ("at");