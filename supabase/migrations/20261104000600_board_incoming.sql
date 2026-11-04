-- ============================================================================
-- Order board v2: three columns — Incoming (payment uploaded, waiting for staff), Preparing, Ready.
-- Verifying a payment now starts the order straight away (status 'preparing' instead of 'paid').
-- Run AFTER 20261104000500_order_board.sql. Safe to re-run.
-- ============================================================================

create or replace function public.order_board() returns jsonb
language sql stable security definer set search_path = '' as $$
  with items as (
    select regexp_replace(order_no, '^[^0-9]*', '') as no, 'online' as kind,
           case status when 'payment_submitted' then 'incoming' when 'ready' then 'ready' else 'preparing' end as col,
           case when status = 'ready' then updated_at else created_at end as at
      from public.orders
     where status in ('payment_submitted', 'paid', 'preparing', 'ready') and created_at > now() - interval '16 hours'
    union all
    select label, 'walkin', status, case when status = 'ready' then updated_at else created_at end
      from public.board_tickets
     where status in ('preparing', 'ready') and created_at > now() - interval '16 hours'
  )
  select jsonb_build_object(
    'incoming',  coalesce((select jsonb_agg(jsonb_build_object('no', no, 'kind', kind, 'at', at) order by at)
                             from items where col = 'incoming'), '[]'),
    'preparing', coalesce((select jsonb_agg(jsonb_build_object('no', no, 'kind', kind, 'at', at) order by at)
                             from items where col = 'preparing'), '[]'),
    'ready',     coalesce((select jsonb_agg(jsonb_build_object('no', no, 'kind', kind, 'at', at) order by at desc)
                             from items where col = 'ready'), '[]'),
    'now', now())
$$;

-- Same as before, except a verified payment moves the order straight to 'preparing'.
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
    case when ok then 'Payment confirmed — order ' else 'Payment issue — order ' end || o.order_no,
    case when ok then '<p>Hi ' || private.esc(o.customer_name) || ', your GCash payment for <b>' || o.order_no || '</b> is confirmed. We''re on it!</p>' || private.button(link, 'Track your order')
         else '<p>Hi ' || private.esc(o.customer_name) || ', we couldn''t match your GCash payment for <b>' || o.order_no || '</b>.</p><p>Note from staff: ' || private.esc(note) || '</p>' || private.button(link, 'Upload again') end);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.order_board() from public;
grant execute on function public.order_board() to anon, authenticated;
revoke execute on function public.review_payment(uuid, text, text) from public, anon;
grant execute on function public.review_payment(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
