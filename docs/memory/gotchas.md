# Gotchas
- Supabase `now()` is UTC; business dates/times go through `slot_start_ist()` / `src/lib/time.ts`.
- Global `supabase` npm CLI is broken on this machine (no linux-x64 binary); use `npx supabase`.
- Server actions default to a 1MB body; `next.config.ts` raises it to 3mb for photo upload.
- `server-only` imports break plain Node; engine tests run with `tsx --conditions=react-server`.
- Engine tests mutate data (tick with future clock) — they use the separate `saapidalaam_test` DB.
- Backup codes are shown once via the `?ok=` flash (ends up in browser history) — hardening item.
