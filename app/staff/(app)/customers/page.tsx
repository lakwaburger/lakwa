import { requireAdmin } from "@/lib/server/admin";
import { updateCustomer } from "../../actions";
import { CreateCustomerForm, ResetPasscodeButton } from "./CustomerForms";

export default async function StaffCustomers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: qRaw } = await searchParams;
  const q = (qRaw || "").replace(/[,()%*]/g, " ").trim();
  const db = requireAdmin();
  let query = db
    .from("customers")
    .select("id, email, full_name, phone, extra_discount_pct, is_active, notes, locked_until, passcode_sent_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data: customers } = await query;

  return (
    <>
      <div className="staff-head">
        <h1>Registered customers</h1>
        <p className="muted">Registered customers pay the pre-increase price when they enter their email + passcode at checkout.</p>
      </div>

      <CreateCustomerForm />

      <form className="filters">
        <input name="q" defaultValue={qRaw} placeholder="Search name, email or phone" />
        <button className="btn btn--teal">Search</button>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Customer</th><th>Extra %</th><th>Passcode</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {(customers || []).map((c) => {
              const locked = c.locked_until && new Date(c.locked_until) > new Date();
              return (
                <tr key={c.id} className={c.is_active ? "" : "dim"}>
                  <td>
                    <b>{c.full_name}</b>
                    <div className="muted small">{c.email}{c.phone && ` · ${c.phone}`}</div>
                    {c.notes && <div className="muted small">{c.notes}</div>}
                  </td>
                  <td>
                    <form action={updateCustomer} className="inline-form">
                      <input type="hidden" name="customer_id" value={c.id} />
                      <input name="extra_discount_pct" type="number" min={0} max={100} defaultValue={Number(c.extra_discount_pct)} />
                      <button className="link">Save</button>
                    </form>
                  </td>
                  <td>
                    <div className="muted small">
                      {c.passcode_sent_at ? `Emailed ${new Date(c.passcode_sent_at).toLocaleDateString("en-PH")}` : "Not emailed"}
                    </div>
                    <ResetPasscodeButton id={c.id} />
                  </td>
                  <td>
                    {c.is_active ? <span className="pill pill--paid">Active</span> : <span className="pill pill--cancelled">Disabled</span>}
                    {locked && <span className="pill pill--rejected">Locked</span>}
                  </td>
                  <td className="row-actions">
                    {locked && (
                      <form action={updateCustomer}>
                        <input type="hidden" name="customer_id" value={c.id} />
                        <input type="hidden" name="unlock" value="true" />
                        <button className="link">Unlock</button>
                      </form>
                    )}
                    <form action={updateCustomer}>
                      <input type="hidden" name="customer_id" value={c.id} />
                      <input type="hidden" name="is_active" value={c.is_active ? "false" : "true"} />
                      <button className="link">{c.is_active ? "Disable" : "Enable"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!customers?.length && <tr><td colSpan={5} className="muted">No registered customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
