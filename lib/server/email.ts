import "server-only";
import { siteUrl } from "./admin";
import { peso } from "@/lib/pricing";

/**
 * Sends email through Resend (https://resend.com) when RESEND_API_KEY is set.
 * Returns { sent: false } instead of throwing so callers can fall back
 * (e.g. staff sees the passcode on screen and shares it manually).
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Lakwa Burger Cafe <onboarding@resend.dev>";
  if (!key) return { sent: false, error: "Email isn't configured (RESEND_API_KEY missing)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) return { sent: false, error: `Email provider error ${res.status}: ${await res.text()}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "Email failed" };
  }
}

const wrap = (body: string) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1a1e1f">
  <div style="background:#b10b0e;color:#e5e1d7;padding:18px 24px;font-weight:bold;font-size:20px">LAKWA Burger Cafe</div>
  <div style="padding:24px;background:#ffffff;border:1px solid #eee">${body}</div>
  <p style="font-size:12px;color:#777;padding:12px 24px">Kalye Artisano, Lio Estate, Villa Libertad, El Nido, Palawan · (0931) 154-9766</p>
</div>`;

export function passcodeEmail(name: string, email: string, passcode: string, isReset: boolean) {
  return {
    subject: isReset ? "Your new Lakwa Burger Cafe passcode" : "You're registered at Lakwa Burger Cafe",
    html: wrap(`
      <p>Hi ${escapeHtml(name)},</p>
      <p>${isReset ? "Here is your new passcode." : "You've been registered for member pricing at the Lakwa Burger Cafe."}
      When you order online, enter these details at checkout and your member price is applied automatically.</p>
      <table style="margin:16px 0;font-size:16px">
        <tr><td style="padding:4px 12px 4px 0;color:#555">Email</td><td><b>${escapeHtml(email)}</b></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Passcode</td><td><b style="font-size:22px;letter-spacing:3px">${passcode}</b></td></tr>
      </table>
      <p><a href="${siteUrl()}/order" style="background:#b10b0e;color:#e5e1d7;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:bold">Order now</a></p>
      <p style="color:#555;font-size:13px">Keep this email. Don't share your passcode — staff will never ask for it.</p>`),
  };
}

export function orderEmail(order: { order_no: string; total: number; id: string; access_token: string; customer_name: string }) {
  const link = `${siteUrl()}/order/${order.id}?t=${order.access_token}`;
  return {
    subject: `Order ${order.order_no} received — pay ${peso(order.total)} via GCash`,
    html: wrap(`
      <p>Hi ${escapeHtml(order.customer_name)}, thanks for your order <b>${order.order_no}</b>.</p>
      <p>Total: <b>${peso(order.total)}</b></p>
      <p>Pay with GCash, then upload your receipt and reference number on your order page:</p>
      <p><a href="${link}" style="background:#b10b0e;color:#e5e1d7;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:bold">View order &amp; pay</a></p>
      <p style="color:#555;font-size:13px">Keep this link — it's how you check your order status.</p>`),
  };
}

export function paymentStatusEmail(order: { order_no: string; id: string; access_token: string; customer_name: string }, verified: boolean, note?: string) {
  const link = `${siteUrl()}/order/${order.id}?t=${order.access_token}`;
  return {
    subject: verified ? `Payment confirmed — order ${order.order_no}` : `Payment issue — order ${order.order_no}`,
    html: wrap(
      verified
        ? `<p>Hi ${escapeHtml(order.customer_name)}, your GCash payment for <b>${order.order_no}</b> is confirmed. We're on it!</p><p><a href="${link}">Track your order</a></p>`
        : `<p>Hi ${escapeHtml(order.customer_name)}, we couldn't match your GCash payment for <b>${order.order_no}</b>.</p>${note ? `<p>Note from staff: ${escapeHtml(note)}</p>` : ""}<p>Please re-upload your receipt here: <a href="${link}">${link}</a></p>`,
    ),
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
