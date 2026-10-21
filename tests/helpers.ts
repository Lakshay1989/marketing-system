import { openDb } from "@/db";
import { seedAgents } from "@/lib/agents";
export async function testDb() { const db = await openDb({ memory: true }); await seedAgents(db); return db; }
