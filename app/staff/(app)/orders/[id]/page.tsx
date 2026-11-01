import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin";
import { enrichPayments } from "@/lib/server/payments";
import { setOrderStatus } from "../../../actions";
import PaymentReview from "../../PaymentReview";
import { peso, STATUS_LABEL, FULFILLMENT_LABEL } from "@/lib/pricing";

const NEXT: Record<string, [string, string][]> = {
  awaiting_payment: [["paid", "Mark paid (cash / other)"], ["cancelled", "Cancel order"]],
  payment_submitted: [["cancelled", "Cancel order"]],
  paid: [["preparing", "Start preparing"], ["cancelled", "Cancel order"]],
  preparing: [["ready", "Mark ready"]],
  ready: [["completed", "Complete"]],
  completed: [],
  cancelled: [["awaiting_payment", "Re-open"]],
};

export default async function StaffOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = requireAdmin();
  const { data: o } = await db
    .from("orders")
    .select("*, order_items(*), payments(*), customers(full_name, email, extra_discount_pct)")
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();

  const total = Number(o.total);
  const payments = await enrichPayments(
    [...o.payments].sort((a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at)),
  );

  return (
    <>
      <p><Link href="/staff">← Orders</Link></p>
      <div className="staff-head">
        <h1>{o.order_no} <span className={`pill pill--${o.status}`}>{STATUS_LABEL[o.status]}</span></h1>
        <div className="btn-row">
          {NEXT[o.status].map(([s, label]) => (
            <form key={s} action={setOrderStatus}>
              <input type="hidden" name="order_id" value={o.id} />
              <input type="hidden" name="status" value={s} />
              <button className={s === "cancelled" ? "btn btn--outline-dark" : "btn btn--red"}>{label}</button>
            </form>
          ))}
        </div>
      </div>

      <div className="staff-grid">
        <section className="card">
          <h2 className="card-title">Customer</h2>
          <p><b>{o.customer_name}</b> {o.is_member && <span className="pill pill--member">Member</span>}</p>
          <p><a href={`tel:${o.phone}`}>{o.phone}</a> · <a href={`mailto:${o.email}`}>{o.email}</a></p>
          <p>{FULFILLMENT_LABEL[o.fulfillment]} · {new Date(o.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p>
          {o.notes && <p className="notice">“{o.notes}”</p>}
        </section>

        <section className="card">
          <h2 className="card-title">Items</h2>
          <ul className="cart-lines">
            {o.order_items.map((it: { id: string; qty: number; name: string; unit_price: number; charged_unit_price: number }) => (
              <li key={it.id}>
                <span>{it.qty} × {it.name}</span>
                <span>
                  {Number(it.charged_unit_price) < Number(it.unit_price) && <s className="muted">{peso(Number(it.unit_price) * it.qty)}</s>}{" "}
                  {peso(Number(it.charged_unit_price) * it.qty)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="totals">
            <div><dt>Subtotal (public, +{Number(o.markup_pct)}%)</dt><dd>{peso(Number(o.subtotal))}</dd></div>
            {Number(o.discount) > 0 && <div className="disc"><dt>Member discount</dt><dd>−{peso(Number(o.discount))}</dd></div>}
            <div className="grand"><dt>Total due</dt><dd>{peso(total)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">GCash payments</h2>
        {payments.length === 0 && <p className="muted">No payment uploaded yet.</p>}
        {payments.map((p) => <PaymentReview key={p.id} p={p} orderTotal={total} />)}
      </section>
    </>
  );
}
