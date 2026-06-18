-- Day 3: keep Row Level Security DISABLED on signups.
-- The internal admin page (admin.html) reads signups directly with the public
-- anon key, which requires RLS to be off for now. With RLS enabled and no
-- SELECT policy, PostgREST silently returns zero rows.
-- This is a temporary posture — real auth/security comes later.

alter table public.signups disable row level security;
