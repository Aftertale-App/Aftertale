-- Lower the global daily free ceiling 500 -> 200.
--
-- The free "bring to life" now bundles a portrait (~$0.04 image) with the
-- backstory under one credit, so worst-case per-hit cost jumped ~100x. 200/day
-- caps worst-case spend at ~$8/day. Only the free_ceiling value changes from
-- the prior version (the is_anonymous guard is unchanged).

create or replace function public.consume_free_credit()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  today        date := (now() at time zone 'utc')::date;
  free_ceiling int  := 200;   -- global free generations allowed per UTC day
  daily        int;
  remaining    int;
begin
  if uid is null then
    return 'unauthorized';
  end if;

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
