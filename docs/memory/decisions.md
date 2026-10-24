# Decisions
D-01…D-08: see `docs/PRODUCT.md` §9.

## D-09 — Web app only (2026-10-24)
Context: owner asked for every role on the web, no mobile app.
Decision: one Next.js app with role routes `/student /staff /manager /admin`; no Expo, no Turborepo/monorepo (nothing to share across apps). Push notifications → in-app `notifications` table.
Consequences: staff scanner uses the browser camera (`BarcodeDetector` with jsQR fallback). Shared code lives in `src/lib`.

## D-10 — Non-college logins use magic link (2026-10-24) *(provisional, open question 1)*
Staff/manager/admin sign in with Google or email magic link; the `before user created` hook allows non-college emails only if they're in `role_allowlist` (BR-41).

## D-11 — Deposit flow: student submits txn ref, admin verifies (2026-10-24) *(provisional, open question 2)*
Matches T-27. Bulk import from a bank statement is phase 2.

## D-12 — Default slots (2026-10-24) *(provisional, open question 3)*
Seeded B 07:30–09:30, L 12:30–14:00, S 16:30–17:30, D 19:30–21:30. Admin can edit them in the app.

## D-13 — QR verified in Postgres (2026-10-24)
HMAC check runs in SQL (pgcrypto `hmac`) inside the `scan_qr` RPC instead of an Edge Function, so verify + serve is one round trip and one transaction.

## D-14 — Server-side data access instead of client RLS policies (2026-10-24)
Context: 1-hour build; RLS policies × 4 roles + pgTAP is days of work.
Decision: browser never talks to Supabase data APIs. All tables have RLS enabled with **no** policies (deny-all for anon/authenticated); the Next.js server connects as owner and enforces roles in `requireRole` + per-function checks.
Consequences: the service connection string is a crown-jewel secret (server env only). Per-role RLS policies + pgTAP remain a hardening task (T-60).

## D-15 — App session cookie, Supabase only as identity provider (2026-10-24)
Google login via Supabase Auth; on callback we resolve the profile (BR-40/41) and issue our own HMAC-signed httpOnly cookie. Password login stays for allowlisted / demo accounts without Google.

## D-16 — Jobs run lazily on requests (2026-10-24)
`tick()` (lock at cutoff, no-shows, extend weekly patterns) runs at most once a minute on page loads instead of pg_cron. Upgrade: pg_cron or a Render cron hitting a tick endpoint.

## D-17 — Google-only, college-domain-only sign-in for every role (2026-10-24)
Owner asked for Google auth only from @iiitkottayam.ac.in. Password login and the production demo seed are removed; the allowlist only assigns staff/manager/admin roles. Supersedes D-10 (magic link for non-college staff).
