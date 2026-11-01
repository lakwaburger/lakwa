-- ============================================================================
-- Lakwa Burger Cafe — backend logic for the static (GitHub Pages) site.
-- Run AFTER 20261101000000_init.sql. Safe to re-run.
--
-- The site has no server, so everything that must be trusted runs here:
--   * public RPCs (anon):  check_member, place_order, get_order, submit_payment, lookup_orders
--   * staff RPCs:          create_customer, reset_passcode, review_payment
--   * RLS policies give signed-in staff read/update access to orders, payments, customers
--   * emails are queued from the database (pg_net) to the send-email Edge Function (Gmail SMTP)
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- private schema (not exposed by the API)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Settings for email. Emails go through the Edge Function "send-email" (Gmail SMTP).
-- email_hook_secret is generated here; copy it into the function's secret EMAIL_HOOK_SECRET:
--   select value from private.secrets where key = 'email_hook_secret';
create table if not exists private.secrets (key text primary key, value text not null);
insert into private.secrets values
  ('email_hook_secret', encode(extensions.gen_random_bytes(24), 'hex')),
  ('email_function_url', 'https://hwkydsigfcgbyiyukzbr.supabase.co/functions/v1/send-email'),
  ('site_url', 'https://migquesada.github.io/lakwa')
on conflict (key) do nothing;

create or replace function private.secret(k text) returns text
language sql stable security definer set search_path = '' as $$
  select value from private.secrets where key = k
$$;

create or replace function private.esc(s text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(coalesce(s, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

create or replace function private.peso(n numeric) returns text
language sql immutable set search_path = '' as $$
  select '₱' || to_char(n, 'FM999,999,990') || case when n <> trunc(n) then to_char(n - trunc(n), 'FM.00') else '' end
$$;

create or replace function private.site_url() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(private.secret('site_url'), ''), 'https://migquesada.github.io/lakwa')
$$;

-- Queues an email through the "send-email" Edge Function (Gmail SMTP). Returns false if not set up.
create or replace function private.send_email(p_to text, p_subject text, p_body text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  hook text := private.secret('email_hook_secret');
  url text := private.secret('email_function_url');
  html text;
begin
  if coalesce(hook, '') = '' or coalesce(url, '') = '' or coalesce(private.secret('email_enabled'), 'false') <> 'true' then
    return false;
  end if;
  html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1a1e1f">'
       || '<div style="background:#b10b0e;color:#e5e1d7;padding:18px 24px;font-weight:bold;font-size:20px">LAKWA Burger Cafe</div>'
       || '<div style="padding:24px;background:#ffffff;border:1px solid #eee">' || p_body || '</div>'
       || '<p style="font-size:12px;color:#777;padding:12px 24px">Kalye Artisano, Lio Estate, Villa Libertad, El Nido, Palawan · (0931) 154-9766</p></div>';
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('x-hook-secret', hook, 'Content-Type', 'application/json'),
    body := jsonb_build_object('to', p_to, 'subject', p_subject, 'html', html)
  );
  return true;
end $$;

create or replace function private.button(href text, label text) returns text
language sql immutable set search_path = '' as $$
  select '<p><a href="' || href || '" style="background:#b10b0e;color:#e5e1d7;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">' || label || '</a></p>'
$$;

-- ---------------------------------------------------------------- pricing (mirrors lib/pricing.ts)
create or replace function public.public_price(base numeric, markup numeric) returns numeric
language sql immutable set search_path = '' as $$ select ceil(round(base * (1 + markup / 100), 2)) $$;

create or replace function public.member_price(base numeric, extra numeric) returns numeric
language sql immutable set search_path = '' as $$ select round(base * (1 - coalesce(extra, 0) / 100)) $$;

-- ---------------------------------------------------------------- roles
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'admin')
$$;

-- ---------------------------------------------------------------- member check (with lockout)
-- Returns {"ok":true, id, email, full_name, phone, extra} or {"ok":false,"error":...}.
-- Never raises, so the failed-attempt counter is saved.
create or replace function private.verify_member(p_email text, p_passcode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.customers;
  n int;
  generic text := 'That email and passcode don''t match a registered customer.';
begin
  if coalesce(trim(p_email), '') = '' or coalesce(trim(p_passcode), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter your registered email and passcode.');
  end if;
  select * into c from public.customers where lower(email::text) = lower(trim(p_email));
  if not found or not c.is_active then
    return jsonb_build_object('ok', false, 'error', generic);
  end if;
  if c.locked_until is not null and c.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Too many attempts. Try again in 15 minutes or ask staff to unlock you.');
  end if;
  if c.passcode_hash <> extensions.crypt(trim(p_passcode), c.passcode_hash) then
    n := c.failed_attempts + 1;
    update public.customers
       set failed_attempts = case when n >= 5 then 0 else n end,
           locked_until   = case when n >= 5 then now() + interval '15 minutes' else null end
     where id = c.id;
    return jsonb_build_object('ok', false, 'error', generic);
  end if;
  if c.failed_attempts > 0 then
    update public.customers set failed_attempts = 0, locked_until = null where id = c.id;
  end if;
  return jsonb_build_object('ok', true, 'id', c.id, 'email', c.email::text, 'full_name', c.full_name,
                            'phone', c.phone, 'extra', c.extra_discount_pct);
end $$;

-- ---------------------------------------------------------------- PUBLIC RPCs
create or replace function public.check_member(p_email text, p_passcode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  v := private.verify_member(p_email, p_passcode);
  if not (v->>'ok')::boolean then return v; end if;
  return jsonb_build_object(
    'ok', true, 'name', v->>'full_name', 'phone', v->>'phone',
    'prices', coalesce((select jsonb_object_agg(id, public.member_price(base_price, (v->>'extra')::numeric))
                        from public.menu_items where is_available), '{}'::jsonb));
end $$;

-- p: {items:[{id,qty}], name, phone, email, fulfillment, notes, member:{email,passcode}|null}
create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.settings;
  v jsonb := null;
  member_id uuid := null;
  extra numeric := 0;
  v_email text := lower(trim(coalesce(p->>'email', '')));
  v_name text := trim(coalesce(p->>'name', ''));
  v_phone text := trim(coalesce(p->>'phone', ''));
  v_ful text := coalesce(p->>'fulfillment', '');
  it record;
  sub numeric := 0;
  tot numeric := 0;
  o public.orders;
  lines text := '';
  cnt int := 0;
begin
  select * into s from public.settings where id = 1;
  if not s.accepting_orders then
    return jsonb_build_object('ok', false, 'error', 'We''re not taking online orders right now. Please call us.');
  end if;
  if v_name = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'error', 'Please enter your name and mobile number.');
  end if;
  if v_ful not in ('dine_in', 'pickup', 'ride_thru') then
    return jsonb_build_object('ok', false, 'error', 'Choose dine in, pick up or ride thru.');
  end if;

  if p->'member' is not null and jsonb_typeof(p->'member') = 'object' then
    v := private.verify_member(p->'member'->>'email', p->'member'->>'passcode');
    if not (v->>'ok')::boolean then return v; end if;
    member_id := (v->>'id')::uuid;
    extra := (v->>'extra')::numeric;
    v_email := v->>'email';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'Please enter a valid email for your receipt.');
  end if;

  -- Validate items against the live menu (prices come from here, never from the browser).
  create temp table if not exists _lines (menu_item_id uuid, name text, qty int, unit numeric, charged numeric) on commit drop;
  truncate _lines;
  for it in
    select m.id, m.name, m.base_price, least(50, sum(greatest(0, floor((x->>'qty')::numeric))))::int as qty, bool_and(m.is_available) as avail
      from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) x
      left join public.menu_items m on m.id::text = x->>'id'
     group by m.id, m.name, m.base_price
  loop
    if it.id is null or not it.avail then
      return jsonb_build_object('ok', false, 'error', 'An item in your cart is no longer available. Please refresh.');
    end if;
    if it.qty > 0 then
      insert into _lines values (
        it.id, it.name, it.qty,
        public.public_price(it.base_price, s.markup_pct),
        case when member_id is null then public.public_price(it.base_price, s.markup_pct)
             else public.member_price(it.base_price, extra) end);
      cnt := cnt + 1;
    end if;
  end loop;
  if cnt = 0 then return jsonb_build_object('ok', false, 'error', 'Your cart is empty.'); end if;

  select sum(unit * qty), sum(charged * qty) into sub, tot from _lines;

  insert into public.orders (customer_id, is_member, customer_name, email, phone, fulfillment, notes,
                             subtotal, discount, total, markup_pct)
  values (member_id, member_id is not null, v_name, v_email, v_phone, v_ful,
          nullif(left(trim(coalesce(p->>'notes', '')), 500), ''), sub, sub - tot, tot, s.markup_pct)
  returning * into o;

  insert into public.order_items (order_id, menu_item_id, name, qty, unit_price, charged_unit_price, line_total)
  select o.id, menu_item_id, name, qty, unit, charged, charged * qty from _lines;

  select string_agg(qty || ' × ' || private.esc(name) || ' — ' || private.peso(charged * qty), '<br>') into lines from _lines;
  perform private.send_email(v_email, 'Order ' || o.order_no || ' received — pay ' || private.peso(tot) || ' via GCash',
    '<p>Hi ' || private.esc(v_name) || ', thanks for your order <b>' || o.order_no || '</b>.</p><p>' || lines ||
    '</p><p>Total: <b>' || private.peso(tot) || '</b></p><p>Pay with GCash, then upload your receipt and reference number on your order page:</p>' ||
    private.button(private.site_url() || '/order/view/?id=' || o.id || '&t=' || o.access_token, 'View order &amp; pay') ||
    '<p style="color:#555;font-size:13px">Keep this link — it''s how you check your order status.</p>');

  return jsonb_build_object('ok', true, 'id', o.id, 'token', o.access_token);
end $$;

create or replace function public.get_order(p_id uuid, p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when o.id is null then null else jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'created_at', o.created_at, 'status', o.status,
    'fulfillment', o.fulfillment, 'is_member', o.is_member, 'customer_name', o.customer_name,
    'subtotal', o.subtotal, 'discount', o.discount, 'total', o.total,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'qty', i.qty,
                     'charged_unit_price', i.charged_unit_price) order by i.name), '[]') from public.order_items i where i.order_id = o.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'gcash_ref', y.gcash_ref, 'amount', y.amount,
                     'status', y.status, 'review_note', y.review_note, 'created_at', y.created_at) order by y.created_at desc), '[]')
                 from public.payments y where y.order_id = o.id),
    'gcash', (select jsonb_build_object('name', gcash_name, 'number', gcash_number, 'qr', gcash_qr_url) from public.settings where id = 1)
  ) end
  from (select 1) d left join public.orders o on o.id = p_id and o.access_token = p_token
$$;

-- Storage policy helper: uploads must go to "<order_id>/<access_token>/<file>" of an unpaid order.
create or replace function public.proof_upload_allowed(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
     where o.id::text = split_part(p_name, '/', 1)
       and o.access_token = split_part(p_name, '/', 2)
       and o.status in ('awaiting_payment', 'payment_submitted'))
$$;

create or replace function public.submit_payment(
  p_id uuid, p_token text, p_ref text, p_amount numeric, p_sender_name text, p_sender_number text, p_proof_path text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  ref text := regexp_replace(coalesce(p_ref, ''), '\D', '', 'g');
begin
  select * into o from public.orders where id = p_id and access_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Order not found.'); end if;
  if o.status not in ('awaiting_payment', 'payment_submitted') then
    return jsonb_build_object('ok', false, 'error', 'This order isn''t waiting for payment.');
  end if;
  if exists (select 1 from public.payments where order_id = o.id and status = 'submitted') then
    return jsonb_build_object('ok', false, 'error', 'We''re already checking a payment for this order.');
  end if;
  if length(ref) <> 13 then
    return jsonb_build_object('ok', false, 'error', 'The GCash reference number has 13 digits — please check your receipt.');
  end if;
  if coalesce(p_amount, 0) <= 0 then return jsonb_build_object('ok', false, 'error', 'Enter the amount you sent.'); end if;
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> o.id::text or split_part(p_proof_path, '/', 2) <> o.access_token then
    return jsonb_build_object('ok', false, 'error', 'Please attach a screenshot of your GCash receipt.');
  end if;
  if exists (select 1 from public.payments where gcash_ref = ref and status <> 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'That GCash reference number was already used for an order. Please check it again.');
  end if;

  insert into public.payments (order_id, gcash_ref, amount, sender_name, sender_number, proof_path)
  values (o.id, ref, round(p_amount, 2), nullif(trim(p_sender_name), ''),
          nullif(regexp_replace(coalesce(p_sender_number, ''), '[^\d+]', '', 'g'), ''), p_proof_path);
  update public.orders set status = 'payment_submitted' where id = o.id;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'That GCash reference number was already used for an order.');
end $$;

create or replace function public.lookup_orders(p_email text, p_passcode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  v := private.verify_member(p_email, p_passcode);
  if not (v->>'ok')::boolean then return v; end if;
  return jsonb_build_object('ok', true, 'name', v->>'full_name', 'orders',
    coalesce((select jsonb_agg(jsonb_build_object('id', id, 'order_no', order_no, 'access_token', access_token,
                     'created_at', created_at, 'total', total, 'status', status, 'fulfillment', fulfillment)
                     order by created_at desc)
                from (select * from public.orders where lower(email::text) = lower(v->>'email')
                      order by created_at desc limit 100) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- STAFF RPCs
create or replace function private.new_passcode() returns text
language sql volatile set search_path = '' as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0')
$$;

create or replace function private.passcode_email(p_name text, p_email text, p_code text, p_reset boolean) returns boolean
language sql security definer set search_path = '' as $$
  select private.send_email(p_email,
    case when p_reset then 'Your new Lakwa Burger Cafe passcode' else 'You''re registered at Lakwa Burger Cafe' end,
    '<p>Hi ' || private.esc(p_name) || ',</p><p>' ||
    case when p_reset then 'Here is your new passcode.' else 'You''ve been registered for member pricing at the Lakwa Burger Cafe.' end ||
    ' When you order online, enter these details at checkout and your member price is applied automatically.</p>' ||
    '<table style="margin:16px 0;font-size:16px"><tr><td style="padding:4px 12px 4px 0;color:#555">Email</td><td><b>' || private.esc(p_email) ||
    '</b></td></tr><tr><td style="padding:4px 12px 4px 0;color:#555">Passcode</td><td><b style="font-size:22px;letter-spacing:3px">' || p_code ||
    '</b></td></tr></table>' || private.button(private.site_url() || '/order/', 'Order now') ||
    '<p style="color:#555;font-size:13px">Keep this email. Don''t share your passcode — staff will never ask for it.</p>')
$$;

create or replace function public.create_customer(p_email text, p_name text, p_phone text, p_extra numeric, p_notes text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  code text := private.new_passcode();
  em text := lower(trim(coalesce(p_email, '')));
  sent boolean;
begin
  if not public.is_staff() then return jsonb_build_object('ok', false, 'error', 'Staff only.'); end if;
  if coalesce(trim(p_name), '') = '' then return jsonb_build_object('ok', false, 'error', 'Name is required.'); end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'Enter a valid email.'); end if;
  if exists (select 1 from public.customers where lower(email::text) = em) then
    return jsonb_build_object('ok', false, 'error', 'That email is already registered. Use “New passcode” on their row instead.');
  end if;
  insert into public.customers (email, full_name, phone, extra_discount_pct, notes, passcode_hash, created_by)
  values (em, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), greatest(0, least(100, coalesce(p_extra, 0))),
          nullif(trim(coalesce(p_notes, '')), ''), extensions.crypt(code, extensions.gen_salt('bf', 10)), auth.uid());
  sent := private.passcode_email(trim(p_name), em, code, false);
  if sent then update public.customers set passcode_sent_at = now() where lower(email::text) = em; end if;
  return jsonb_build_object('ok', true, 'email', em, 'name', trim(p_name), 'passcode', code, 'emailed', sent);
end $$;

create or replace function public.reset_passcode(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.customers;
  code text := private.new_passcode();
  sent boolean;
begin
  if not public.is_staff() then return jsonb_build_object('ok', false, 'error', 'Staff only.'); end if;
  select * into c from public.customers where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Customer not found.'); end if;
  update public.customers set passcode_hash = extensions.crypt(code, extensions.gen_salt('bf', 10)),
         failed_attempts = 0, locked_until = null where id = p_id;
  sent := private.passcode_email(c.full_name, c.email::text, code, true);
  if sent then update public.customers set passcode_sent_at = now() where id = p_id; end if;
  return jsonb_build_object('ok', true, 'email', c.email::text, 'name', c.full_name, 'passcode', code, 'emailed', sent);
end $$;

create or replace function public.review_payment(p_payment_id uuid, p_decision text, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  y public.payments;
  o public.orders;
  ok boolean := p_decision = 'verify';
  note text := nullif(trim(coalesce(p_note, '')), '');
  link text;
begin
  if not public.is_staff() then return jsonb_build_object('ok', false, 'error', 'Staff only.'); end if;
  select * into y from public.payments where id = p_payment_id;
  if not found or y.status <> 'submitted' then return jsonb_build_object('ok', false, 'error', 'Payment already reviewed.'); end if;
  if not ok and note is null then note := 'We couldn''t find this reference number and amount in our GCash history.'; end if;

  update public.payments set status = case when ok then 'verified' else 'rejected' end, review_note = note,
         reviewed_by = auth.uid(), reviewed_at = now() where id = y.id;
  update public.orders set status = case when ok then 'paid' else 'awaiting_payment' end where id = y.order_id
  returning * into o;

  link := private.site_url() || '/order/view/?id=' || o.id || '&t=' || o.access_token;
  perform private.send_email(o.email::text,
    case when ok then 'Payment confirmed — order ' else 'Payment issue — order ' end || o.order_no,
    case when ok then '<p>Hi ' || private.esc(o.customer_name) || ', your GCash payment for <b>' || o.order_no || '</b> is confirmed. We''re on it!</p>' || private.button(link, 'Track your order')
         else '<p>Hi ' || private.esc(o.customer_name) || ', we couldn''t match your GCash payment for <b>' || o.order_no || '</b>.</p><p>Note from staff: ' || private.esc(note) || '</p>' || private.button(link, 'Upload again') end);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function public.check_member(text, text), public.place_order(jsonb), public.get_order(uuid, text),
  public.submit_payment(uuid, text, text, numeric, text, text, text), public.lookup_orders(text, text),
  public.proof_upload_allowed(text), public.public_price(numeric, numeric), public.member_price(numeric, numeric)
  to anon, authenticated;
revoke execute on function public.create_customer(text, text, text, numeric, text), public.reset_passcode(uuid),
  public.review_payment(uuid, text, text) from public, anon;
grant execute on function public.create_customer(text, text, text, numeric, text), public.reset_passcode(uuid),
  public.review_payment(uuid, text, text), public.is_staff(), public.is_admin() to authenticated;

-- Staff never see passcode hashes: column-level grants on customers.
revoke select, insert, update, delete on public.customers from anon, authenticated;
grant select (id, email, full_name, phone, extra_discount_pct, is_active, notes, failed_attempts, locked_until,
              passcode_sent_at, created_at) on public.customers to authenticated;
grant update (full_name, phone, extra_discount_pct, is_active, notes, failed_attempts, locked_until)
  on public.customers to authenticated;
revoke insert, update, delete on public.orders, public.order_items, public.payments from anon;

-- ---------------------------------------------------------------- staff RLS policies
drop policy if exists "Staff read orders" on public.orders;
create policy "Staff read orders" on public.orders for select to authenticated using (public.is_staff());
drop policy if exists "Staff update orders" on public.orders;
create policy "Staff update orders" on public.orders for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff read order items" on public.order_items;
create policy "Staff read order items" on public.order_items for select to authenticated using (public.is_staff());

drop policy if exists "Staff read payments" on public.payments;
create policy "Staff read payments" on public.payments for select to authenticated using (public.is_staff());

drop policy if exists "Staff read customers" on public.customers;
create policy "Staff read customers" on public.customers for select to authenticated using (public.is_staff());
drop policy if exists "Staff update customers" on public.customers;
create policy "Staff update customers" on public.customers for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff read all menu" on public.menu_items;
create policy "Staff read all menu" on public.menu_items for select to authenticated using (public.is_staff());
drop policy if exists "Admin write menu" on public.menu_items;
create policy "Admin write menu" on public.menu_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin update settings" on public.settings;
create policy "Admin update settings" on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Staff read staff" on public.staff;
create policy "Staff read staff" on public.staff for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------- storage policies (payment-proofs bucket is private)
drop policy if exists "Customers upload payment proofs" on storage.objects;
create policy "Customers upload payment proofs" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'payment-proofs' and public.proof_upload_allowed(name));

drop policy if exists "Staff view payment proofs" on storage.objects;
create policy "Staff view payment proofs" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_staff());
