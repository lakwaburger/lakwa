import { requireAdmin } from "@/lib/server/admin";
import { requireStaff } from "@/lib/server/staff-auth";
import { saveSettings } from "../../actions";

export default async function StaffSettings() {
  await requireStaff({ admin: true });
  const { data: s } = await requireAdmin().from("settings").select("*").eq("id", 1).single();

  return (
    <>
      <div className="staff-head"><h1>Settings</h1></div>
      <form action={saveSettings} className="card fields grid-form">
        <label>
          Price increase for the public (%)
          <input name="markup_pct" type="number" min={0} max={200} step="0.5" defaultValue={Number(s?.markup_pct ?? 20)} />
          <span className="hint">Registered customers are not affected.</span>
        </label>
        <label className="check"><input type="checkbox" name="accepting_orders" defaultChecked={s?.accepting_orders ?? true} /> Accepting online orders</label>
        <label>GCash account name<input name="gcash_name" defaultValue={s?.gcash_name} /></label>
        <label>GCash number<input name="gcash_number" defaultValue={s?.gcash_number} /></label>
        <label className="full">
          GCash QR image URL (optional)
          <input name="gcash_qr_url" defaultValue={s?.gcash_qr_url ?? ""} placeholder="https://…/gcash-qr.png" />
          <span className="hint">Upload your QR to Supabase Storage (a public bucket) or anywhere public, then paste the link.</span>
        </label>
        <div className="full"><button className="btn btn--red">Save settings</button></div>
      </form>
    </>
  );
}
