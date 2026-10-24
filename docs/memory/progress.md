# Progress
_Last updated: 2026-10-24_

## Current phase: MVP complete locally → deploy (Supabase + Render)

## Done
- P0 repo + web-only edit (D-09); memory bootstrap
- Core engine `src/lib/db.ts`: booking/cutoff/lock/no-show, ledger, patterns (weekly + monthly), specials, QR + backup code, scan
- Auth: Google via Supabase Auth + password fallback; BR-40/41 server-side (`src/lib/auth.ts`)
- Student, staff, manager, admin web pages (all roles), CSV exports, health page
- Tests: `npm test` (money/time), `npm run test:engine` (8 BR scenario tests, pass); `next build` green

## In progress
- Deploy: needs `npx supabase login` + Google OAuth client from owner

## Next up
- Confirm D-10..D-12 provisional answers; open questions 4–6
- Hardening (M13): Zod for inputs, cron for `tick()`, backup code shown via action state not URL, browser test of camera scanner

## Blocked
- Supabase project creation: CLI not logged in
