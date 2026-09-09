-- ============================================================
--  CarePoint — Supabase schema
--  Run this in the Supabase SQL Editor once, against your project.
--  The app snapshot-persists the full in-memory store into one
--  JSONB table: one row per collection (id = collection name).
-- ============================================================

create table if not exists public.carepoint_snapshot (
  id         text primary key,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Row Level Security
--
-- DEV / DEMO POLICY: any caller (including the anonymous browser key)
-- may read and write the snapshot. This matches the app's demo mode
-- (browsing + placing orders without a Firebase login).
--
-- !!! TIGHTEN FOR PRODUCTION on this table:
--     drop the policy below, then add role/tenant-aware policies, e.g.
--     create policy carepoint_snapshot_authed
--       on public.carepoint_snapshot for all
--       using (auth.role() = 'authenticated')
--       with check (auth.role() = 'authenticated');
-- ------------------------------------------------------------------
alter table public.carepoint_snapshot enable row level security;

drop policy if exists carepoint_snapshot_dev_all on public.carepoint_snapshot;
create policy carepoint_snapshot_dev_all
  on public.carepoint_snapshot
  for all
  using (true)
  with check (true);

-- ------------------------------------------------------------------
-- Sanity helpers (optional)
--   select  id, jsonb_array_length(payload) as count
--   from    public.carepoint_snapshot
--   where   jsonb_typeof(payload) = 'array'
--   order   by id;
-- ------------------------------------------------------------------