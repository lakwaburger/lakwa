"use client";

import { useActionState } from "react";
import { lookupOrders, type HistoryState } from "../order/actions";
import { peso, STATUS_LABEL, FULFILLMENT_LABEL } from "@/lib/pricing";

export default function HistoryClient() {
  const [state, action, pending] = useActionState<HistoryState, FormData>(lookupOrders, null);

  if (state?.orders) {
    return (
      <section className="card">
        <h2 className="card-title">Hi {state.name} — {state.orders.length} order{state.orders.length === 1 ? "" : "s"}</h2>
        {state.orders.length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Order</th><th>Date</th><th>Type</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {state.orders.map((o) => (
                <tr key={o.id}>
                  <td><a href={`/order/${o.id}?t=${o.access_token}`}>{o.order_no}</a></td>
                  <td>{new Date(o.created_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td>
                  <td>{FULFILLMENT_LABEL[o.fulfillment]}</td>
                  <td>{peso(o.total)}</td>
                  <td><span className={`pill pill--${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }

  return (
    <form action={action} className="card fields narrow-form">
      <label>Registered email<input name="email" type="email" required autoComplete="email" /></label>
      <label>Passcode<input name="passcode" type="password" inputMode="numeric" required autoComplete="current-password" /></label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn btn--red btn--block" disabled={pending}>{pending ? "Checking…" : "View my orders"}</button>
    </form>
  );
}
