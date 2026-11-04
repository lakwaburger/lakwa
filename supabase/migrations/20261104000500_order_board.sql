-- ============================================================================
-- Order board: the screen at the cashier that shows "Preparing" and "Ready" numbers.
--   * Online orders appear automatically (paid / preparing → Preparing, ready → Ready).
--   * Walk-in orders (rung up in UTAK) are added by staff as board tickets.
--   * public.order_board() is the only thing the public screen can read: numbers only, no names.
-- Run AFTER 20261101000400_simple_gcash.sql. Safe to re-run.
-- ============================================================================

create table if not exists public.board_tickets (
  id          uuid primary key default gen_random_uuid(),
  label       text not null check (char_length(label) between 1 and 8),  -- UTAK receipt no. or any short number
  status      text not null default 'preparing' check (status in ('preparing', 'ready', 'completed')),
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists board_tickets_status_idx on public.board_tickets (status, created_at desc);
drop trigger if exists board_tickets_updated_at on public.board_tickets;
create trigger board_tickets_updated_at before update on public.board_tickets
  for each row execute function public.set_updated_at();

alter table public.board_tickets enable row level security;
revoke all on public.board_tickets from anon;
grant select, insert, update, delete on public.board_tickets to authenticated;
drop policy if exists "Staff manage board tickets" on public.board_tickets;
create policy "Staff manage board tickets" on public.board_tickets for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- What the public screen shows. Only today's work (last 16 hours), numbers only.
-- Online order numbers drop the prefix: LKW-1003 → "1003".
create or replace function public.order_board() returns jsonb
language sql stable security definer set search_path = '' as $$
  with items as (
    select regexp_replace(order_no, '^[^0-9]*', '') as no, 'online' as kind,
           case when status = 'ready' then 'ready' else 'preparing' end as col,
           case when status = 'ready' then updated_at else created_at end as at
      from public.orders
     where status in ('paid', 'preparing', 'ready') and created_at > now() - interval '16 hours'
    union all
    select label, 'walkin', status, case when status = 'ready' then updated_at else created_at end
      from public.board_tickets
     where status in ('preparing', 'ready') and created_at > now() - interval '16 hours'
  )
  select jsonb_build_object(
    'preparing', coalesce((select jsonb_agg(jsonb_build_object('no', no, 'kind', kind, 'at', at) order by at)
                             from items where col = 'preparing'), '[]'),
    'ready',     coalesce((select jsonb_agg(jsonb_build_object('no', no, 'kind', kind, 'at', at) order by at desc)
                             from items where col = 'ready'), '[]'),
    'now', now())
$$;

revoke execute on function public.order_board() from public;
grant execute on function public.order_board() to anon, authenticated;

notify pgrst, 'reload schema';
