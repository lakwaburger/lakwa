import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import PaymentForm from "./PaymentForm";
import { requireAdmin, getAdmin } from "@/lib/server/admin";
import { peso, FULFILLMENT_LABEL, STATUS_LABEL } from "@/lib/pricing";

export const metadata: Metadata = { title: "Your order — Lakwa Burger Cafe", robots: { index: false } };
export const dynamic = "force-dynamic";

const STEPS = ["awaiting_payment", "payment_submitted", "paid", "preparing", "ready", "completed"];

export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!getAdmin() || !t || !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const db = requireAdmin();
  const { data: order } = await db
    .from("orders")
    .select("*, order_items(*), payments(id, gcash_ref, amount, status, review_note, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (!order || order.access_token !== t) notFound();

  const { data: settings } = await db.from("settings").select("gcash_name, gcash_number, gcash_qr_url").eq("id", 1).single();

  const total = Number(order.total);
  const payments = (order.payments as { id: string; gcash_ref: string; amount: number; status: string; review_note: string | null; created_at: string }[])
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pending = payments.find((p) => p.status === "submitted");
  const canPay = order.status === "awaiting_payment" || (order.status === "payment_submitted" && !pending);
  const stepIdx = STEPS.indexOf(order.status);

  return (
    <>
      <Header />
      <main id="main" className="page page--cream">
        <div className="container narrow">
          <div className="page-head">
            <p className="eyebrow">Order {order.order_no}</p>
            <h1 className="display display--lg">{STATUS_LABEL[order.status]}</h1>
            <p className="lede">
              {new Date(order.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}
              {" · "}
              {FULFILLMENT_LABEL[order.fulfillment]}
              {order.is_member && " · Member pricing"}
            </p>
            <p className="muted small">Bookmark this page — it&apos;s your receipt and order tracker.</p>
          </div>

          {order.status !== "cancelled" && (
            <ol className="steps">
              {["Pay", "Confirmed", "Preparing", "Ready", "Done"].map((label, i) => {
                const reached = stepIdx >= i + 1; // Pay=payment_submitted, Confirmed=paid, …
                return <li key={label} className={reached ? "on" : ""}>{label}</li>;
              })}
            </ol>
          )}

          <section className="card">
            <h2 className="card-title">Items</h2>
            <ul className="cart-lines">
              {(order.order_items as { id: string; name: string; qty: number; charged_unit_price: number }[]).map((it) => (
                <li key={it.id}>
                  <span>{it.qty} × {it.name}</span>
                  <span>{peso(Number(it.charged_unit_price) * it.qty)}</span>
                </li>
              ))}
            </ul>
            <dl className="totals">
              <div><dt>Subtotal</dt><dd>{peso(Number(order.subtotal))}</dd></div>
              {Number(order.discount) > 0 && <div className="disc"><dt>Member discount</dt><dd>−{peso(Number(order.discount))}</dd></div>}
              <div className="grand"><dt>Total</dt><dd>{peso(total)}</dd></div>
            </dl>
          </section>

          {canPay && (
            <section className="card">
              <h2 className="card-title">Pay with GCash</h2>
              <ol className="pay-steps">
                <li>Open GCash → <b>Send Money</b> (or scan the QR).</li>
                <li>
                  Send exactly <b>{peso(total)}</b> to <b>{settings?.gcash_number}</b> ({settings?.gcash_name}).
                </li>
                <li>Put <b>{order.order_no}</b> in the message if you can.</li>
                <li>Screenshot the receipt and upload it below with the 13-digit reference no.</li>
              </ol>
              {settings?.gcash_qr_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="gcash-qr" src={settings.gcash_qr_url} alt="GCash QR code" />
              )}
              {payments.some((p) => p.status === "rejected") && (
                <div className="notice notice--warn">
                  We couldn&apos;t match your last payment
                  {payments.find((p) => p.status === "rejected")?.review_note
                    ? `: ${payments.find((p) => p.status === "rejected")?.review_note}`
                    : "."}{" "}
                  Please upload it again.
                </div>
              )}
              <PaymentForm orderId={order.id} token={t} total={total} />
            </section>
          )}

          {payments.length > 0 && (
            <section className="card">
              <h2 className="card-title">Payments</h2>
              <ul className="cart-lines">
                {payments.map((p) => (
                  <li key={p.id}>
                    <span>Ref {p.gcash_ref} · {peso(Number(p.amount))}</span>
                    <span className={`pill pill--${p.status}`}>{p.status === "submitted" ? "Checking" : p.status === "verified" ? "Confirmed" : "Not matched"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="muted small">
            Questions? Call or text <a href="tel:+639311549766">(0931) 154-9766</a>.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
