create extension if not exists pgcrypto;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  slot_start timestamptz not null,
  user_name text not null check (user_name in ('王志鹏', '周子茹', '张正梁')),
  created_at timestamptz not null default now()
);

create unique index if not exists reservations_slot_start_key
  on public.reservations (slot_start);

create table if not exists public.app_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.reservations enable row level security;
alter table public.app_meta enable row level security;

drop policy if exists "Anyone can read reservations" on public.reservations;
drop policy if exists "Anyone can create reservations" on public.reservations;
drop policy if exists "Anyone can delete reservations" on public.reservations;
drop policy if exists "Anyone can read app meta" on public.app_meta;
drop policy if exists "Anyone can create app meta" on public.app_meta;
drop policy if exists "Anyone can update app meta" on public.app_meta;

create policy "Anyone can read reservations"
  on public.reservations
  for select
  using (true);

create policy "Anyone can create reservations"
  on public.reservations
  for insert
  with check (user_name in ('王志鹏', '周子茹', '张正梁'));

create policy "Anyone can delete reservations"
  on public.reservations
  for delete
  using (true);

create policy "Anyone can read app meta"
  on public.app_meta
  for select
  using (true);

create policy "Anyone can create app meta"
  on public.app_meta
  for insert
  with check (key = 'cleanup_week_start');

create policy "Anyone can update app meta"
  on public.app_meta
  for update
  using (key = 'cleanup_week_start')
  with check (key = 'cleanup_week_start');
