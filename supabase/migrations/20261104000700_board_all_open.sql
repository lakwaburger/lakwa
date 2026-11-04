-- ============================================================================
-- Order board v3: show every open order, not just the last 16 hours.
--   Incoming  = awaiting payment + payment uploaded (not yet verified)
--   Preparing = paid / preparing online orders + walk-ins
--   Ready     = ready, waiting to be collected
-- Orders leave the board when staff mark them Collected (completed) or cancel them.
-- Run AFTER 20261104000600_board_incoming.sql. Safe to re-run.
-- ============================================================================

create or replace function public.order_board() returns jsonb
language sql stable security definer set search_path = '' as $$
  with items as (
    select regexp_replace(order_no, '^[^0-9]*', '') as no, 'online' as kind,
           case when status in ('awaiting_payment', 'payment_submitted') then 'incoming'
                when status = 'ready' then 'ready' else 'preparing' end as col,
           case when status = 'ready' then updated_at else created_at end as at
      from public.orders
     where status in ('awaiting_payment', 'payment_submitted', 'paid', 'preparing', 'ready')
    union all
    select label, 'walkin', status, case when status = 'ready' then updated_at else created_at end
      from public.board_tickets
     where status in ('preparing', 'ready')
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

revoke execute on function public.order_board() from public;
grant execute on function public.order_board() to anon, authenticated;

notify pgrst, 'reload schema';

-- Check: should list your open orders
select public.order_board();
