import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const Playbook = z.object({
  updatedAt: z.string(),
  method: z.string(),
  observations: z.array(z.object({ pattern: z.string(), seen: z.string(), source: z.string() })),
  hookTemplates: z.array(z.string()),
  topicAngles: z.array(z.string()),
  captionRules: z.array(z.string()),
  limits: z.string(),
});
export type ReelPlaybook = z.infer<typeof Playbook>;

export const STALE_AFTER_DAYS = 14;

export function loadPlaybook(file = path.resolve("data/reel-playbook.json")): ReelPlaybook | null {
  try { return Playbook.parse(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { return null; }
}

export const playbookAgeDays = (p: ReelPlaybook, now = new Date()) => Math.floor((now.getTime() - new Date(p.updatedAt).getTime()) / 86_400_000);

/** The prompt section that tells the Creative Director what top Instagram pet reels do. Empty when there is no playbook. */
export function playbookPrompt(p: ReelPlaybook | null, now = new Date()): string {
  if (!p) return "";
  const stale = playbookAgeDays(p, now) > STALE_AFTER_DAYS ? " (this list is old: lean on the patterns, not the exact wording)" : "";
  return `LEARNED FROM TOP INSTAGRAM PET REELS (${p.updatedAt}${stale}). ${p.method}
Patterns seen: ${p.observations.map((o) => `${o.pattern}: ${o.seen}`).join(" | ")}
Hook templates to adapt, never copy word for word: ${JSON.stringify(p.hookTemplates)}.
Topic angles: ${p.topicAngles.join("; ")}.
Caption rules: ${p.captionRules.join("; ")}.
At least HALF of your concepts must be built on one of these patterns (relatable pet-parent moment, mistake or checklist, numbered shades list, or shop-owner display tip), so the hook reads like something a pet parent would share, not like an advert. ${p.limits}`;
}
