import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, doublePrecision } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Connected Instagram / Facebook accounts. Token values are NOT stored here; only metadata. Tokens live in server env/secret store. */
export const socialAccounts = pgTable("social_accounts", {
  id: id(), platform: text("platform").notNull(), // instagram | facebook
  externalId: text("external_id"), handle: text("handle").notNull(), status: text("status").notNull().default("unverified"), // unverified | connected | blocked
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]), capabilities: jsonb("capabilities").$type<Record<string, boolean>>().notNull().default({}),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }), note: text("note"), createdAt: created(),
}, (t) => [uniqueIndex("social_accounts_platform_handle").on(t.platform, t.handle)]);

export const agents = pgTable("agents", {
  key: text("key").primaryKey(), name: text("name").notNull(), responsibility: text("responsibility").notNull(),
  enabled: boolean("enabled").notNull().default(true), config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  currentTask: text("current_task"), lastRunAt: timestamp("last_run_at", { withTimezone: true }), lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
});

export const agentRuns = pgTable("agent_runs", {
  id: id(), agentKey: text("agent_key").notNull(), status: text("status").notNull().default("running"), // running | success | failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(), finishedAt: timestamp("finished_at", { withTimezone: true }),
  summary: text("summary"), error: text("error"), output: jsonb("output").$type<Record<string, unknown>>(),
}, (t) => [index("agent_runs_agent_started").on(t.agentKey, t.startedAt)]);

/** Researched trends. Every row must carry a real source URL and discovery time; nothing is invented. */
export const trends = pgTable("trends", {
  id: id(), platform: text("platform").notNull(), title: text("title").notNull(), sourceUrl: text("source_url").notNull(), discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
  evidence: text("evidence").notNull(), relevanceScore: integer("relevance_score").notNull(), adaptation: text("adaptation").notNull(),
  status: text("status").notNull().default("new"), // new | selected | produced | published | rejected
  runId: uuid("run_id"), createdAt: created(),
}, (t) => [uniqueIndex("trends_source_title").on(t.sourceUrl, t.title)]);

export const campaigns = pgTable("campaigns", { id: id(), name: text("name").notNull(), theme: text("theme"), startsOn: timestamp("starts_on", { withTimezone: true }), endsOn: timestamp("ends_on", { withTimezone: true }), createdAt: created() });

export const concepts = pgTable("concepts", {
  id: id(), campaignId: uuid("campaign_id"), trendId: uuid("trend_id"), title: text("title").notNull(), hook: text("hook").notNull(), storyboard: jsonb("storyboard").$type<unknown[]>().notNull().default([]),
  format: text("format").notNull(), // reel | story | post
  platform: text("platform").notNull(), // instagram | facebook
  scoreOriginality: integer("score_originality"), scoreBrandFit: integer("score_brand_fit"), scoreQuality: integer("score_quality"), scoreCommercial: integer("score_commercial"),
  status: text("status").notNull().default("proposed"), // proposed | rejected | approved_for_production | produced
  createdAt: created(),
});

/** Finished media files. `storageKey` points into object storage (R2/S3), never to a temporary local path. */
export const assets = pgTable("assets", {
  id: id(), conceptId: uuid("concept_id"), kind: text("kind").notNull(), // reel | story_image | story_video | cover | graphic
  storageKey: text("storage_key").notNull(), publicUrl: text("public_url"), mimeType: text("mime_type").notNull(), width: integer("width"), height: integer("height"), durationSec: doublePrecision("duration_sec"), bytes: integer("bytes"),
  qaStatus: text("qa_status").notNull().default("pending"), // pending | passed | failed
  qaReport: jsonb("qa_report").$type<Record<string, unknown>>(), version: integer("version").notNull().default(1), createdAt: created(),
}, (t) => [uniqueIndex("assets_storage_key").on(t.storageKey)]);

/** A publishable item: an asset plus platform-specific caption and metadata. */
export const contentItems = pgTable("content_items", {
  id: id(), conceptId: uuid("concept_id"), assetId: uuid("asset_id"), platform: text("platform").notNull(), format: text("format").notNull(),
  caption: text("caption").notNull().default(""), hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]), altText: text("alt_text"), cta: text("cta"),
  status: text("status").notNull().default("draft"), // draft | qa_failed | awaiting_approval | approved | rejected | revision_requested | scheduled | publishing | published | failed
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }), contentHash: text("content_hash"), createdAt: created(),
}, (t) => [index("content_status").on(t.status), index("content_hash").on(t.contentHash)]);

export const approvals = pgTable("approvals", {
  id: id(), contentItemId: uuid("content_item_id").notNull(), decision: text("decision").notNull(), // approved | rejected | revision_requested
  note: text("note"), decidedBy: text("decided_by").notNull().default("owner"), decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Postgres-backed job queue and scheduler. `idempotencyKey` prevents duplicate publications. */
export const jobs = pgTable("jobs", {
  id: id(), type: text("type").notNull(), payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}), idempotencyKey: text("idempotency_key"),
  status: text("status").notNull().default("queued"), // queued | running | succeeded | failed | dead
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(), attempts: integer("attempts").notNull().default(0), maxAttempts: integer("max_attempts").notNull().default(5),
  lastError: text("last_error"), lockedAt: timestamp("locked_at", { withTimezone: true }), finishedAt: timestamp("finished_at", { withTimezone: true }), createdAt: created(),
}, (t) => [uniqueIndex("jobs_idempotency").on(t.idempotencyKey), index("jobs_due").on(t.status, t.runAt)]);

export const publications = pgTable("publications", {
  id: id(), contentItemId: uuid("content_item_id").notNull(), platform: text("platform").notNull(), externalId: text("external_id"), url: text("url"),
  status: text("status").notNull(), // submitted | verified | failed
  platformResponse: jsonb("platform_response").$type<Record<string, unknown>>(), verifiedAt: timestamp("verified_at", { withTimezone: true }), createdAt: created(),
}, (t) => [index("publications_item").on(t.contentItemId)]);

export const metricsSnapshots = pgTable("metrics_snapshots", {
  id: id(), publicationId: uuid("publication_id"), platform: text("platform").notNull(), capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  metrics: jsonb("metrics").$type<Record<string, number | null>>().notNull(), // null = platform did not provide it; never invented
}, (t) => [index("metrics_pub_time").on(t.publicationId, t.capturedAt)]);

export const reports = pgTable("reports", { id: id(), kind: text("kind").notNull(), periodStart: timestamp("period_start", { withTimezone: true }).notNull(), periodEnd: timestamp("period_end", { withTimezone: true }).notNull(), body: jsonb("body").$type<Record<string, unknown>>().notNull(), summaryText: text("summary_text").notNull(), createdAt: created() });

export const auditEvents = pgTable("audit_events", { id: id(), at: timestamp("at", { withTimezone: true }).notNull().defaultNow(), actor: text("actor").notNull(), action: text("action").notNull(), target: text("target"), detail: jsonb("detail").$type<Record<string, unknown>>() }, (t) => [index("audit_at").on(t.at)]);

export const settings = pgTable("settings", { key: text("key").primaryKey(), value: jsonb("value").$type<unknown>().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() });
