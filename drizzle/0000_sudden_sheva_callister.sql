CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_key" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" text,
	"error" text,
	"output" jsonb
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"responsibility" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_task" text,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"decided_by" text DEFAULT 'owner' NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"public_url" text,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_sec" double precision,
	"bytes" integer,
	"qa_status" text DEFAULT 'pending' NOT NULL,
	"qa_report" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"theme" text,
	"starts_on" timestamp with time zone,
	"ends_on" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"trend_id" uuid,
	"title" text NOT NULL,
	"hook" text NOT NULL,
	"storyboard" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"format" text NOT NULL,
	"platform" text NOT NULL,
	"score_originality" integer,
	"score_brand_fit" integer,
	"score_quality" integer,
	"score_commercial" integer,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_id" uuid,
	"asset_id" uuid,
	"platform" text NOT NULL,
	"format" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alt_text" text,
	"cta" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid,
	"platform" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metrics" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"external_id" text,
	"url" text,
	"status" text NOT NULL,
	"platform_response" jsonb,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"body" jsonb NOT NULL,
	"summary_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"external_id" text,
	"handle" text NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_checked_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence" text NOT NULL,
	"relevance_score" integer NOT NULL,
	"adaptation" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_runs_agent_started" ON "agent_runs" USING btree ("agent_key","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_storage_key" ON "assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "audit_at" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "content_status" ON "content_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_hash" ON "content_items" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_due" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "metrics_pub_time" ON "metrics_snapshots" USING btree ("publication_id","captured_at");--> statement-breakpoint
CREATE INDEX "publications_item" ON "publications" USING btree ("content_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_platform_handle" ON "social_accounts" USING btree ("platform","handle");--> statement-breakpoint
CREATE UNIQUE INDEX "trends_source_title" ON "trends" USING btree ("source_url","title");