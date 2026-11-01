-- ============================================================================
-- Simpler GCash payment: the customer only uploads a screenshot of the receipt
-- for the whole order total. No reference number, amount or sender details.
-- Staff check the screenshot against the cafe's GCash history and Verify / Reject.
-- Also: new order numbers start with LKW- instead of LBC-.
-- Run AFTER 20261101000300_each_school_community.sql. Safe to re-run.
-- ============================================================================

-- The reference number is no longer collected (old payments keep theirs).
alter table public.payments alter column gcash_ref drop not null;

drop function if exists public.submit_payment(uuid, text, text, numeric, text, text, text);

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

-- Same as before, only the default rejection note no longer mentions a reference number.
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
  update public.orders set status = case when ok then 'paid' else 'awaiting_payment' end where id = y.order_id
  returning * into o;

  link := private.site_url() || '/order/view/?id=' || o.id || '&t=' || o.access_token;
  perform private.send_email(o.email::text,
    case when ok then 'Payment confirmed — order ' else 'Payment issue — order ' end || o.order_no,
    case when ok then '<p>Hi ' || private.esc(o.customer_name) || ', your GCash payment for <b>' || o.order_no || '</b> is confirmed. We''re on it!</p>' || private.button(link, 'Track your order')
         else '<p>Hi ' || private.esc(o.customer_name) || ', we couldn''t match your GCash payment for <b>' || o.order_no || '</b>.</p><p>Note from staff: ' || private.esc(note) || '</p>' || private.button(link, 'Upload again') end);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- order numbers: LKW-1001 instead of LBC-1001 (existing orders keep theirs)
alter table public.orders alter column order_no set default ('LKW-' || nextval('public.order_no_seq'));

-- ---------------------------------------------------------------- grants
revoke execute on function public.submit_payment(uuid, text, text) from public;
grant execute on function public.submit_payment(uuid, text, text) to anon, authenticated;
revoke execute on function public.review_payment(uuid, text, text) from public, anon;
grant execute on function public.review_payment(uuid, text, text) to authenticated;
