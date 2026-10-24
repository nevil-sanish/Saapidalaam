# CLAUDE.md — Mess Management System

Campus mess booking system for IIIT Kottayam. Students pre-book meals (≥24h ahead) paid from a semester deposit; staff verify at the counter with a rotating QR; the manager sees demand; the admin sees everything.

## Read first
- What to build: `docs/PRODUCT.md` (business rules are numbered **BR-xx**; cite them)
- How to build: `docs/BUILD_PLAN.md`
- Task list and owners: `docs/EXECUTION_PLAN.md` (tasks **T-xx**)
- How memory works: `docs/MEMORY_PLAN.md`

@docs/memory/progress.md
@docs/memory/decisions.md

## Stack
pnpm + Turborepo monorepo · Next.js 15 (App Router, TS, Tailwind, shadcn/ui) on Vercel for admin/manager/staff web · Expo (React Native, Expo Router) for student + staff mobile · Supabase (Postgres, Auth with Google, Storage, Edge Functions, pg_cron) · Zod · TanStack Query · Vitest · pgTAP · Playwright.

## Layout
```
apps/web        Next.js: /admin /manager /staff
apps/mobile     Expo: (student) (staff)
packages/shared zod schemas, types, money + time helpers
packages/supabase-client  typed client + generated types
supabase/       migrations/ functions/ tests/ seed.sql
```

## Commands
```
pnpm i                      # install
pnpm dev                    # all apps
supabase start              # local db
supabase db reset           # re-run migrations + seed
pnpm db:types               # regenerate DB types after a migration
pnpm test                   # vitest
supabase test db            # pgTAP
pnpm lint && pnpm typecheck
```

## Non-negotiable rules
1. **Money is integer paise (`bigint`).** Never floats. Format only at the UI edge via `packages/shared/money.ts`.
2. **Ledger is append-only.** No UPDATE/DELETE on `ledger_entries`; corrections are `adjustment` rows with a note.
3. **Clients never write** `bookings`, `ledger_entries`, `deposits` or `scans` directly. Use SQL functions (RPC) or Edge Functions.
4. **Every table has RLS** plus pgTAP tests for each role (allowed and denied).
5. **Time = Asia/Kolkata.** Compute slot start and cutoff only via `packages/shared/time.ts` / `slot_start_ist()`. Never raw `new Date()` for business logic.
6. **Booking price is snapshotted** at creation (BR-08).
7. **Manager must never see per-student financial data** (BR-42).
8. Never edit an applied migration; add a new one. Regenerate types after.
9. No secrets in code or memory files. Use `.env.example` for names only.
10. **Never invent a business rule.** If PRODUCT.md doesn't cover it, stop, ask, and log it in `docs/memory/open-questions.md`.

## Workflow per task
1. Identify the task ID (T-xx) and its BR-xx; read only those sections.
2. Create branch `feat/m<N>-<short-name>` (or `fix/...`).
3. For DB work, write the migration and pgTAP test first, then the function, then types, then UI.
4. Keep changes inside one module plus `packages/shared`.
5. Run lint, typecheck, unit tests and pgTAP. All must pass.
6. Commit small and often with Conventional Commits scoped to the module:
   `feat(booking): reject cancellation after cutoff (BR-03)`. Migrations get their own commit.
7. Update `docs/memory/progress.md` (+ `decisions.md` / `gotchas.md` if relevant) and commit:
   `docs(memory): progress T-22`.
8. Summarise what changed, the tests run, and any open questions.

## Style
- TypeScript strict; no `any`. Shared types come from `packages/shared` or generated DB types.
- Validate every external input with Zod (forms, Edge Function bodies).
- SQL: snake_case, explicit `security definer` + `set search_path = public` on RPCs, check `auth.uid()` and role inside.
- UI: role-specific screens only show what that role may see; don't rely on hiding as security.

## Don't
- Don't add dependencies without saying why in the commit body.
- Don't bypass RLS with the service role from the client or web components.
- Don't change PRODUCT.md business rules in a feature PR.
- Don't commit real student data; use `seed.sql` fake data only.
