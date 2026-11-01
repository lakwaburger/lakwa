-- ============================================================================
-- Each School Community — guests request to join; staff approve (creates the member + emails the passcode).
-- Run AFTER 20261101000100_static_backend.sql. Safe to re-run.
-- ============================================================================

create table if not exists public.membership_requests (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  email        citext not null,
  phone        text,
  message      text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  review_note  text,
  customer_id  uuid references public.customers(id) on delete set null,
  reviewed_by  uuid references auth.users(id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists membership_requests_one_pending
  on public.membership_requests (lower(email::text)) where status = 'pending';
create index if not exists membership_requests_status_idx on public.membership_requests (status, created_at desc);

alter table public.membership_requests enable row level security;
revoke all on public.membership_requests from anon;
grant select on public.membership_requests to authenticated;
drop policy if exists "Staff read requests" on public.membership_requests;
create policy "Staff read requests" on public.membership_requests for select to authenticated using (public.is_staff());

-- Who gets "new request" alerts (optional). Set with:
--   insert into private.secrets values ('staff_notify_email','you@example.com') on conflict (key) do update set value = excluded.value;
insert into private.secrets values ('staff_notify_email', 'migquesada@gmail.com') on conflict (key) do nothing;

-- ---------------------------------------------------------------- passcode email (Each School Community wording)
create or replace function private.passcode_email(p_name text, p_email text, p_code text, p_reset boolean) returns boolean
language sql security definer set search_path = '' as $$
  select private.send_email(p_email,
    case when p_reset then 'Your new Lakwa Burger Cafe passcode' else 'Welcome to Each School Community — Lakwa Burger Cafe' end,
    '<p>Hi ' || private.esc(p_name) || ',</p><p>' ||
    case when p_reset then 'Here is your new passcode.'
         else 'Welcome to <b>Each School Community</b> at the Lakwa Burger Cafe! As a member you keep our original prices.' end ||
    ' When you order online, tick “I''m an Each School Community member” at checkout and enter these details — your member price is applied automatically.</p>' ||
    '<table style="margin:16px 0;font-size:16px"><tr><td style="padding:4px 12px 4px 0;color:#555">Email</td><td><b>' || private.esc(p_email) ||
    '</b></td></tr><tr><td style="padding:4px 12px 4px 0;color:#555">Passcode</td><td><b style="font-size:22px;letter-spacing:3px">' || p_code ||
    '</b></td></tr></table>' || private.button(private.site_url() || '/order/', 'Order now') ||
    '<p style="color:#555;font-size:13px">Keep this email. Don''t share your passcode — staff will never ask for it.</p>')
$$;

-- ---------------------------------------------------------------- shared "create member" used by staff + approvals
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
    return jsonb_build_object('ok', false, 'error', 'That email is already a member. Use “New passcode” on their row instead.');
  end if;
  insert into public.customers (email, full_name, phone, extra_discount_pct, notes, passcode_hash, created_by)
  values (em, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), greatest(0, least(100, coalesce(p_extra, 0))),
          nullif(trim(coalesce(p_notes, '')), ''), extensions.crypt(code, extensions.gen_salt('bf', 10)), auth.uid())
  returning id into cid;
  sent := private.passcode_email(trim(p_name), em, code, false);
  if sent then update public.customers set passcode_sent_at = now() where id = cid; end if;
  return jsonb_build_object('ok', true, 'id', cid, 'email', em, 'name', trim(p_name), 'passcode', code, 'emailed', sent);
end $$;

create or replace function public.create_customer(p_email text, p_name text, p_phone text, p_extra numeric, p_notes text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then return jsonb_build_object('ok', false, 'error', 'Staff only.'); end if;
  return private.create_member(p_email, p_name, p_phone, p_extra, p_notes);
end $$;

-- ---------------------------------------------------------------- PUBLIC: request to join
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
    return jsonb_build_object('ok', false, 'error', 'Lots of requests right now — please try again in a little while.');
  end if;

  insert into public.membership_requests (full_name, email, phone, message) values (nm, em, ph, ms);

  perform private.send_email(em, 'We got your request — Each School Community',
    '<p>Hi ' || private.esc(nm) || ',</p><p>Thanks for asking to join <b>Each School Community</b> at the Lakwa Burger Cafe. ' ||
    'Our team will review it and, once approved, you''ll get an email with your member passcode.</p>');
  if coalesce(notify, '') <> '' then
    perform private.send_email(notify, 'New Each School Community request — ' || nm,
      '<p><b>' || private.esc(nm) || '</b> (' || private.esc(em) || ', ' || private.esc(ph) || ') asked to join Each School Community.</p>' ||
      coalesce('<p>“' || private.esc(ms) || '”</p>', '') || private.button(private.site_url() || '/staff/#community', 'Review request'));
  end if;
  return thanks;
end $$;

-- ---------------------------------------------------------------- STAFF: approve / decline
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
                               'Each School Community request' || coalesce(': ' || r.message, ''));
  if not (res->>'ok')::boolean then return res; end if;
  update public.membership_requests set status = 'approved', customer_id = (res->>'id')::uuid,
         reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
  return res;
end $$;

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
  perform private.send_email(r.email::text, 'Your Each School Community request',
    '<p>Hi ' || private.esc(r.full_name) || ',</p><p>Thanks for your interest in Each School Community. We''re not able to add you right now.</p>' ||
    coalesce('<p>' || private.esc(note) || '</p>', '') || '<p>You''re always welcome at the cafe!</p>');
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function public.request_membership(text, text, text, text) to anon, authenticated;
revoke execute on function public.approve_membership(uuid, numeric), public.decline_membership(uuid, text),
  public.create_customer(text, text, text, numeric, text) from public, anon;
grant execute on function public.approve_membership(uuid, numeric), public.decline_membership(uuid, text),
  public.create_customer(text, text, text, numeric, text) to authenticated;
