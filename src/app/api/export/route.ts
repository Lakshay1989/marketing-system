import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";
import { sessionCookieName, verifySession } from "@/lib/auth";
export const dynamic = "force-dynamic";
/** Owner-only full export (data portability and backups). Contains no tokens: none are stored in the database. */
export async function GET() {
  if (!verifySession((await cookies()).get(sessionCookieName)?.value)) return new NextResponse("unauthorised", { status: 401 });
  const db = await getDb();
  const out: Record<string, unknown> = {};
  for (const [name, table] of Object.entries(schema)) { try { out[name] = await db.select().from(table as never); } catch { /* skip non-table exports */ } }
  return new NextResponse(JSON.stringify(out, null, 1), { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=kukur-marketing-ai-export.json" } });
}
