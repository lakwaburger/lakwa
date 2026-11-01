// Lakwa Burger Cafe — send-email Edge Function.
// Called by the database (private.send_email via pg_net) to send one email through Gmail SMTP.
//
// Deploy with "Verify JWT" OFF (the database authenticates with x-hook-secret instead).
// Secrets (Edge Functions → Secrets):
//   GMAIL_USER          migquesada@gmail.com
//   GMAIL_APP_PASSWORD  16-character Google App Password (not the normal Gmail password)
//   EMAIL_HOOK_SECRET   value of: select value from private.secrets where key = 'email_hook_secret';
//   EMAIL_FROM_NAME     optional, default "Lakwa Burger Cafe"
import nodemailer from "npm:nodemailer@6.9.16";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;

function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d)>/gi, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function smtp() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: env("GMAIL_USER"), pass: env("GMAIL_APP_PASSWORD").replace(/\s/g, "") },
    });
  }
  return transport;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = env("EMAIL_HOOK_SECRET");
  if (!secret || req.headers.get("x-hook-secret") !== secret) return new Response("Forbidden", { status: 403 });

  let body: { to?: string; subject?: string; html?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const { to, subject, html } = body;
  if (!to || !subject || !html || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return new Response("Missing fields", { status: 400 });

  const user = env("GMAIL_USER");
  try {
    const info = await smtp().sendMail({
      from: `${env("EMAIL_FROM_NAME", "Lakwa Burger Cafe")} <${user}>`,
      replyTo: user,
      to,
      subject,
      html,
      text: htmlToText(html),
    });
    return Response.json({ ok: true, id: info.messageId });
  } catch (e) {
    console.error("send failed", e);
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
});
