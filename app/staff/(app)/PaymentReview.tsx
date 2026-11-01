import { reviewPayment } from "../actions";
import { peso } from "@/lib/pricing";

export type PaymentRow = {
  id: string;
  gcash_ref: string;
  amount: number;
  sender_name: string | null;
  sender_number: string | null;
  status: string;
  review_note: string | null;
  created_at: string;
  proofUrl: string | null;
  duplicate: boolean;
};

/** One payment with automatic match checks + verify/reject buttons. */
export default function PaymentReview({ p, orderTotal }: { p: PaymentRow; orderTotal: number }) {
  const amountOk = Math.abs(Number(p.amount) - orderTotal) < 0.01;
  const refOk = /^\d{13}$/.test(p.gcash_ref);
  return (
    <div className="pay-review">
      <div className="pay-proof">
        {p.proofUrl ? (
          <a href={p.proofUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.proofUrl} alt="GCash receipt" />
          </a>
        ) : (
          <span className="muted small">No preview</span>
        )}
      </div>
      <div className="pay-info">
        <p className="ref">Ref <b>{p.gcash_ref.replace(/(\d{4})(\d{3})(\d{6})/, "$1 $2 $3")}</b></p>
        <ul className="checks">
          <li className={refOk ? "ok" : "bad"}>{refOk ? "✓" : "✗"} 13-digit reference</li>
          <li className={amountOk ? "ok" : "bad"}>
            {amountOk ? "✓" : "✗"} Amount {peso(Number(p.amount))} {amountOk ? "matches" : `≠ order total ${peso(orderTotal)}`}
          </li>
          <li className={p.duplicate ? "bad" : "ok"}>{p.duplicate ? "✗ Reference used on another order" : "✓ Reference not used elsewhere"}</li>
        </ul>
        <p className="muted small">
          {p.sender_name && <>From {p.sender_name} </>}
          {p.sender_number && <>({p.sender_number}) </>}
          · {new Date(p.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
        </p>
        <p className="muted small">Confirm the same reference no. and amount appear in the cafe&apos;s GCash transaction history before verifying.</p>

        {p.status === "submitted" ? (
          <form action={reviewPayment} className="review-form">
            <input type="hidden" name="payment_id" value={p.id} />
            <input name="note" placeholder="Note to customer (required if rejecting)" />
            <div className="btn-row">
              <button name="decision" value="verify" className="btn btn--teal">Verify payment</button>
              <button name="decision" value="reject" className="btn btn--outline-dark">Reject</button>
            </div>
          </form>
        ) : (
          <p>
            <span className={`pill pill--${p.status}`}>{p.status}</span> {p.review_note && <span className="muted small">“{p.review_note}”</span>}
          </p>
        )}
      </div>
    </div>
  );
}
