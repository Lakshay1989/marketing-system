import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { and, gte, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { getSetting } from "./settings";

export interface LlmRequest { purpose: string; prompt: string; model?: string; web?: boolean; timeoutMs?: number }
export interface RawResult { result: string; usage?: { input_tokens?: number; output_tokens?: number }; total_cost_usd?: number; via: "cli" | "api" }
export type Runner = (r: Required<Pick<LlmRequest, "prompt" | "model" | "web" | "timeoutMs">>) => Promise<RawResult>;
export class BudgetError extends Error {}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }; delete env.CLAUDECODE;           // allow nesting from inside another Claude session
    const p = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = ""; const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`model call timed out after ${timeoutMs} ms`)); }, timeoutMs);
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(t); reject(e); }); p.on("close", (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}
const hasCli = () => (process.env.PATH ?? "").split(path.delimiter).some((d) => fs.existsSync(path.join(d, "claude")));

/** Default runner: the `claude` CLI on this machine (uses the owner's Claude login), else the Anthropic API with ANTHROPIC_API_KEY. */
export const defaultRunner: Runner = async ({ prompt, model, web, timeoutMs }) => {
  if (hasCli()) {
    const cwd = path.resolve(".data/llm_cwd"); fs.mkdirSync(cwd, { recursive: true });
    const args = ["-p", prompt, "--model", model, "--output-format", "json", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--disable-slash-commands",
      ...(web ? ["--allowedTools", "WebSearch,WebFetch", "--max-turns", "20"] : ["--tools", "", "--max-turns", "1"])];
    const r = await run("claude", args, cwd, timeoutMs);
    let d: any; try { d = JSON.parse(r.out); } catch { throw new Error(`claude CLI returned unreadable output (exit ${r.code}): ${(r.err || r.out).slice(0, 200)}`); }
    if (d.is_error || typeof d.result !== "string") throw new Error(`claude CLI error: ${String(d.result ?? r.err).slice(0, 200)}`);
    return { result: d.result, usage: d.usage, total_cost_usd: d.total_cost_usd, via: "cli" };
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("No model access: the `claude` CLI is not installed and ANTHROPIC_API_KEY is not set");
  if (web) throw new Error("Web research needs the `claude` CLI (the API path has no web tools configured)");
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }) });
  const d = (await res.json()) as any; if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${d?.error?.message ?? ""}`.slice(0, 250));
  const u = d.usage ?? {}; return { result: (d.content ?? []).map((b: any) => b.text ?? "").join(""), usage: u, total_cost_usd: ((u.input_tokens ?? 0) * 3 + (u.output_tokens ?? 0) * 15) / 1e6, via: "api" };
};

/** Budget-checked model call. Every attempt (success or failure) is logged in llm_calls. */
export async function complete(db: Db, req: LlmRequest, runner: Runner = defaultRunner): Promise<string> {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0); const monthStart = new Date(dayStart); monthStart.setDate(1);
  const [{ calls }] = await db.select({ calls: sql<number>`count(*)::int` }).from(schema.llmCalls).where(gte(schema.llmCalls.at, dayStart));
  const [{ cost }] = await db.select({ cost: sql<number>`coalesce(sum(cost_usd),0)::float` }).from(schema.llmCalls).where(and(gte(schema.llmCalls.at, monthStart), sql`ok`));
  const [maxCalls, budget] = await Promise.all([getSetting(db, "max_llm_calls_per_day"), getSetting(db, "monthly_ai_budget_usd")]);
  if (calls >= maxCalls) throw new BudgetError(`Daily model-call limit reached (${calls}/${maxCalls})`);
  if (cost >= budget) throw new BudgetError(`Monthly AI budget reached ($${cost.toFixed(2)} of $${budget})`);
  const model = req.model ?? process.env.AI_MODEL ?? "sonnet";
  try {
    const r = await runner({ prompt: req.prompt, model, web: req.web ?? false, timeoutMs: req.timeoutMs ?? 600_000 });
    await db.insert(schema.llmCalls).values({ purpose: req.purpose, model, via: r.via, inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0, costUsd: r.total_cost_usd ?? 0, ok: true });
    return r.result;
  } catch (e) {
    await db.insert(schema.llmCalls).values({ purpose: req.purpose, model, via: "cli", ok: false, error: String((e as Error).message).slice(0, 300) });
    throw e;
  }
}

/** Pulls the first JSON array/object out of a model reply (handles ```json fences and chatter). */
export function extractJson<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.search(/[\[{]/); if (start < 0) throw new Error("No JSON found in model reply");
  const open = fenced[start], close = open === "[" ? "]" : "}"; let depth = 0, inStr = false, esc = false;
  for (let i = start; i < fenced.length; i++) {
    const c = fenced[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === open) depth++; else if (c === close && --depth === 0) return JSON.parse(fenced.slice(start, i + 1)) as T;
  }
  throw new Error("Unterminated JSON in model reply");
}
