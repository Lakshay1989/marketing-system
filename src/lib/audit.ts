import { schema, type Db } from "@/db";
export async function audit(db: Db, actor: string, action: string, target?: string, detail?: Record<string, unknown>) {
  await db.insert(schema.auditEvents).values({ actor, action, target, detail });
}
