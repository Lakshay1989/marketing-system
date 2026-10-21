import { Shell } from "@/components/Shell";
import { requireAuth } from "@/lib/session";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) { await requireAuth(); return <Shell>{children}</Shell>; }
