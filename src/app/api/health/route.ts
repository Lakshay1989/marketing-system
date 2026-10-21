import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const db = await getDb(); await db.execute(sql`select 1`);
    const r = (await db.execute(sql`select status, count(*)::int as n from jobs group by status`)) as unknown as { rows: { status: string; n: number }[] };
    return NextResponse.json({ ok: true, db: "up", jobs: Object.fromEntries(r.rows.map((x) => [x.status, x.n])) });
  } catch (e) { return NextResponse.json({ ok: false, db: "down", error: String((e as Error).message).slice(0, 200) }, { status: 503 }); }
}
