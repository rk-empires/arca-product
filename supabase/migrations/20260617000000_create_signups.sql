-- Create the signups table for the contact form
create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text,
  created_at timestamptz not null default now()
);

-- RLS disabled for now (per request)
alter table public.signups disable row level security;
