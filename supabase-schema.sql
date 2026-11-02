-- Run this file once in the Supabase SQL Editor for project dtnvtywwhygwoktsuxev.
-- Public browser writes are intentionally used for this prototype. They are not
-- proof of ad views, Telegram identity, or a trustworthy coin balance.

create table if not exists public.leaderboard (
  telegram_id bigint primary key check (telegram_id > 0),
  username text,
  display_name text not null default 'Player',
  lifetime_coins bigint not null default 0 check (lifetime_coins >= 0),
  updated_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

drop policy if exists "Public can read leaderboard" on public.leaderboard;
create policy "Public can read leaderboard"
  on public.leaderboard
  for select
  to anon
  using (true);

drop policy if exists "Public can submit leaderboard scores" on public.leaderboard;
create policy "Public can submit leaderboard scores"
  on public.leaderboard
  for insert
  to anon
  with check (true);

drop policy if exists "Public can update leaderboard scores" on public.leaderboard;
create policy "Public can update leaderboard scores"
  on public.leaderboard
  for update
  to anon
  using (true)
  with check (true);

grant select, insert, update on public.leaderboard to anon;

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null check (telegram_id > 0),
  username text,
  display_name text not null default 'Player',
  coins bigint not null check (coins >= 2000),
  usdt_amount numeric(12, 4) not null check (usdt_amount = coins::numeric / 10000),
  network text not null default 'BEP20' check (network = 'BEP20'),
  wallet_address text not null check (wallet_address ~ '^0x[a-fA-F0-9]{40}$'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'paid', 'rejected')),
  created_at timestamptz not null default now()
);

create unique index if not exists one_pending_withdrawal_per_telegram_user
  on public.withdrawal_requests (telegram_id)
  where status = 'pending';

alter table public.withdrawal_requests enable row level security;
revoke all on public.withdrawal_requests from anon, authenticated;

drop policy if exists "Public can submit pending withdrawal requests"
  on public.withdrawal_requests;
create policy "Public can submit pending withdrawal requests"
  on public.withdrawal_requests
  for insert
  to anon
  with check (status = 'pending');

grant insert (
  telegram_id,
  username,
  display_name,
  coins,
  usdt_amount,
  network,
  wallet_address
) on public.withdrawal_requests to anon;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leaderboard'
  ) then
    alter publication supabase_realtime add table public.leaderboard;
  end if;
end
$$;
