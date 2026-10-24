# Build Plan — Technical Architecture

> *How* we build it. Read `docs/PRODUCT.md` for the business rules (BR-xx) referenced here.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Shared types/logic between web and mobile |
| Web (admin, manager, staff) | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui, on **Vercel** | One app, role-based routes |
| Mobile (student, staff) | Expo (React Native) + TypeScript + Expo Router | One codebase, push via Expo Notifications, camera for scanning |
| Backend | **Supabase**: Postgres, Auth (Google), Storage, Edge Functions, pg_cron | RLS + SQL functions keep money logic in one transactional place |
| Validation | Zod (shared) | Same schemas on client and Edge Functions |
| Server state | TanStack Query | Caching + realtime invalidation |
| Testing | Vitest (shared), pgTAP (DB), Playwright (web e2e) | |
| CI | GitHub Actions | lint, typecheck, test, `supabase db lint` |

## 2. Repository layout

```
mess-app/
├── CLAUDE.md                  # agent instructions (auto-loaded by Claude CLI)
├── docs/
│   ├── PRODUCT.md
│   ├── BUILD_PLAN.md
│   ├── EXECUTION_PLAN.md
│   ├── MEMORY_PLAN.md
│   └── memory/                # living memory (see MEMORY_PLAN.md)
├── apps/
│   ├── web/                   # Next.js: /admin, /manager, /staff
│   └── mobile/                # Expo: (student) and (staff) route groups
├── packages/
│   ├── shared/                # zod schemas, types, money + time utils, constants
│   └── supabase-client/       # typed client, generated DB types, query hooks
└── supabase/
    ├── migrations/            # numbered SQL, one module per file group
    ├── functions/             # Edge Functions (Deno)
    ├── tests/                 # pgTAP
    └── seed.sql
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
| M8 | `student-app` | All student screens |
| M9 | `staff-app` | Scanner (mobile + web), live counts |
| M10 | `manager-web` | Demand views, payable, export |
| M11 | `admin-web` | Config, finance, audit, reports |
| M12 | `notifications` | Push tokens, triggers, scheduled reminders |
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
push_tokens (user_id, token text, platform, updated_at)
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
| QR token generation | Mobile, from a short-lived token fetched via Edge Function `qr-token` | Secret never stored on device long-term |
| Scan | Edge Function `scan` → SQL `serve_booking` | Verify HMAC, then transactional serve |
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
- First login forces photo upload (mobile camera) before booking is enabled.

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
