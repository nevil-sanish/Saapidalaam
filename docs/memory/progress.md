# Progress
_Last updated: 2026-10-24_

## Current phase: MVP deploying — Render https://saapidalaam.onrender.com + Supabase project hpzkbgyblzfjnpcgjsol (ap-south-1)

## Done
- P0 repo + web-only edit (D-09); memory bootstrap
- Core engine `src/lib/db.ts`: booking/cutoff/lock/no-show, ledger, patterns (weekly + monthly), specials, QR + backup code, scan
- Auth: Google via Supabase Auth + password fallback; BR-40/41 server-side (`src/lib/auth.ts`)
- Student, staff, manager, admin web pages (all roles), CSV exports, health page
- Tests: `npm test` (money/time), `npm run test:engine` (8 BR scenario tests, pass); `next build` green

## In progress
- Deploy: schema pushed (`supabase db push --linked`); Render srv-dbe5o5rrjlhs7394i2ag env set; Google OAuth client in GCP project "Saapidalaam" (algebraic-ward-512607-b8), provider enabled via `supabase config push`
- Team roles (migration 20261024010000): nevilmathew25bcd11 admin, sanjay25bcd07 manager, akashdinesh25bcd03 staff, kutalaeshanth25bcd19 student

## Next up
- Confirm D-10..D-12 provisional answers; open questions 4–6
- Hardening (M13): Zod for inputs, cron for `tick()`, backup code shown via action state not URL, browser test of camera scanner

## Blocked
- Google app is in Testing mode (4 test users). To open to all students: add privacy policy + homepage on GCP Branding page, then Publish app

## Parked
- Supabase-native rewrite (RPC/RLS policies/Edge Functions/monorepo) — owner chose MVP; WIP in `git stash` "wip: supabase-native conversion"
