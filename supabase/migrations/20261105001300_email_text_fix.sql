-- ============================================================================
-- Fix garbled characters in emails (e.g. "We got your request ,Ai ..." instead of an em dash) and
-- bring all email texts up to date (Earth School Community wording, logo header).
-- Re-creates every function that sends email or shows text with special characters (em dash, peso sign,
-- curly quotes...). This file is plain ASCII on purpose: special characters are produced with chr(),
-- so copy / paste can never garble them again.
-- Run AFTER 20261105001200_email_logo.sql. Safe to re-run.
-- ============================================================================

-- from 20261101000100_static_backend.sql
create or replace function private.peso(n numeric) returns text
language sql immutable set search_path = '' as $$
  select '' || chr(8369) || '' || to_char(n, 'FM999,999,990') || case when n <> trunc(n) then to_char(n - trunc(n), 'FM.00') else '' end
$$;

-- from 20261105001200_email_logo.sql
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
       || '<div style="background:#b10b0e;padding:14px 24px;text-align:center">'
       || '<a href="' || private.site_url() || '/" style="text-decoration:none;color:#e5e1d7;font-weight:bold;font-size:20px">'
       || '<img src="' || private.site_url() || '/assets/img/logo.png" width="126" height="60" alt="LAKWA Burger Cafe"'
       || ' style="display:inline-block;border:0;width:126px;height:60px;color:#e5e1d7;font-weight:bold;font-size:20px"></a></div>'
       || '<div style="padding:24px;background:#ffffff;border:1px solid #eee">' || p_body || '</div>'
       || '<p style="font-size:12px;color:#777;padding:12px 24px">Kalye Artisano, Lio Estate, Villa Libertad, El Nido, Palawan ' || chr(183) || ' (0931) 154-9766</p></div>';
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('x-hook-secret', hook, 'Content-Type', 'application/json'),
    body := jsonb_build_object('to', p_to, 'subject', p_subject, 'html', html)
  );
  return true;
end $$;

-- from 20261101000100_static_backend.sql
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

-- from 20261101000100_static_backend.sql
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

  select string_agg(qty || ' ' || chr(215) || ' ' || private.esc(name) || ' ' || chr(8212) || ' ' || private.peso(charged * qty), '<br>') into lines from _lines;
  perform private.send_email(v_email, 'Order ' || o.order_no || ' received ' || chr(8212) || ' pay ' || private.peso(tot) || ' via GCash',
    '<p>Hi ' || private.esc(v_name) || ', thanks for your order <b>' || o.order_no || '</b>.</p><p>' || lines ||
    '</p><p>Total: <b>' || private.peso(tot) || '</b></p><p>Pay with GCash, then upload a screenshot of your receipt on your order page:</p>' ||
    private.button(private.site_url() || '/order/view/?id=' || o.id || '&t=' || o.access_token, 'View order &amp; pay') ||
    '<p style="color:#555;font-size:13px">Keep this link ' || chr(8212) || ' it''s how you check your order status.</p>');

  return jsonb_build_object('ok', true, 'id', o.id, 'token', o.access_token);
end $$;

-- from 20261101000300_each_school_community.sql
create or replace function private.passcode_email(p_name text, p_email text, p_code text, p_reset boolean) returns boolean
language sql security definer set search_path = '' as $$
  select private.send_email(p_email,
    case when p_reset then 'Your new Lakwa Burger Cafe passcode' else 'Welcome to Earth School Community ' || chr(8212) || ' Lakwa Burger Cafe' end,
    '<p>Hi ' || private.esc(p_name) || ',</p><p>' ||
    case when p_reset then 'Here is your new passcode.'
         else 'Welcome to <b>Earth School Community</b> at the Lakwa Burger Cafe! As a member you keep our original prices.' end ||
    ' When you order online, tick ' || chr(8220) || 'I''m an Earth School Community member' || chr(8221) || ' at checkout and enter these details ' || chr(8212) || ' your member price is applied automatically.</p>' ||
    '<table style="margin:16px 0;font-size:16px"><tr><td style="padding:4px 12px 4px 0;color:#555">Email</td><td><b>' || private.esc(p_email) ||
    '</b></td></tr><tr><td style="padding:4px 12px 4px 0;color:#555">Passcode</td><td><b style="font-size:22px;letter-spacing:3px">' || p_code ||
    '</b></td></tr></table>' || private.button(private.site_url() || '/order/', 'Order now') ||
    '<p style="color:#555;font-size:13px">Keep this email. Don''t share your passcode ' || chr(8212) || ' staff will never ask for it.</p>')
$$;

-- from 20261101000300_each_school_community.sql
create or replace function public.create_customer(p_email text, p_name text, p_phone text, p_extra numeric, p_notes text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then return jsonb_build_object('ok', false, 'error', 'Staff only.'); end if;
  return private.create_member(p_email, p_name, p_phone, p_extra, p_notes);
end $$;

-- from 20261101000100_static_backend.sql
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

-- from 20261104000600_board_incoming.sql
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
  if not ok and note is null then note := 'We couldn''t find this payment in our GCash history.'; end if;

  update public.payments set status = case when ok then 'verified' else 'rejected' end, review_note = note,
         reviewed_by = auth.uid(), reviewed_at = now() where id = y.id;
  update public.orders set status = case when ok then 'preparing' else 'awaiting_payment' end where id = y.order_id
  returning * into o;

  link := private.site_url() || '/order/view/?id=' || o.id || '&t=' || o.access_token;
  perform private.send_email(o.email::text,
    case when ok then 'Payment confirmed ' || chr(8212) || ' order ' else 'Payment issue ' || chr(8212) || ' order ' end || o.order_no,
    case when ok then '<p>Hi ' || private.esc(o.customer_name) || ', your GCash payment for <b>' || o.order_no || '</b> is confirmed. We''re on it!</p>' || private.button(link, 'Track your order')
         else '<p>Hi ' || private.esc(o.customer_name) || ', we couldn''t match your GCash payment for <b>' || o.order_no || '</b>.</p><p>Note from staff: ' || private.esc(note) || '</p>' || private.button(link, 'Upload again') end);
  return jsonb_build_object('ok', true);
end $$;

-- from 20261101000300_each_school_community.sql
create or replace function private.create_member(p_email text, p_name text, p_phone text, p_extra numeric, p_notes text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  code text := private.new_passcode();
  em text := lower(trim(coalesce(p_email, '')));
  cid uuid;
  sent boolean;
begin
  if coalesce(trim(p_name), '') = '' then return jsonb_build_object('ok', false, 'error', 'Name is required.'); end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'Enter a valid email.'); end if;
  if exists (select 1 from public.customers where lower(email::text) = em) then
    return jsonb_build_object('ok', false, 'error', 'That email is already a member. Use ' || chr(8220) || 'New passcode' || chr(8221) || ' on their row instead.');
  end if;
  insert into public.customers (email, full_name, phone, extra_discount_pct, notes, passcode_hash, created_by)
  values (em, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), greatest(0, least(100, coalesce(p_extra, 0))),
          nullif(trim(coalesce(p_notes, '')), ''), extensions.crypt(code, extensions.gen_salt('bf', 10)), auth.uid())
  returning id into cid;
  sent := private.passcode_email(trim(p_name), em, code, false);
  if sent then update public.customers set passcode_sent_at = now() where id = cid; end if;
  return jsonb_build_object('ok', true, 'id', cid, 'email', em, 'name', trim(p_name), 'passcode', code, 'emailed', sent);
end $$;

-- from 20261101000300_each_school_community.sql
create or replace function public.request_membership(p_name text, p_email text, p_phone text, p_message text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  em text := lower(trim(coalesce(p_email, '')));
  nm text := left(trim(coalesce(p_name, '')), 120);
  ph text := left(trim(coalesce(p_phone, '')), 40);
  ms text := nullif(left(trim(coalesce(p_message, '')), 500), '');
  notify text := private.secret('staff_notify_email');
  thanks jsonb := jsonb_build_object('ok', true);
begin
  if nm = '' then return jsonb_build_object('ok', false, 'error', 'Please enter your name.'); end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'Please enter a valid email.'); end if;
  if ph = '' then return jsonb_build_object('ok', false, 'error', 'Please enter your mobile number.'); end if;
  -- Same answer whether or not they're already a member / already asked (no information leak, no duplicates).
  if exists (select 1 from public.customers where lower(email::text) = em and is_active)
     or exists (select 1 from public.membership_requests where lower(email::text) = em and status = 'pending') then
    return thanks;
  end if;
  -- Light abuse guard: max 20 new requests per hour overall.
  if (select count(*) from public.membership_requests where created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'Lots of requests right now ' || chr(8212) || ' please try again in a little while.');
  end if;

  insert into public.membership_requests (full_name, email, phone, message) values (nm, em, ph, ms);

  perform private.send_email(em, 'We got your request ' || chr(8212) || ' Earth School Community',
    '<p>Hi ' || private.esc(nm) || ',</p><p>Thanks for asking to join <b>Earth School Community</b> at the Lakwa Burger Cafe. ' ||
    'Our team will review it and, once approved, you''ll get an email with your member passcode.</p>');
  if coalesce(notify, '') <> '' then
    perform private.send_email(notify, 'New Earth School Community request ' || chr(8212) || ' ' || nm,
      '<p><b>' || private.esc(nm) || '</b> (' || private.esc(em) || ', ' || private.esc(ph) || ') asked to join Earth School Community.</p>' ||
      coalesce('<p>' || chr(8220) || '' || private.esc(ms) || '' || chr(8221) || '</p>', '') || private.button(private.site_url() || '/staff/#community', 'Review request'));
  end if;
  return thanks;
end $$;

-- from 20261101000300_each_school_community.sql
create or replace function public.approve_membership(p_id uuid, p_extra numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.membership_requests;
  res jsonb;
begin
  if not public.is_staff() then return jsonb_build_object('ok', false, 'error', 'Staff only.'); end if;
  select * into r from public.membership_requests where id = p_id for update;
  if not found or r.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'This request was already handled.'); end if;
  res := private.create_member(r.email::text, r.full_name, r.phone, p_extra,
                               'Earth School Community request' || coalesce(': ' || r.message, ''));
  if not (res->>'ok')::boolean then return res; end if;
  update public.membership_requests set status = 'approved', customer_id = (res->>'id')::uuid,
         reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
  return res;
end $$;

-- from 20261101000300_each_school_community.sql
create or replace function public.decline_membership(p_id uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.membership_requests;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_staff() then return jsonb_build_object('ok', false, 'error', 'Staff only.'); end if;
  select * into r from public.membership_requests where id = p_id for update;
  if not found or r.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'This request was already handled.'); end if;
  update public.membership_requests set status = 'declined', review_note = note, reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
  perform private.send_email(r.email::text, 'Your Earth School Community request',
    '<p>Hi ' || private.esc(r.full_name) || ',</p><p>Thanks for your interest in Earth School Community. We''re not able to add you right now.</p>' ||
    coalesce('<p>' || private.esc(note) || '</p>', '') || '<p>You''re always welcome at the cafe!</p>');
  return jsonb_build_object('ok', true);
end $$;

-- from 20261101000400_simple_gcash.sql
create or replace function public.submit_payment(p_id uuid, p_token text, p_proof_path text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_id and access_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'Order not found.'); end if;
  if o.status not in ('awaiting_payment', 'payment_submitted') then
    return jsonb_build_object('ok', false, 'error', 'This order isn''t waiting for payment.');
  end if;
  if exists (select 1 from public.payments where order_id = o.id and status = 'submitted') then
    return jsonb_build_object('ok', false, 'error', 'We''re already checking a payment for this order.');
  end if;
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> o.id::text or split_part(p_proof_path, '/', 2) <> o.access_token then
    return jsonb_build_object('ok', false, 'error', 'Please attach a screenshot of your GCash receipt.');
  end if;

  insert into public.payments (order_id, amount, proof_path) values (o.id, o.total, p_proof_path);
  update public.orders set status = 'payment_submitted' where id = o.id;
  return jsonb_build_object('ok', true);
end $$;

-- Check: both numbers should be 0 (no garbled text, no old "The Earth Community" / "Each School Community" wording left).
select count(*) filter (where p.prosrc like '%,' || chr(196) || '%' or p.prosrc like '%' || chr(195) || chr(162) || '%' or p.prosrc like '%' || chr(226) || chr(8364) || '%') as garbled_functions,
       count(*) filter (where p.prosrc ilike '%the earth community%' or p.prosrc ilike '%each school%') as old_wording_functions
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'private');
