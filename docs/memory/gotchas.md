# Gotchas
- Supabase `now()` is UTC; business dates/times go through `slot_start_ist()` / `src/lib/time.ts`.
- Global `supabase` npm CLI is broken on this machine (no linux-x64 binary); use `npx supabase`.
