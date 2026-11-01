"use server";

import { randomUUID } from "crypto";
import { requireAdmin, getAdmin } from "@/lib/server/admin";
import { verifyMember, normalizeEmail } from "@/lib/server/customers";
import { sendEmail, orderEmail } from "@/lib/server/email";
import { priceOrder, memberPrice } from "@/lib/pricing";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

async function loadMenuAndSettings() {
  const db = requireAdmin();
  const [menu, settings] = await Promise.all([
    db.from("menu_items").select("id, name, base_price, is_available"),
    db.from("settings").select("markup_pct, accepting_orders").eq("id", 1).single(),
  ]);
  if (menu.error) throw new Error(menu.error.message);
  if (settings.error) throw new Error(settings.error.message);
  return {
    menu: new Map(menu.data.map((m) => [m.id as string, { ...m, base_price: Number(m.base_price) }])),
    markup: Number(settings.data.markup_pct),
    accepting: settings.data.accepting_orders as boolean,
  };
}

/** Checkout "Apply member price" button. */
export async function checkMember(
  email: string,
  passcode: string,
): Promise<Result<{ name: string; phone: string | null; prices: Record<string, number> }>> {
  if (!getAdmin()) return { ok: false, error: "Ordering isn't set up yet." };
  const v = await verifyMember(email, passcode);
  if (!v.ok) return v;
  const { menu } = await loadMenuAndSettings();
  const prices: Record<string, number> = {};
  menu.forEach((m, id) => (prices[id] = memberPrice(m.base_price, v.member.extra_discount_pct)));
  return { ok: true, name: v.member.full_name, phone: v.member.phone, prices };
}

export type PlaceOrderInput = {
  items: { id: string; qty: number }[];
  name: string;
  phone: string;
  email: string;
  fulfillment: "dine_in" | "pickup" | "ride_thru";
  notes?: string;
  member?: { email: string; passcode: string } | null;
};

export async function placeOrder(input: PlaceOrderInput): Promise<Result<{ id: string; token: string }>> {
  try {
    if (!getAdmin()) return { ok: false, error: "Online ordering isn't set up yet. Please call us to order." };

    const name = input.name?.trim();
    const phone = input.phone?.trim();
    let email = normalizeEmail(input.email || "");
    if (!name || !phone) return { ok: false, error: "Please enter your name and mobile number." };
    if (!["dine_in", "pickup", "ride_thru"].includes(input.fulfillment)) return { ok: false, error: "Choose dine in, pick up or ride thru." };

    const qtyById = new Map<string, number>();
    for (const it of input.items || []) {
      const q = Math.floor(Number(it.qty));
      if (q > 0) qtyById.set(it.id, Math.min(50, (qtyById.get(it.id) || 0) + q));
    }
    if (!qtyById.size) return { ok: false, error: "Your cart is empty." };

    const { menu, markup, accepting } = await loadMenuAndSettings();
    if (!accepting) return { ok: false, error: "We're not taking online orders right now. Please call us." };

    const lines = [];
    for (const [id, qty] of qtyById) {
      const m = menu.get(id);
      if (!m || !m.is_available) return { ok: false, error: "An item in your cart is no longer available. Please refresh." };
      lines.push({ menu_item_id: id, name: m.name as string, base_price: m.base_price, qty });
    }

    // Member pricing is decided here, on the server — never trusted from the browser.
    let member = null;
    if (input.member?.email && input.member?.passcode) {
      const v = await verifyMember(input.member.email, input.member.passcode);
      if (!v.ok) return v;
      member = v.member;
      email = member.email;
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Please enter a valid email for your receipt." };

    const priced = priceOrder(lines, markup, member);
    const db = requireAdmin();
    const { data: order, error } = await db
      .from("orders")
      .insert({
        customer_id: member?.id ?? null,
        is_member: !!member,
        customer_name: name,
        email,
        phone,
        fulfillment: input.fulfillment,
        notes: input.notes?.trim().slice(0, 500) || null,
        subtotal: priced.subtotal,
        discount: priced.discount,
        total: priced.total,
        markup_pct: markup,
      })
      .select("id, order_no, access_token, total, customer_name")
      .single();
    if (error) throw new Error(error.message);

    const { error: itemsErr } = await db
      .from("order_items")
      .insert(priced.lines.map((l) => ({ ...l, order_id: order.id })));
    if (itemsErr) {
      await db.from("orders").delete().eq("id", order.id);
      throw new Error(itemsErr.message);
    }

    const mail = orderEmail({ ...order, total: Number(order.total) });
    await sendEmail(email, mail.subject, mail.html);

    return { ok: true, id: order.id, token: order.access_token };
  } catch (e) {
    console.error("[placeOrder]", e);
    return { ok: false, error: "Something went wrong placing your order. Please try again." };
  }
}

export type PaymentState = { ok?: boolean; error?: string } | null;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

/** Customer uploads GCash receipt + reference number. */
export async function submitPayment(_prev: PaymentState, form: FormData): Promise<PaymentState> {
  try {
    const db = requireAdmin();
    const orderId = String(form.get("order_id") || "");
    const token = String(form.get("token") || "");
    const ref = String(form.get("gcash_ref") || "").replace(/\D/g, "");
    const amount = Number(String(form.get("amount") || "").replace(/[^\d.]/g, ""));
    const senderName = String(form.get("sender_name") || "").trim() || null;
    const senderNumber = String(form.get("sender_number") || "").replace(/[^\d+]/g, "") || null;
    const file = form.get("proof");

    const { data: order } = await db.from("orders").select("id, status, total, access_token").eq("id", orderId).maybeSingle();
    if (!order || order.access_token !== token) return { error: "Order not found." };
    if (!["awaiting_payment", "payment_submitted"].includes(order.status))
      return { error: "This order isn't waiting for payment." };

    if (ref.length !== 13) return { error: "The GCash reference number has 13 digits — please check your receipt." };
    if (!amount || amount <= 0) return { error: "Enter the amount you sent." };
    if (!(file instanceof File) || file.size === 0) return { error: "Please attach a screenshot of your GCash receipt." };
    if (file.size > 6 * 1024 * 1024) return { error: "Screenshot is too large (max 6 MB)." };
    if (!ALLOWED.includes(file.type)) return { error: "Upload a JPG, PNG, WEBP, HEIC or PDF." };

    // Duplicate reference check (also enforced by a unique index).
    const { data: dupe } = await db.from("payments").select("id, order_id").eq("gcash_ref", ref).neq("status", "rejected").maybeSingle();
    if (dupe) return { error: "That GCash reference number was already used for an order. Please check it again." };

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
    const path = `${order.id}/${randomUUID()}.${ext}`;
    const up = await db.storage.from("payment-proofs").upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) throw new Error(up.error.message);

    const { error } = await db.from("payments").insert({
      order_id: order.id,
      gcash_ref: ref,
      amount,
      sender_name: senderName,
      sender_number: senderNumber,
      proof_path: path,
    });
    if (error) {
      await db.storage.from("payment-proofs").remove([path]);
      if (error.code === "23505") return { error: "That GCash reference number was already used for an order." };
      throw new Error(error.message);
    }

    await db.from("orders").update({ status: "payment_submitted" }).eq("id", order.id);
    return { ok: true };
  } catch (e) {
    console.error("[submitPayment]", e);
    return { error: "Upload failed. Please try again." };
  }
}

export type HistoryState =
  | {
      error?: string;
      name?: string;
      orders?: { id: string; order_no: string; access_token: string; created_at: string; total: number; status: string; fulfillment: string }[];
    }
  | null;

/** Registered customers look up their order history with email + passcode. */
export async function lookupOrders(_prev: HistoryState, form: FormData): Promise<HistoryState> {
  if (!getAdmin()) return { error: "Ordering isn't set up yet." };
  const v = await verifyMember(String(form.get("email") || ""), String(form.get("passcode") || ""));
  if (!v.ok) return { error: v.error };
  const { data } = await requireAdmin()
    .from("orders")
    .select("id, order_no, access_token, created_at, total, status, fulfillment")
    .eq("email", v.member.email) // member orders always use the registered email
    .order("created_at", { ascending: false })
    .limit(100);
  return { name: v.member.full_name, orders: (data || []).map((o) => ({ ...o, total: Number(o.total) })) };
}
