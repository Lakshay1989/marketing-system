import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Kukur Marketing AI", robots: { index: false, follow: false } };
export default function Root({ children }: { children: React.ReactNode }) { return <html lang="en-IN"><body>{children}</body></html>; }
