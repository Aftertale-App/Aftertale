-- Portrait storage for the cold-reveal "meet your hero" moment.
--
-- A hero's portrait is generated once at "Bring to life" and stored here, keyed
-- by owner: portraits/<auth.uid()>/<character>.png. Public read (portraits are
-- shareable — the screenshot moment); writes are owner-scoped via RLS so a user
-- can only drop images in their own folder.

insert into storage.buckets (id, name, public)
values ('portraits', 'portraits', true)
on conflict (id) do nothing;

-- Owner-scoped writes (the first path segment must be the caller's uid).
create policy "portraits owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portraits'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "portraits owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'portraits'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Public read (the bucket is public; this keeps RLS explicit alongside it).
create policy "portraits public read"
  on storage.objects for select to public
  using (bucket_id = 'portraits');
