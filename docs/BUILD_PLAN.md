# Build Plan — Technical Architecture

> *How* we build it. Read `docs/PRODUCT.md` for the business rules (BR-xx) referenced here.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App (all roles) | Single Next.js 15 (App Router) + TypeScript + Tailwind, on **Vercel** | One web app, role-based routes `/student /staff /manager /admin` (D-09: no mobile app, no monorepo) |
| Backend | **Supabase**: Postgres, Auth (Google), Storage, Edge Functions, pg_cron | RLS + SQL functions keep money logic in one transactional place |
| Validation | Zod (shared) | Same schemas on client and Edge Functions |
| Server state | TanStack Query | Caching + realtime invalidation |
| Testing | Vitest (lib), pgTAP (DB) | |
| CI | GitHub Actions | lint, typecheck, test, `supabase db lint` |

## 2. Repository layout

```
saapidalaam/
├── CLAUDE.md  MEMORY.md
├── docs/ (PRODUCT, BUILD_PLAN, EXECUTION_PLAN, MEMORY_PLAN, memory/)
├── src/app/{student,staff,manager,admin,login,auth}/
├── src/lib/                   # money, time, zod schemas, supabase clients, qr
└── supabase/{migrations,tests,seed.sql,config.toml}
```

## 3. Modules

Each module = migration(s) + RLS + SQL functions + shared types + UI + tests. Build in this order; each depends only on earlier ones.

| # | Module | Owns |
|---|---|---|
| M0 | `foundation` | Monorepo, CI, Supabase project, env, lint/format |
| M1 | `auth-roles` | Google auth, domain check, allowlist, roles, JWT claim, profile + photo |
| M2 | `catalog` | Semesters, slots, prices, menu cycles, menu entries |
| M3 | `ledger` | Deposits, ledger entries, balance views |
| M4 | `booking` | Bookings, one-offs, cancellation, cutoff, locking, no-show jobs |
| M5 | `patterns` | Weekly/monthly patterns, materialisation, daily extension |
| M6 | `specials` | Special meals, auto-move, opt-out |
| M7 | `scanning` | QR token, backup code, scan RPC, scan log |
| M8 | `student-web` | All student screens (web) |
| M9 | `staff-web` | Browser-camera scanner, backup code input, live counts |
| M10 | `manager-web` | Demand views, payable, export |
| M11 | `admin-web` | Config, finance, audit, reports |
| M12 | `notifications` | In-app notifications table, triggers, scheduled reminders |
| M13 | `hardening` | Load test, security review, backups, monitoring |

## 4. Data model (Postgres)

All money is `bigint` paise. All timestamps are `timestamptz`; business dates are `date` in IST.

```sql
-- M1
profiles (id uuid pk -> auth.users, email text unique, full_name text, roll_no text unique null,
          role app_role not null default 'student',  -- enum: student|staff|manager|admin
          photo_path text, is_active bool default true,
          qr_secret bytea not null,          -- per-user HMAC secret, never sent to staff
          backup_code_hash text not null,
          created_at timestamptz default now())
role_allowlist (email text pk, role app_role, added_by uuid, created_at)

-- M2
semesters (id, name, starts_on date, ends_on date, deposit_amount bigint, status: upcoming|active|closed)
meal_slots (id, code text unique, label, start_time time, end_time time, sort int)
prices (id, slot_id, diet diet_type, amount bigint, effective_from date)   -- diet_type: veg|nonveg
menu_cycles (id, semester_id, month date, status: draft|published, published_at)
menu_entries (id, cycle_id, served_on date, slot_id, diet, items text[],
              is_special bool default false, special_price bigint null)

-- M3
deposits (id, student_id, semester_id, amount bigint, txn_ref text, status: pending|verified|rejected,
          verified_by uuid, verified_at)
ledger_entries (id, student_id, semester_id,
                kind: deposit|meal_charge|adjustment|refund,
                amount bigint,            -- signed: + credit, − debit
                booking_id uuid null, ref text, note text, created_by uuid, created_at)
                -- append-only: no UPDATE/DELETE grant, trigger rejects both

-- M4/M5/M6
patterns (id, student_id, semester_id, kind: weekly|monthly, month date null,
          rules jsonb,            -- weekly: {"mon":[{"slot":"L","diet":"veg"}],...}; monthly: {"2026-11-03":[...]}
          valid_from date, valid_to date, is_active bool, created_at)
bookings (id, student_id, semester_id, served_on date, slot_id, diet,
          source: pattern|oneoff|special, pattern_id null,
          price_snapshot bigint, is_special bool,
          status: booked|locked|served|no_show|cancelled,
          cutoff_at timestamptz,   -- slot start − 24h, IST
          created_at, cancelled_at, locked_at)
  unique (student_id, served_on, slot_id) where status <> 'cancelled'

-- M7
scans (id, booking_id null, student_id, staff_id, method: qr|backup,
       result: served|already_served|no_booking|invalid_token|outside_window,
       scanned_at, device_info text)

-- M12
notifications (id, user_id, kind, title, body, read_at, created_at)   -- D-09: in-app instead of push
audit_log (id, actor_id, action, entity, entity_id, diff jsonb, at)
```

### Views
- `v_student_balance`: verified deposits, posted charges, refunds, committed (booked, unlocked), available, expected refund. **BR-12, BR-16**
- `v_demand_daily`: date × slot × diet → booked, locked, served. Used by manager and admin.
- `v_mess_payable`: period → sum of posted meal charges. No student column. **BR-42**

## 5. Business logic placement

| Logic | Where | Why |
|---|---|---|
| Create/cancel booking | SQL function `book_meal`, `cancel_booking` (security definer) | Balance check + insert in one transaction |
| Save pattern + materialise | SQL `save_pattern` | Same |
| Lock at cutoff + post charge | pg_cron every 5 min → `lock_due_bookings()` | BR-03, BR-13 |
| Mark no-shows | pg_cron after each slot end → `mark_no_shows()` | BR-14 |
| Extend weekly patterns | pg_cron daily 00:30 IST → `extend_patterns()` | BR-06 |
| QR token generation | Server route `/api/qr-token` returns a ready 30s token; student page refreshes every 25s | Secret never leaves the server |
| Scan | SQL `scan_qr` / `scan_backup` (HMAC verified in Postgres via pgcrypto) | Verify + transactional serve in one call |
| Notifications | Edge Function `notify` + DB triggers / cron | |

**Rule:** the client never writes to `bookings`, `ledger_entries`, `deposits` or `scans` directly. RLS gives students `select` on their own rows only; all writes go through RPC.

### QR token
`token = base64url(user_id || window || HMAC_SHA256(qr_secret, user_id || window))`, where `window = floor(unix_time / 30)`. The server accepts the current window ±1. The app fetches a signed short-lived *derivation key* from `qr-token` at login and on refresh; the raw secret never leaves the server. Simpler fallback if this is too slow to build: the app calls `qr-token` every 25s, which returns a ready token (needs network, which D-07 assumes).

### Backup code
8 chars from `[A-HJ-NP-Z2-9]` (no ambiguous chars). Stored as a hash. Shown to the student once on generation; regenerable. Each backup-code scan is logged with `method = backup`.

## 6. RLS matrix

| Table | Student | Staff | Manager | Admin |
|---|---|---|---|---|
| profiles | own | read name/roll/photo of a scanned student via RPC only | none | all |
| menu_*, prices, slots | read published | read | read | all |
| bookings | own (read) | via RPC/aggregate | aggregate views only | all |
| ledger_entries, deposits | own (read) | none | none | all |
| scans | own (read) | own inserts via RPC, read today | aggregate | all |
| v_mess_payable | none | none | read | read |

Role comes from a custom JWT claim set by a Supabase Auth hook reading `profiles.role`. Policies use `auth.jwt() ->> 'app_role'`.

## 7. Auth

- Google OAuth via Supabase. A `before user created` auth hook rejects any email not ending in `@iiitkottayam.ac.in` **unless** it is in `role_allowlist`. **BR-40, BR-41**
- New students get `role = student`. Allowlisted emails get their listed role.
- First login forces photo upload (browser camera / file) before booking is enabled.
- Staff/manager/admin without a college email sign in with an email magic link; the allowlist still gates them (open question 1 → D-10).

## 8. Time handling

- One helper in `packages/shared/time.ts`: `slotStart(date, slot)` and `cutoffAt(date, slot)`, both in IST.
- The same calculation exists in SQL (`slot_start_ist()`); pgTAP tests and Vitest tests use identical fixtures.
- Never call `new Date()` for business logic without the helper.

## 9. Environments

| Env | Supabase | Web | Mobile |
|---|---|---|---|
| local | `supabase start` | `pnpm dev` | Expo Go / dev client |
| staging | Supabase project `mess-staging` | Vercel preview | EAS preview build |
| prod | Supabase project `mess-prod` | Vercel prod | EAS production build (Play Store internal → public) |

Secrets live only in Vercel/Supabase/EAS env settings. `.env.example` lists the names, never the values.

## 10. Commit & branch conventions

- Branch per task: `feat/m4-cancel-booking`, `fix/m7-double-scan`.
- Conventional Commits with module scope: `feat(booking): enforce 24h cutoff (BR-02)`.
- **One logical change per commit**; migrations get their own commit.
- A PR must pass CI (lint, typecheck, unit, pgTAP) and touch only one module plus `shared`.
- Never edit an applied migration; add a new one.

## 11. Testing strategy

- **pgTAP** for every SQL function and RLS policy (each role tries allowed and forbidden actions).
- **Vitest** for shared utils (money, time, zod).
- **Playwright** for the admin/manager critical paths.
- Mobile: component tests for booking and QR screens; manual test checklist per release.
- Required scenario tests: cutoff boundary (23:59 vs 24:01), double scan, cancel after lock, price change after booking, pattern switch mid-month, special meal opt-out, insufficient balance.

## 12. Observability & ops

- Supabase logs + Vercel logs; Sentry on web and mobile.
- Daily Postgres backup (Supabase) + weekly manual export of `ledger_entries` to the admin.
- Admin page "System health": last cron run times, failed scans today.
