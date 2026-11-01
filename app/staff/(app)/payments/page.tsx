import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin";
import { enrichPayments } from "@/lib/server/payments";
import PaymentReview from "../PaymentReview";
import { STATUS_LABEL } from "@/lib/pricing";

const SELECT = "id, order_id, gcash_ref, amount, sender_name, sender_number, status, review_note, created_at, proof_path, orders(order_no, total, customer_name, status)";

type Joined = { orders: { order_no: string; total: number; customer_name: string; status: string } };

export default async function StaffPayments({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref: refRaw } = await searchParams;
  const ref = (refRaw || "").replace(/\D/g, "");
  const db = requireAdmin();

  const query = ref
    ? db.from("payments").select(SELECT).like("gcash_ref", `%${ref}%`).order("created_at", { ascending: false }).limit(20)
    : db.from("payments").select(SELECT).eq("status", "submitted").order("created_at", { ascending: true }).limit(50);
  const { data } = await query;
  const rows = (data || []) as unknown as (Parameters<typeof enrichPayments>[0][number] & Joined)[];
  const enriched = await enrichPayments(rows);

  return (
    <>
      <div className="staff-head">
        <h1>Payments</h1>
      </div>

      <form className="filters card">
        <label className="grow">
          Match a GCash reference no.
          <input name="ref" defaultValue={refRaw} inputMode="numeric" placeholder="Paste the ref no. from the cafe's GCash history" autoFocus />
        </label>
        <button className="btn btn--teal">Find</button>
        {ref && <Link href="/staff/payments">Show all pending</Link>}
      </form>

      <h2 className="sub">{ref ? `Results for “${ref}”` : `Waiting for review (${enriched.length})`}</h2>
      {ref && enriched.length === 0 && (
        <div className="notice notice--warn">No customer has uploaded a payment with that reference number.</div>
      )}
      {!ref && enriched.length === 0 && <p className="muted">All caught up — no payments waiting.</p>}

      {enriched.map((p, i) => {
        const o = rows[i].orders;
        return (
          <section key={p.id} className="card">
            <h3 className="card-title">
              <Link href={`/staff/orders/${p.order_id}`}>{o.order_no}</Link> · {o.customer_name}{" "}
              <span className={`pill pill--${o.status}`}>{STATUS_LABEL[o.status]}</span>
            </h3>
            <PaymentReview p={p} orderTotal={Number(o.total)} />
          </section>
        );
      })}
    </>
  );
}
