import type { Metadata } from "next";

export const metadata: Metadata = { title: "Staff — Lakwa Burger Cafe", robots: { index: false, follow: false } };

export default function StaffRoot({ children }: { children: React.ReactNode }) {
  return <div className="staff">{children}</div>;
}
