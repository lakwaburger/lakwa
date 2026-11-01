"use client";

import { useActionState } from "react";
import { createCustomer, resetPasscode, type CreateCustomerState } from "../../actions";

function Result({ state }: { state: CreateCustomerState }) {
  if (!state) return null;
  if (!state.ok) return <p className="err" role="alert">{state.error}</p>;
  return (
    <div className={`notice ${state.emailed ? "notice--ok" : "notice--warn"}`} role="status">
      {state.emailed ? (
        <>Passcode emailed to <b>{state.email}</b>.</>
      ) : (
        <>
          <b>Couldn&apos;t send email</b> ({state.emailError}). Share this passcode with {state.name} yourself:
        </>
      )}
      <div className="passcode">{state.passcode}</div>
      <span className="muted small">Shown once — it&apos;s stored encrypted and can&apos;t be viewed again.</span>
    </div>
  );
}

export function CreateCustomerForm() {
  const [state, action, pending] = useActionState(createCustomer, null);
  return (
    <form action={action} className="card fields grid-form" key={state?.ok ? state.email : "new"}>
      <h2 className="card-title">Register a customer</h2>
      <label>Full name<input name="full_name" required /></label>
      <label>Email<input name="email" type="email" required /></label>
      <label>Mobile (optional)<input name="phone" type="tel" /></label>
      <label>
        Extra discount % (optional)
        <input name="extra_discount_pct" type="number" min={0} max={100} step={1} defaultValue={0} />
        <span className="hint">0 = pays the pre-increase price. Add more only for special cases.</span>
      </label>
      <label className="full">Notes (staff only)<input name="notes" placeholder="e.g. Lakwa rider, staff family" /></label>
      <div className="full">
        <button className="btn btn--red" disabled={pending}>{pending ? "Creating…" : "Create & email passcode"}</button>
      </div>
      <div className="full"><Result state={state} /></div>
    </form>
  );
}

export function ResetPasscodeButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resetPasscode, null);
  return (
    <form action={action}>
      <input type="hidden" name="customer_id" value={id} />
      <button className="link" disabled={pending}>{pending ? "Sending…" : "New passcode"}</button>
      <Result state={state} />
    </form>
  );
}
