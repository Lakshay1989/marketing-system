import Link from "next/link";
import { getDb } from "@/db";
import { getSetting } from "@/lib/settings";
import { logout, toggleEmergencyStop } from "@/app/actions";

const nav = [["/", "Overview"], ["/agents", "Agents"], ["/studio", "Content Studio"], ["/calendar", "Calendar"], ["/trends", "Trends"], ["/analytics", "Analytics"], ["/history", "History"], ["/settings", "Settings"]];
export async function Shell({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const [mode, paused, stop] = await Promise.all([getSetting(db, "mode"), getSetting(db, "paused_all"), getSetting(db, "emergency_stop")]);
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-[var(--deep)] p-4 text-[var(--cream)] md:w-56 md:shrink-0">
        <p className="text-lg font-black">Kukur Marketing AI</p>
        <p className="mt-1 text-xs opacity-80">Mode: <b className="text-[var(--gold)]">{mode}</b></p>
        {paused && <p className="mt-1 text-xs font-bold text-[var(--gold)]">All agents paused</p>}
        {stop && <p className="mt-1 text-xs font-bold text-red-300">EMERGENCY STOP ON</p>}
        <nav className="mt-4 flex flex-wrap gap-1 md:flex-col">{nav.map(([h, l]) => <Link key={h} href={h} className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10">{l}</Link>)}</nav>
        <form action={toggleEmergencyStop} className="mt-4"><button className={`btn ${stop ? "warn" : "danger"} w-full justify-center`}>{stop ? "Release emergency stop" : "Emergency stop publishing"}</button></form>
        <form action={logout} className="mt-2"><button className="btn ghost w-full justify-center">Log out</button></form>
      </aside>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
