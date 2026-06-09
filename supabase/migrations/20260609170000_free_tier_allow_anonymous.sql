-- Reverse 20260605130000_free_tier_exclude_anonymous: the keyless onboarding
-- redesign (anon free gen, no sign-in wall) makes the anonymous session the
-- intended path for a new player's one free "bring to life". The earlier
-- is_anonymous rejection was a pre-Turnstile stopgap against anon-farming;
-- the abuse surface is now bounded by the per-profile credit (default 1),
-- the 200/day global ceiling, and the Turnstile bot check on the gateway.
--
-- Only change vs the live version is removing the is_anonymous guard. Ceiling
-- stays at 200 (per 20260605150000_free_ceiling_200).

create or replace function public.consume_free_credit()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  today        date := (now() at time zone 'utc')::date;
  free_ceiling int  := 200;
  daily        int;
  remaining    int;
begin
  if uid is null then
    return 'unauthorized';
  end if;

  -- Anonymous sessions ARE allowed: the keyless reveal grants every session
  -- one free bring-to-life. Farming is bounded by Turnstile + the daily ceiling.

  insert into public.daily_free_usage (day, count)
    values (today, 0)
    on conflict (day) do nothing;
  select count into daily from public.daily_free_usage
    where day = today
    for update;
  if daily >= free_ceiling then
    return 'ceiling_reached';
  end if;

  select free_credits into remaining from public.profiles
    where id = uid
    for update;
  if remaining is null then
    return 'unauthorized';
  end if;
  if remaining <= 0 then
    return 'no_credit';
  end if;

  update public.profiles        set free_credits = free_credits - 1 where id = uid;
  update public.daily_free_usage set count = count + 1              where day = today;
  return 'ok';
end;
$$;
