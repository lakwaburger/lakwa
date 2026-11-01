# Lakwa Burger Cafe — website

Static site (HTML/CSS/JS) on GitHub Pages + Supabase (project **lakwa**, ref `hwkydsigfcgbyiyukzbr`, account migquesada).
Rebuilt from https://lakwamotorcycles.com/burger-cafe. Live at https://migquesada.github.io/lakwa/

## Structure
```
_build/build.py       Page templates + facts (address, phone, menu fallback, BASE path). Run: python3 _build/build.py
index.html            Homepage (menu prices load live from Supabase)
order/                Cart + checkout (guest or registered customer)
order/view/           Order receipt / tracker + GCash receipt upload  (?id=…&t=…)
orders/               Order history for Each School Community members (email + passcode)
community/            Request to join Each School Community (staff approve → passcode emailed)
staff/                Staff dashboard (email + password login)
assets/               css/site.css, js/config.js (publishable key), js/*.js
supabase/migrations/  Database schema + functions (run in order in the SQL Editor)
supabase/seed.sql     Starting menu
```
Generated pages are committed. After editing `_build/build.py`, run the build and upload the changed files.

## Pricing
- Each menu item has a **base price** = the price before the increase (what registered customers pay).
  Cheese ₱249 is real; Bacon Cheese ₱289, Crispy Chicken ₱269, Mozzarella Fingers ₱189 are stand-ins — edit in Staff → Menu & prices.
- **Public price** = base + 20% (Staff → Settings), rounded up to the peso: ₱249 → ₱299.
- **Registered customers** tick "I'm a registered customer" at checkout and enter email + passcode → they pay the base price
  (optionally an extra % off, set per customer).
- Totals are always calculated in the database (`place_order`), never trusted from the browser.

## Each School Community (members)
- Guests request to join at `/community/` (name, email, mobile, optional note). They get a "we got your request" email;
  `staff_notify_email` (private.secrets, default migquesada@gmail.com) gets an alert.
- Staff → **Each School Community** → Requests: **Approve** (optional extra %) creates the member, generates a 6-digit passcode
  and emails it; **Decline** emails a polite note. Staff can also add members directly.
- Members tick "I'm an Each School Community member" at checkout → original (pre-increase) prices.

## Ordering & GCash
1. Customer orders → gets an order page link (also emailed).
2. Pays the exact total by GCash, uploads the receipt screenshot + 13-digit reference no.
   Uploads go to the private `payment-proofs` bucket, only into that order's own folder.
3. Staff → **Payments**: paste the reference no. from the cafe's GCash history → see the matching order with checks
   (13 digits ✓, amount = total ✓, ref not used on another order ✓) and the screenshot → **Verify** or **Reject**.
   The customer is emailed either way. The same reference can never be accepted twice.
4. Staff moves the order: Paid → Preparing → Ready → Completed. Orders tab = full history (filters, search, dates).

## Data / security
Visitors only read the menu + settings and call validated database functions:
`check_member`, `place_order`, `get_order`, `submit_payment`, `lookup_orders`, `request_membership`.
Staff (rows in `staff`, Supabase Auth email + password) read/update orders, payments and customers through RLS, and call
`create_customer`, `reset_passcode`, `review_payment`, `approve_membership`, `decline_membership`. Admins also edit the menu and settings. Passcode hashes are never readable.
Customer passcodes: 6 digits, bcrypt-hashed, 5 wrong tries = 15-minute lock (staff can unlock).

Staff: Nanni (nanni@staff.local) and Miguel (miguel@staff.local), both admin. Add more:
```sql
insert into public.staff (user_id, full_name, role)
select id, 'Name', 'staff' from auth.users where email = 'name@staff.local';
```

## Email (Gmail, for testing)
Emails (passcodes, order received, payment confirmed/rejected) are queued by the database (`pg_net`) to the
Edge Function `send-email` (`supabase/functions/send-email/index.ts`), which sends through Gmail SMTP as
**migquesada@gmail.com**. Gmail allows ~500 emails/day — fine for testing; move to a domain sender before launch.
Until email is switched on, staff see each new passcode on screen to share themselves.

To switch on:
1. Google Account → Security → 2-Step Verification (on) → **App passwords** → create one ("Lakwa").
2. Supabase → Edge Functions → create `send-email`, paste the code, **Verify JWT off**, Deploy.
3. Edge Functions → Secrets: `GMAIL_USER` = migquesada@gmail.com, `GMAIL_APP_PASSWORD` = the app password,
   `EMAIL_HOOK_SECRET` = result of `select value from private.secrets where key = 'email_hook_secret';`
4. SQL Editor: `insert into private.secrets values ('email_enabled','true') on conflict (key) do update set value = 'true';`

## Deploying changes
Claude prepares `~/Sites/lakwa-upload-N` (same paths as the repo) → upload to GitHub (Add file → Upload files).
SQL: Claude loads it into the Supabase SQL Editor → you click **Run**.

## Going live on a domain / merging into lakwamotorcycles.com
1. In `_build/build.py` set `BASE` (e.g. `""` for its own domain), and `base` in `assets/js/config.js`; rebuild.
2. Update `site_url` in `private.secrets` so email links point to the new address.
3. Images still load from the Squarespace CDN; move them into `assets/img/` before leaving Squarespace.
