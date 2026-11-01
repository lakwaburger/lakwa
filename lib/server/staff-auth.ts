import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { requireAdmin } from "./admin";

/** Supabase client bound to the staff member's auth cookies. */
export async function staffSupabase() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

export type Staff = { user_id: string; email: string; full_name: string; role: "staff" | "admin" };

export async function getStaff(): Promise<Staff | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const supabase = await staffSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await requireAdmin()
    .from("staff")
    .select("user_id, full_name, role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!row) return null;
  return { ...row, email: data.user.email ?? "" } as Staff;
}

export async function requireStaff(opts: { admin?: boolean } = {}): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/staff/login");
  if (opts.admin && staff.role !== "admin") redirect("/staff?error=admin-only");
  return staff;
}
