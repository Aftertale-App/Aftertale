-- Red-team fix: exclude anonymous sessions from the free credit.
--
-- Anonymous sign-in is unlimited and unauthenticated, so a script could farm
-- free generations (anon sign-in -> 1 gen -> repeat) up to the daily ceiling —
-- burning the day's free allocation and locking real players out. The free
-- taste is for real accounts only; the spec's funnel is "sign in (email) ->
-- first chapter free". A claimed anonymous account (after email OTP) is
-- non-anonymous, so this allows the intended flow and blocks pure-anon farming.
--
-- Only change vs the prior version is the is_anonymous guard.

create or replace function public.consume_free_credit()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  today        date := (now() at time zone 'utc')::date;
  free_ceiling int  := 500;
  daily        int;
  remaining    int;
begin
  if uid is null then
    return 'unauthorized';
  end if;

  -- Reject anonymous sessions: they have a uid but are not a real account.
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return 'unauthorized';
  end if;

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
