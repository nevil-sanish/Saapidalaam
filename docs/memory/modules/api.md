# API contract (Supabase) — source of truth for SQL, Edge Functions and web pages

Auth: Supabase Auth (Google + email/password for allowlisted/demo). `profiles.id = auth.users.id`, created by a trigger on `auth.users` insert.
Role: custom access token hook adds `app_role` to the JWT from `profiles.role`. SQL helpers: `app_role()` (reads `auth.jwt()->>'app_role'`, falling back to profiles), `is_admin()`, `is_staff()`, `is_manager()`.
Hooks: `hook_before_user_created(event jsonb)` rejects emails not ending `@iiitkottayam.ac.in` unless in `role_allowlist` (BR-40/41). `hook_custom_access_token(event jsonb)`.
All RPCs: `security definer`, `set search_path = public`, check `auth.uid()` and role inside, raise exceptions with readable messages (shown in UI flash). Money = bigint paise.

## Student RPCs (role student)
- `book_meal(p_date date, p_slot_id int, p_diet text) returns uuid` — BR-02,04,08,12; requires photo_path not null; low-balance notification (<50000).
- `cancel_booking(p_booking_id uuid) returns void` — BR-03.
- `save_pattern(p_kind text, p_rules jsonb, p_month date) returns jsonb {created, skipped}` — BR-05,06,07. weekly rules keys "1".."7" (ISO dow) → [{slot:int, diet}], monthly keys "YYYY-MM-DD"; monthly requires published menu_months row.
- `submit_deposit(p_amount bigint, p_txn_ref text) returns uuid`
- `regenerate_backup_code() returns text` — returns plain code once (8 chars A-HJ-NP-Z2-9). Admin variant: `admin_regenerate_backup_code(p_student uuid)`.
- `set_photo(p_path text) returns void` — sets profiles.photo_path after Storage upload (bucket `photos`, path `<uid>/photo`).
- `mark_notifications_read() returns void`
- `my_balance() returns table(deposits, charges, refunds, adjustments, committed, available, expected_refund, consumed, scheduled)` — wraps `v_student_balance` for auth.uid().

## Staff
- `serve_booking(p_student uuid, p_method text) returns jsonb` — called by the `scan` Edge Function (as staff user, after HMAC verify) and for backup codes via `scan_backup(p_code text) returns jsonb`. Result jsonb: `{result, student:{id,full_name,roll_no,photo_path}, slot, served_at, served_by, flagged}`; result ∈ served|already_served|no_booking|invalid_token|outside_window. Logs every attempt in `scans` (BR-32..34). `log_invalid_scan(p_method text)` for bad tokens.
- `slot_counts(p_date date, p_slot_id int) returns jsonb {booked, served, remaining, by_diet:[{diet,booked,served}]}`
- `remaining_list(p_date date, p_slot_id int, p_q text) returns table(full_name, roll_no, diet)`
- `current_slot() returns table(id, code, label, start_time, end_time)` — current or next slot today IST.

## Manager / admin aggregates (role manager or admin; NO per-student data, BR-42)
- `get_demand(p_from date, p_to date) returns table(served_on, slot_id, slot_label, diet, estimate, locked, served, no_show, items, is_special)` — from `v_demand_daily`.
- `get_payable(p_from date, p_to date) returns table(meals int, amount bigint)` — from `v_mess_payable`.
- `get_wastage(p_from date, p_to date) returns table(served_on, booked, served)`

## Admin RPCs (role admin; each writes `audit_log`)
- `admin_create_semester(p_name, p_starts date, p_ends date, p_deposit bigint)`, `admin_set_semester_status(p_id int, p_status text)`
- `admin_update_slot(p_id int, p_label text, p_start time, p_end time)`, `admin_set_price(p_slot int, p_diet text, p_amount bigint)`
- `admin_upsert_menu(p_date date, p_slot int, p_diet text, p_items text)`, `admin_publish_month(p_month date)` (BR-07, notifies students)
- `admin_create_special(p_date date, p_slot int, p_items text, p_veg bigint, p_nonveg bigint)` (BR-20..23)
- `admin_allowlist_add(p_email text, p_role app_role)`, `admin_allowlist_remove(p_email text)`, `admin_set_active(p_user uuid, p_active bool)`
- `admin_verify_deposit(p_id uuid)`, `admin_reject_deposit(p_id uuid)` (BR-11), `admin_refund(p_student uuid, p_amount bigint, p_ref text)` (BR-17), `admin_adjust(p_student uuid, p_amount bigint, p_note text)` (BR-15, note required)

## Jobs (pg_cron)
- `lock_due_bookings()` every 5 min (BR-13), `mark_no_shows()` every 15 min (BR-14), `extend_patterns()` daily 19:00 UTC = 00:30 IST (BR-06).

## RLS (BUILD_PLAN §6)
- Students: select own rows in profiles, bookings, ledger_entries, deposits, scans, notifications, patterns. Everyone authenticated: select meal_slots, prices, semesters, menu_entries (published months + specials), menu_months.
- Staff/manager: no direct table access to money/bookings; use RPCs above.
- Admin: select all tables. No client insert/update/delete on bookings, ledger_entries, deposits, scans (rule 3) — writes only via RPC.
- Views `v_student_balance`, `v_demand_daily`, `v_mess_payable`: revoked from anon/authenticated; accessed through the RPCs above.

## Edge Functions (Deno, `supabase/functions/`)
- `qr-token` (GET, student JWT) → `{token, expiresAt}`; token = `base64url(user_id).window.hmac` with HMAC_SHA256(profiles.qr_secret, user_id + "." + window), window = floor(unix/30). Reads secret with service role.
- `scan` (POST `{input, method:"qr"}` Zod-validated, staff/admin JWT) → verifies token (window ±1), then calls `serve_booking` as the staff user (forward Authorization header) and returns its jsonb. Invalid → `log_invalid_scan`.
