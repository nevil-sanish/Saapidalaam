-- Saapidalaam schema (idempotent). Money = bigint paise (BR-10). Times = timestamptz; business dates = date in IST.
create extension if not exists pgcrypto;

do $$ begin
  create type app_role as enum ('student','staff','manager','admin');
  exception when duplicate_object then null; end $$;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  roll_no text unique,
  role app_role not null default 'student',
  pw_hash text,                                  -- null = Google-only account
  photo bytea, photo_type text,                  -- private; served to staff/admin only
  is_active boolean not null default true,
  qr_secret text not null default encode(gen_random_bytes(32), 'hex'),
  backup_code_hash text,
  created_at timestamptz not null default now()
);
create table if not exists role_allowlist (
  email text primary key, role app_role not null check (role <> 'student'),
  added_by uuid, created_at timestamptz not null default now()
);
create table if not exists semesters (
  id serial primary key, name text not null, starts_on date not null, ends_on date not null,
  deposit_amount bigint not null default 3000000, status text not null default 'active' check (status in ('upcoming','active','closed'))
);
create table if not exists meal_slots (
  id serial primary key, code text unique not null, label text not null,
  start_time time not null, end_time time not null, sort int not null default 0
);
create table if not exists prices (
  slot_id int not null references meal_slots(id), diet text not null check (diet in ('veg','nonveg')),
  amount bigint not null check (amount >= 0), primary key (slot_id, diet)
);
create table if not exists menu_entries (
  served_on date not null, slot_id int not null references meal_slots(id), diet text not null check (diet in ('veg','nonveg')),
  items text not null default '', special_price bigint, primary key (served_on, slot_id, diet)
);
create table if not exists menu_months (month date primary key, published_at timestamptz not null default now());
create table if not exists deposits (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references profiles(id),
  amount bigint not null check (amount > 0), txn_ref text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  verified_by uuid, verified_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references profiles(id),
  kind text not null check (kind in ('deposit','meal_charge','adjustment','refund')),
  amount bigint not null,                        -- signed: + credit, − debit
  booking_id uuid, ref text, note text, created_by uuid, created_at timestamptz not null default now()
);
create or replace function ledger_append_only() returns trigger language plpgsql as $$
begin raise exception 'ledger is append-only (BR-15)'; end $$;
drop trigger if exists ledger_no_mutation on ledger_entries;
create trigger ledger_no_mutation before update or delete on ledger_entries for each row execute function ledger_append_only();

create table if not exists patterns (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references profiles(id),
  kind text not null check (kind in ('weekly','monthly')), month date,
  rules jsonb not null,                          -- weekly: {"1":[{"slot":1,"diet":"veg"}]} (ISO dow); monthly: {"2026-11-03":[...]}
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references profiles(id),
  served_on date not null, slot_id int not null references meal_slots(id), diet text not null,
  source text not null check (source in ('pattern','oneoff','special')), pattern_id uuid,
  price_snapshot bigint not null, is_special boolean not null default false,
  status text not null check (status in ('booked','locked','served','no_show','cancelled')),
  cutoff_at timestamptz not null, created_at timestamptz not null default now(),
  cancelled_at timestamptz, locked_at timestamptz
);
create unique index if not exists one_booking_per_slot on bookings (student_id, served_on, slot_id) where status <> 'cancelled';
create index if not exists bookings_day on bookings (served_on, slot_id, status);
create table if not exists scans (
  id uuid primary key default gen_random_uuid(), booking_id uuid, student_id uuid, staff_id uuid not null,
  method text not null check (method in ('qr','backup')),
  result text not null check (result in ('served','already_served','no_booking','invalid_token','outside_window')),
  scanned_at timestamptz not null default now()
);
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id),
  title text not null, body text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid, action text not null, entity_id text, diff jsonb,
  at timestamptz not null default now()
);
create table if not exists job_runs (name text primary key, last_run timestamptz not null);

-- Rule 3/4: RLS on every table with NO policies → anon/authenticated (PostgREST, browser) can read/write nothing.
-- All access goes through server code using the owner connection, which enforces role checks (src/lib/db.ts).
do $$ declare t text; begin
  foreach t in array array['profiles','role_allowlist','semesters','meal_slots','prices','menu_entries','menu_months',
    'deposits','ledger_entries','patterns','bookings','scans','notifications','audit_log','job_runs']
  loop execute format('alter table %I enable row level security', t); end loop; end $$;
