import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { neon } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

/** Production uses Neon (DATABASE_URL). Without it, an embedded Postgres (PGlite) persists to ./.data/pglite. Tests pass `memory`. */
export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;
let cached: Promise<Db> | null = null;

export async function openDb(opts: { memory?: boolean } = {}): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url && !opts.memory) return drizzleNeon(neon(url), { schema }) as unknown as Db;
  const dir = opts.memory ? undefined : path.resolve(/*turbopackIgnore: true*/ process.env.PGLITE_DIR ?? ".data/pglite");
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: path.resolve(/*turbopackIgnore: true*/ "drizzle") });
  return db;
}
export const getDb = () => (cached ??= openDb());
export { schema };
