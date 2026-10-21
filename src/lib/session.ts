import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName, verifySession } from "./auth";
export async function requireAuth() { if (!verifySession((await cookies()).get(sessionCookieName)?.value)) redirect("/login"); }
