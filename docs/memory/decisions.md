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
