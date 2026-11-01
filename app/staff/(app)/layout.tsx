import Link from "next/link";
import { requireStaff } from "@/lib/server/staff-auth";
import { getAdmin } from "@/lib/server/admin";
import { signOut } from "../actions";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  if (!getAdmin()) {
    return (
      <main className="staff-main">
        <div className="notice notice--warn">
          Supabase isn&apos;t configured. Add <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> to your environment (see README).
        </div>
      </main>
    );
  }
  const staff = await requireStaff();
  const links = [
    ["/staff", "Orders"],
    ["/staff/payments", "Payments"],
    ["/staff/customers", "Registered customers"],
    ...(staff.role === "admin" ? [["/staff/menu", "Menu & prices"], ["/staff/settings", "Settings"]] : []),
  ];
  return (
    <>
      <header className="staff-bar">
        <Link href="/staff" className="staff-brand">LAKWA <span>Staff</span></Link>
        <nav>
          {links.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <form action={signOut} className="staff-user">
          <span>{staff.full_name || staff.email}</span>
          <button className="link">Sign out</button>
        </form>
      </header>
      <main className="staff-main">{children}</main>
    </>
  );
}
