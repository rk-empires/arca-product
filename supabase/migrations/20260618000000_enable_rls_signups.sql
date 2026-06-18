-- Re-enable Row Level Security on signups and lock it down.
-- Writes come from the serverless function (api/contact.js) using the anon
-- key, so anon needs INSERT only. No SELECT/UPDATE/DELETE policy is defined,
-- so the public key cannot read or modify existing rows. The service_role key
-- bypasses RLS entirely for admin access.

alter table public.signups enable row level security;

drop policy if exists "anon can insert signups" on public.signups;

create policy "anon can insert signups"
  on public.signups
  for insert
  to anon
  with check (true);
