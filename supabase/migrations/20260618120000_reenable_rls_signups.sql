-- Secure posture: re-enable Row Level Security on signups.
-- - Public anon key (contact form via api/contact.js) may INSERT only.
-- - Anon has NO select/update/delete, so the public key cannot read rows.
-- - The admin page reads via api/submissions.js using the service_role key,
--   which bypasses RLS entirely and is gated behind an admin password.

alter table public.signups enable row level security;

drop policy if exists "anon can insert signups" on public.signups;

create policy "anon can insert signups"
  on public.signups
  for insert
  to anon
  with check (true);
