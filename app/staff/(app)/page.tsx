import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin";
import { peso, STATUS_LABEL, FULFILLMENT_LABEL } from "@/lib/pricing";

const TABS = [
  ["active", "Active"],
  ["payment_submitted", "Check payment"],
  ["awaiting_payment", "Awaiting payment"],
  ["paid", "Paid"],
  ["preparing", "Preparing"],
  ["ready", "Ready"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["all", "All / history"],
];
const ACTIVE = ["payment_submitted", "paid", "preparing", "ready"];

export default async function StaffOrders({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status || "active";
  const q = (sp.q || "").replace(/[,()%*]/g, " ").trim();
  const db = requireAdmin();

  let query = db
    .from("orders")
    .select("id, order_no, created_at, customer_name, email, phone, fulfillment, total, discount, is_member, status")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "active") query = query.in("status", ACTIVE);
  else if (status !== "all") query = query.eq("status", status);
  if (q) query = query.or(`order_no.ilike.%${q}%,customer_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  if (sp.from) query = query.gte("created_at", `${sp.from}T00:00:00+08:00`);
  if (sp.to) query = query.lte("created_at", `${sp.to}T23:59:59+08:00`);
  const { data: orders, error } = await query;

  const { data: counts } = await db.from("orders").select("status").in("status", ["payment_submitted", ...ACTIVE]);
  const n = (s: string) => (counts || []).filter((c) => c.status === s).length;
  const sum = (orders || []).reduce((s, o) => s + Number(o.total), 0);

  return (
    <>
      {sp.error === "admin-only" && <div className="notice notice--warn">That page is for admins only.</div>}
      <div className="staff-head">
        <h1>Orders</h1>
        <div className="stat-row">
          <span className="stat"><b>{n("payment_submitted")}</b> to check</span>
          <span className="stat"><b>{n("paid")}</b> paid</span>
          <span className="stat"><b>{n("preparing")}</b> preparing</span>
          <span className="stat"><b>{n("ready")}</b> ready</span>
        </div>
      </div>

      <nav className="tabs">
        {TABS.map(([v, l]) => (
          <Link key={v} href={`/staff?status=${v}`} className={status === v ? "on" : ""}>{l}</Link>
        ))}
      </nav>

      <form className="filters">
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={sp.q} placeholder="Order no., name, email or phone" />
        <label>From <input type="date" name="from" defaultValue={sp.from} /></label>
        <label>To <input type="date" name="to" defaultValue={sp.to} /></label>
        <button className="btn btn--teal">Filter</button>
        {(sp.q || sp.from || sp.to) && <Link href={`/staff?status=${status}`}>Clear</Link>}
      </form>

      {error && <div className="notice notice--warn">{error.message}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Order</th><th>Placed</th><th>Customer</th><th>Type</th><th>Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            {(orders || []).map((o) => (
              <tr key={o.id}>
                <td><Link href={`/staff/orders/${o.id}`}><b>{o.order_no}</b></Link></td>
                <td>{new Date(o.created_at).toLocaleString("en-PH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Manila" })}</td>
                <td>
                  {o.customer_name} {o.is_member && <span className="pill pill--member">Member</span>}
                  <div className="muted small">{o.phone} · {o.email}</div>
                </td>
                <td>{FULFILLMENT_LABEL[o.fulfillment]}</td>
                <td>{peso(Number(o.total))}{Number(o.discount) > 0 && <div className="muted small">−{peso(Number(o.discount))} member</div>}</td>
                <td><span className={`pill pill--${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
              </tr>
            ))}
            {!orders?.length && <tr><td colSpan={6} className="muted">No orders here.</td></tr>}
          </tbody>
        </table>
      </div>
      {!!orders?.length && <p className="muted small">{orders.length} orders · {peso(sum)} total{orders.length === 200 ? " (showing latest 200 — narrow the dates)" : ""}</p>}
    </>
  );
}
