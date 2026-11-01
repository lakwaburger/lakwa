"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin";
import { requireStaff, staffSupabase } from "@/lib/server/staff-auth";
import { generatePasscode, hashPasscode, normalizeEmail } from "@/lib/server/customers";
import { sendEmail, passcodeEmail, paymentStatusEmail } from "@/lib/server/email";

// ------------------------------------------------------------------ auth
export async function signIn(_prev: { error?: string } | null, form: FormData) {
  const supabase = await staffSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") || "").trim(),
    password: String(form.get("password") || ""),
  });
  if (error) return { error: "Wrong email or password." };
  redirect("/staff");
}

export async function signOut() {
  const supabase = await staffSupabase();
  await supabase.auth.signOut();
  redirect("/staff/login");
}

// ------------------------------------------------------------------ orders & payments
const ORDER_STATUSES = ["awaiting_payment", "payment_submitted", "paid", "preparing", "ready", "completed", "cancelled"];

export async function setOrderStatus(form: FormData) {
  await requireStaff();
  const id = String(form.get("order_id"));
  const status = String(form.get("status"));
  if (!ORDER_STATUSES.includes(status)) return;
  await requireAdmin().from("orders").update({ status }).eq("id", id);
  revalidatePath(`/staff/orders/${id}`);
  revalidatePath("/staff");
}

export async function reviewPayment(form: FormData) {
  const staff = await requireStaff();
  const db = requireAdmin();
  const paymentId = String(form.get("payment_id"));
  const decision = String(form.get("decision")); // verify | reject
  const note = String(form.get("note") || "").trim() || null;

  const { data: p } = await db.from("payments").select("id, order_id, status").eq("id", paymentId).single();
  if (!p || p.status !== "submitted") return;

  const verified = decision === "verify";
  const reviewNote = note ?? (verified ? null : "We couldn't find this reference number and amount in our GCash history.");
  await db
    .from("payments")
    .update({ status: verified ? "verified" : "rejected", review_note: reviewNote, reviewed_by: staff.user_id, reviewed_at: new Date().toISOString() })
    .eq("id", p.id);

  const { data: order } = await db
    .from("orders")
    .update({ status: verified ? "paid" : "awaiting_payment" })
    .eq("id", p.order_id)
    .select("id, order_no, access_token, customer_name, email")
    .single();

  if (order) {
    const mail = paymentStatusEmail(order, verified, reviewNote ?? undefined);
    await sendEmail(order.email, mail.subject, mail.html);
  }
  revalidatePath(`/staff/orders/${p.order_id}`);
  revalidatePath("/staff/payments");
  revalidatePath("/staff");
}

// ------------------------------------------------------------------ registered customers
export type CreateCustomerState =
  | { ok: true; email: string; name: string; passcode: string; emailed: boolean; emailError?: string }
  | { ok: false; error: string }
  | null;

export async function createCustomer(_prev: CreateCustomerState, form: FormData): Promise<CreateCustomerState> {
  const staff = await requireStaff();
  const db = requireAdmin();
  const email = normalizeEmail(String(form.get("email") || ""));
  const full_name = String(form.get("full_name") || "").trim();
  const phone = String(form.get("phone") || "").trim() || null;
  const notes = String(form.get("notes") || "").trim() || null;
  const extra = Math.max(0, Math.min(100, Number(form.get("extra_discount_pct") || 0) || 0));

  if (!full_name) return { ok: false, error: "Name is required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email." };

  const passcode = generatePasscode();
  const { error } = await db.from("customers").insert({
    email,
    full_name,
    phone,
    notes,
    extra_discount_pct: extra,
    passcode_hash: await hashPasscode(passcode),
    created_by: staff.user_id,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That email is already registered. Use “New passcode” on their row instead." };
    return { ok: false, error: error.message };
  }

  const mail = passcodeEmail(full_name, email, passcode, false);
  const sent = await sendEmail(email, mail.subject, mail.html);
  if (sent.sent) await db.from("customers").update({ passcode_sent_at: new Date().toISOString() }).eq("email", email);
  revalidatePath("/staff/customers");
  return { ok: true, email, name: full_name, passcode, emailed: sent.sent, emailError: sent.error };
}

export async function resetPasscode(_prev: CreateCustomerState, form: FormData): Promise<CreateCustomerState> {
  await requireStaff();
  const db = requireAdmin();
  const id = String(form.get("customer_id"));
  const { data: c } = await db.from("customers").select("email, full_name").eq("id", id).single();
  if (!c) return { ok: false, error: "Customer not found." };
  const passcode = generatePasscode();
  await db
    .from("customers")
    .update({ passcode_hash: await hashPasscode(passcode), failed_attempts: 0, locked_until: null })
    .eq("id", id);
  const mail = passcodeEmail(c.full_name, c.email, passcode, true);
  const sent = await sendEmail(c.email, mail.subject, mail.html);
  if (sent.sent) await db.from("customers").update({ passcode_sent_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/staff/customers");
  return { ok: true, email: c.email, name: c.full_name, passcode, emailed: sent.sent, emailError: sent.error };
}

export async function updateCustomer(form: FormData) {
  await requireStaff();
  const id = String(form.get("customer_id"));
  const patch: Record<string, unknown> = {};
  if (form.has("is_active")) patch.is_active = form.get("is_active") === "true";
  if (form.has("extra_discount_pct")) patch.extra_discount_pct = Math.max(0, Math.min(100, Number(form.get("extra_discount_pct")) || 0));
  if (form.get("unlock") === "true") Object.assign(patch, { failed_attempts: 0, locked_until: null });
  await requireAdmin().from("customers").update(patch).eq("id", id);
  revalidatePath("/staff/customers");
}

// ------------------------------------------------------------------ menu (admin)
export async function saveMenuItem(form: FormData) {
  await requireStaff({ admin: true });
  const id = String(form.get("id") || "");
  const row = {
    name: String(form.get("name") || "").trim(),
    description: String(form.get("description") || "").trim(),
    base_price: Math.max(0, Number(form.get("base_price")) || 0),
    category: String(form.get("category") || "Burgers").trim(),
    sort_order: Number(form.get("sort_order")) || 0,
    image_url: String(form.get("image_url") || "").trim() || null,
    is_available: form.get("is_available") === "on",
  };
  if (!row.name) return;
  const db = requireAdmin();
  if (id) await db.from("menu_items").update(row).eq("id", id);
  else
    await db.from("menu_items").insert({
      ...row,
      slug: row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36),
    });
  revalidatePath("/staff/menu");
  revalidatePath("/");
  revalidatePath("/order");
}

// ------------------------------------------------------------------ settings (admin)
export async function saveSettings(form: FormData) {
  await requireStaff({ admin: true });
  await requireAdmin()
    .from("settings")
    .update({
      markup_pct: Math.max(0, Math.min(200, Number(form.get("markup_pct")) || 0)),
      gcash_name: String(form.get("gcash_name") || "").trim(),
      gcash_number: String(form.get("gcash_number") || "").trim(),
      gcash_qr_url: String(form.get("gcash_qr_url") || "").trim() || null,
      accepting_orders: form.get("accepting_orders") === "on",
    })
    .eq("id", 1);
  revalidatePath("/", "layout");
}
