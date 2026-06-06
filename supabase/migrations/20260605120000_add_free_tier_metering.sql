-- Free-tier AI metering for the hosted gateway (docs/onboarding-redesign-spec.md §6–§7).
--
-- The hosted "free taste" runs a new player's first authored generation on
-- Jeff's key via the edge gateway (functions/api/generate.ts). Two controls
-- live here, both enforced server-side because client-side caps are trivially
-- reset:
--
--   1. A per-account credit (profiles.free_credits) — "one free per account",
--      decremented atomically.
--   2. A global daily ceiling (daily_free_usage) — once the whole site hands out
--      FREE_CEILING free generations in a UTC day, the free tap closes until
--      tomorrow. This single cap bounds worst-case spend, period.
--
-- consume_free_credit() enforces both in one transaction and is the only thing
-- the gateway calls before spending a token. SECURITY DEFINER so it can touch
-- the locked-down ledger while still reading auth.uid() from the caller's JWT.

-- Per-account free credit. New (and existing) accounts get one free generation.
alter table public.profiles
  add column if not exists free_credits int not null default 1;

-- Global daily ledger — one row per UTC day.
create table if not exists public.daily_free_usage (
  day   date primary key,
  count int  not null default 0
);

-- Lock the ledger down: no policies means no direct client access. Only
-- consume_free_credit() (SECURITY DEFINER, runs as owner) ever touches it.
alter table public.daily_free_usage enable row level security;

create or replace function public.consume_free_credit()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  today        date := (now() at time zone 'utc')::date;
  free_ceiling int  := 500;   -- global free generations allowed per UTC day
  daily        int;
  remaining    int;
begin
  if uid is null then
    return 'unauthorized';
  end if;

  -- Lock today's ledger row (seed at 0 on the first call of the day), check
  -- the global ceiling before spending anything.
  insert into public.daily_free_usage (day, count)
    values (today, 0)
    on conflict (day) do nothing;
  select count into daily from public.daily_free_usage
    where day = today
    for update;
  if daily >= free_ceiling then
    return 'ceiling_reached';
  end if;

  -- Lock the account row, check + decrement the per-account credit.
  select free_credits into remaining from public.profiles
    where id = uid
    for update;
  if remaining is null then
    return 'unauthorized';   -- no profile row for this uid
  end if;
  if remaining <= 0 then
    return 'no_credit';
  end if;

  update public.profiles      set free_credits = free_credits - 1 where id = uid;
  update public.daily_free_usage set count = count + 1            where day = today;
  return 'ok';
end;
$$;

-- Only signed-in users may call it; it reads their own auth.uid() internally.
revoke all on function public.consume_free_credit() from public;
grant execute on function public.consume_free_credit() to authenticated;
