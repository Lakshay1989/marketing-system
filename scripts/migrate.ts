import path from "node:path";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { openDb } from "../src/db";

const url = process.env.DATABASE_URL;
if (url) { await migrate(drizzle(neon(url)), { migrationsFolder: path.resolve("drizzle") }); console.log("Migrated Neon database."); }
else { await openDb(); console.log("Migrated local embedded database (.data/pglite)."); }
