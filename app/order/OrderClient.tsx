"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MenuItem } from "@/lib/menu";
import { publicPrice, peso } from "@/lib/pricing";
import { sized } from "@/lib/menu";
import { checkMember, placeOrder } from "./actions";

type Props = { items: MenuItem[]; markup: number; enabled: boolean };
const CART_KEY = "lakwa-cart";

export default function OrderClient({ items, markup, enabled }: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isMemberMode, setMemberMode] = useState(false);
  const [mEmail, setMEmail] = useState("");
  const [mPass, setMPass] = useState("");
  const [member, setMember] = useState<{ name: string; prices: Record<string, number> } | null>(null);
  const [memberMsg, setMemberMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", fulfillment: "pickup", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [placing, startPlace] = useTransition();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || "{}");
      if (saved && typeof saved === "object") setCart(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {}
  }, [cart]);

  const priceOf = (m: MenuItem) => publicPrice(m.base_price, markup);
  const chargedOf = (m: MenuItem) => (member && member.prices[m.id] != null ? member.prices[m.id] : priceOf(m));

  const lines = useMemo(
    () => items.filter((m) => cart[m.id] > 0).map((m) => ({ m, qty: cart[m.id] })),
    [items, cart],
  );
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + priceOf(l.m) * l.qty, 0);
  const total = lines.reduce((s, l) => s + chargedOf(l.m) * l.qty, 0);

  const setQty = (id: string, q: number) =>
    setCart((c) => {
      const next = { ...c };
      if (q <= 0) delete next[id];
      else next[id] = Math.min(50, q);
      return next;
    });

  const applyMember = () => {
    setMemberMsg(null);
    startCheck(async () => {
      const r = await checkMember(mEmail, mPass);
      if (!r.ok) {
        setMember(null);
        setMemberMsg(r.error);
        return;
      }
      setMember({ name: r.name, prices: r.prices });
      setForm((f) => ({ ...f, name: f.name || r.name, phone: f.phone || r.phone || "", email: mEmail.trim().toLowerCase() }));
    });
  };

  const clearMember = () => {
    setMember(null);
    setMPass("");
    setMemberMsg(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startPlace(async () => {
      const r = await placeOrder({
        items: lines.map((l) => ({ id: l.m.id, qty: l.qty })),
        name: form.name,
        phone: form.phone,
        email: member ? mEmail : form.email,
        fulfillment: form.fulfillment as "pickup",
        notes: form.notes,
        member: member ? { email: mEmail, passcode: mPass } : null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      try {
        localStorage.removeItem(CART_KEY);
      } catch {}
      router.push(`/order/${r.id}?t=${r.token}`);
    });
  };

  return (
    <div className="order-layout">
      <ul className="order-menu">
        {items.map((m) => {
          const qty = cart[m.id] || 0;
          const pub = priceOf(m);
          const charged = chargedOf(m);
          return (
            <li key={m.id} className="order-item">
              <div className="order-item-img">
                {m.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sized(m.image_url, 300)!} alt="" loading="lazy" />
                )}
              </div>
              <div className="order-item-body">
                <h3>{m.name}</h3>
                <p className="order-item-desc">{m.description}</p>
                <p className="order-item-price">
                  {charged < pub ? (
                    <>
                      <s>{peso(pub)}</s> <span className="member-price">{peso(charged)}</span>
                    </>
                  ) : (
                    peso(pub)
                  )}
                </p>
              </div>
              <div className="qty">
                {qty > 0 ? (
                  <>
                    <button type="button" aria-label={`Remove one ${m.name}`} onClick={() => setQty(m.id, qty - 1)}>−</button>
                    <span aria-live="polite">{qty}</span>
                    <button type="button" aria-label={`Add one ${m.name}`} onClick={() => setQty(m.id, qty + 1)}>+</button>
                  </>
                ) : (
                  <button type="button" className="qty-add" onClick={() => setQty(m.id, 1)}>Add</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <form id="checkout" className="checkout card" onSubmit={submit}>
        <h2 className="display display--sm">Your order</h2>

        {lines.length === 0 ? (
          <p className="muted">Your cart is empty. Add something tasty.</p>
        ) : (
          <ul className="cart-lines">
            {lines.map(({ m, qty }) => (
              <li key={m.id}>
                <span>{qty} × {m.name}</span>
                <span>{peso(chargedOf(m) * qty)}</span>
              </li>
            ))}
          </ul>
        )}

        <fieldset className="member-box">
          <label className="check">
            <input
              type="checkbox"
              checked={isMemberMode}
              onChange={(e) => {
                setMemberMode(e.target.checked);
                if (!e.target.checked) clearMember();
              }}
            />
            I&apos;m a registered customer
          </label>
          {isMemberMode && (
            <div className="member-fields">
              {member ? (
                <p className="ok">
                  ✓ Member prices applied for <b>{member.name}</b>.{" "}
                  <button type="button" className="link" onClick={clearMember}>Change</button>
                </p>
              ) : (
                <>
                  <input type="email" placeholder="Registered email" autoComplete="email" value={mEmail} onChange={(e) => setMEmail(e.target.value)} />
                  <input type="password" inputMode="numeric" placeholder="Passcode" autoComplete="current-password" value={mPass} onChange={(e) => setMPass(e.target.value)} />
                  <button type="button" className="btn btn--teal" onClick={applyMember} disabled={checking || !mEmail || !mPass}>
                    {checking ? "Checking…" : "Apply"}
                  </button>
                  {memberMsg && <p className="err">{memberMsg}</p>}
                </>
              )}
            </div>
          )}
        </fieldset>

        <div className="fields">
          <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" /></label>
          <label>Mobile number<input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" placeholder="09xx xxx xxxx" /></label>
          {!member && (
            <label>Email (for your receipt)<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>
          )}
          <div className="seg" role="radiogroup" aria-label="How will you get your order?">
            {[
              ["dine_in", "Dine in"],
              ["pickup", "Pick up"],
              ["ride_thru", "Ride thru"],
            ].map(([v, l]) => (
              <label key={v} className={form.fulfillment === v ? "on" : ""}>
                <input type="radio" name="fulfillment" value={v} checked={form.fulfillment === v} onChange={() => setForm({ ...form, fulfillment: v })} />
                {l}
              </label>
            ))}
          </div>
          <label>Notes (optional)<textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="No lettuce, extra Lakwanaise, ETA…" /></label>
        </div>

        <dl className="totals">
          <div><dt>Subtotal</dt><dd>{peso(subtotal)}</dd></div>
          {subtotal !== total && <div className="disc"><dt>Member discount</dt><dd>−{peso(subtotal - total)}</dd></div>}
          <div className="grand"><dt>Total</dt><dd>{peso(total)}</dd></div>
        </dl>

        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn btn--red btn--block" disabled={!enabled || placing || lines.length === 0 || (isMemberMode && !member)}>
          {placing ? "Placing order…" : "Checkout · Pay with GCash"}
        </button>
        {isMemberMode && !member && <p className="muted small">Apply your member details first, or untick the box to order as a guest.</p>}
        {!enabled && <p className="muted small">Online ordering isn&apos;t open yet — please call (0931) 154-9766.</p>}
      </form>

      {count > 0 && (
        <a href="#checkout" className="cart-bar">
          <span>{count} item{count > 1 ? "s" : ""}</span>
          <b>Checkout · {peso(total)}</b>
        </a>
      )}
    </div>
  );
}
