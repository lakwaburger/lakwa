# Lakwa Burger Cafe

Standalone ordering site for the Lakwa Burger Cafe (El Nido, Palawan), rebuilt from
<https://lakwamotorcycles.com/burger-cafe>. Next.js 16 (App Router) + Supabase.

## What it does

| Who | Page | What |
|---|---|---|
| Public | `/` | Homepage (replica of the Squarespace page) with live menu prices |
| Public | `/order` | Cart + checkout. Guests pay the public price. Registered customers tick “I'm a registered customer”, enter email + passcode, and their member price is applied automatically. |
| Public | `/order/[id]?t=…` | Order receipt/tracker + GCash payment: pay, then upload receipt screenshot + 13-digit reference no. |
| Members | `/orders` | Order history (email + passcode) |
| Staff | `/staff` | Orders by status, search, date range — full order history |
| Staff | `/staff/orders/[id]` | Order detail, verify/reject GCash payment, move order through Paid → Preparing → Ready → Completed |
| Staff | `/staff/payments` | Paste a GCash reference no. from the cafe's GCash history to find the matching order; queue of payments to check |
| Staff | `/staff/customers` | Register customers (6-digit passcode is generated and emailed), new passcode, disable, unlock, extra discount % |
| Admin | `/staff/menu` | Base prices, items, availability |
| Admin | `/staff/settings` | Price increase %, GCash name/number/QR, open/close online ordering |

### Pricing

- **Base price** = the price before the increase (Cheese ₱249 is real; Bacon Cheese ₱289, Crispy Chicken ₱269, Mozzarella Fingers ₱189 are stand-ins — change them in `/staff/menu`).
- **Public price** = base + 20%, rounded up to the peso (₱249 → ₱299).
- **Registered customers** pay the base price, so they don't feel the increase. Staff can give an individual an extra % off.
- Prices are always recalculated on the server; the browser can't change them.

### GCash payment matching

1. Customer sends the exact total via GCash and uploads the receipt + reference no.
2. The site rejects a reference that's not 13 digits or already used on another order (also enforced by a unique index).
3. Staff opens `/staff/payments`, pastes the ref no. from the cafe's GCash transaction history, and sees the order with checks: ✓ 13 digits, ✓ amount = order total, ✓ not used elsewhere, plus the screenshot.
4. **Verify** → order becomes *Paid* and the customer is emailed. **Reject** → customer is emailed and can re-upload.

Receipts are stored in a private Supabase Storage bucket and only shown to staff through short-lived links.

## Setup

1. **Supabase** → create a project, then in **SQL Editor** run, in order:
   - `supabase/migrations/20261101000000_init.sql`
   - `supabase/seed.sql`
2. **First staff/admin account**: Supabase → Authentication → Users → *Add user* (email + password, auto-confirm). Then in SQL Editor:
   ```sql
   insert into public.staff (user_id, full_name, role)
   select id, 'Your Name', 'admin' from auth.users where email = 'you@example.com';
   ```
   Add more staff the same way with `role = 'staff'` (staff can't edit menu/settings).
3. **Email** (for passcodes + order emails): create a free [Resend](https://resend.com) account, verify your domain, set `RESEND_API_KEY` and `EMAIL_FROM`. Until then, staff see each new passcode on screen to share manually.
4. Copy `.env.example` → `.env.local` and fill in the values.
5. `npm install && npm run dev` → <http://localhost:3000>, staff at `/staff`.
6. Set your GCash name/number (and QR image URL) in `/staff/settings`.

### Deploy (Vercel)

Import the GitHub repo in Vercel, add the same env vars (set `SITE_URL` to the live URL), deploy.

## Security notes

- The anon key can only read the menu and settings (RLS). Customers, orders and payments are only reachable from the server with the service-role key — keep `SUPABASE_SERVICE_ROLE_KEY` out of the browser and out of git.
- Passcodes are stored as bcrypt hashes; 5 wrong tries lock that customer for 15 minutes (staff can unlock).
- Emailing passcodes in plain text is convenient but means anyone with access to that inbox can use it. Staff can issue a new passcode anytime.

## Merging into lakwamotorcycles.com later

- Set `basePath: "/burger-cafe"` in `next.config.ts`, or move the routes under `app/burger-cafe/` in the main site.
- In `lib/site.ts`, set `MAIN_SITE = ""` so nav links become internal.
- Images still load from the Squarespace CDN; move them to `public/` or Supabase Storage before leaving Squarespace.
