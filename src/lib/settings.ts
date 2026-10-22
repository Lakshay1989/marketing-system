import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { audit } from "./audit";

export type Mode = "review" | "supervised" | "autonomous";
export const DEFAULTS = { mode: "review" as Mode, paused_all: false, emergency_stop: false, daily_publish_limit: 4, timezone: "Asia/Kolkata", monthly_ai_budget_usd: 20, max_llm_calls_per_day: 30 };
export type SettingKey = keyof typeof DEFAULTS;

export async function getSetting<K extends SettingKey>(db: Db, key: K): Promise<(typeof DEFAULTS)[K]> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  return (row ? row.value : DEFAULTS[key]) as (typeof DEFAULTS)[K];
}
export async function setSetting<K extends SettingKey>(db: Db, key: K, value: (typeof DEFAULTS)[K], actor = "owner") {
  await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
  await audit(db, actor, "setting.changed", key, { value });
}
