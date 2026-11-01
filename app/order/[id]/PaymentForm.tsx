"use client";

import { useActionState } from "react";
import { submitPayment, type PaymentState } from "../actions";
import { peso } from "@/lib/pricing";

export default function PaymentForm({ orderId, token, total }: { orderId: string; token: string; total: number }) {
  const [state, action, pending] = useActionState<PaymentState, FormData>(submitPayment, null);

  if (state?.ok) {
    return (
      <div className="notice notice--ok" role="status">
        <b>Receipt received.</b> We&apos;ll match your GCash reference number and confirm your order shortly.
        Refresh this page to see the update.
      </div>
    );
  }

  return (
    <form action={action} className="fields pay-form">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="token" value={token} />
      <label>
        GCash reference no. (13 digits)
        <input name="gcash_ref" required inputMode="numeric" pattern="[0-9 ]{13,17}" placeholder="1234 567 891234" autoComplete="off" />
      </label>
      <label>
        Amount sent
        <input name="amount" required inputMode="decimal" defaultValue={total} />
        <span className="hint">Should be exactly {peso(total)}</span>
      </label>
      <label>
        Your GCash name (optional)
        <input name="sender_name" placeholder="As shown in GCash, e.g. JU** D." />
      </label>
      <label>
        Your GCash number (optional)
        <input name="sender_number" inputMode="tel" placeholder="09xx xxx xxxx" />
      </label>
      <label>
        Receipt screenshot
        <input name="proof" type="file" required accept="image/*,application/pdf" />
      </label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <button className="btn btn--red btn--block" disabled={pending}>{pending ? "Uploading…" : "Submit payment"}</button>
    </form>
  );
}
