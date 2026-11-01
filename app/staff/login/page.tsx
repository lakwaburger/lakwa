"use client";

import { useActionState } from "react";
import { signIn } from "../actions";

export default function StaffLogin() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <main className="staff-login">
      <form action={action} className="card fields">
        <p className="eyebrow">Lakwa Burger Cafe</p>
        <h1 className="display display--sm">Staff sign in</h1>
        <label>Email<input name="email" type="email" required autoComplete="username" /></label>
        <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
        {state?.error && <p className="err" role="alert">{state.error}</p>}
        <button className="btn btn--red btn--block" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
