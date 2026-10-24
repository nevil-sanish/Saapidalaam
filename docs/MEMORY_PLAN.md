# Memory Plan — Keeping Claude CLI (and the team) in Sync

> Claude CLI forgets everything between sessions. The only memory it has is what's in the repo. This file defines **what gets remembered, where, and when it's updated**.

---

## 1. Memory layers

| Layer | File(s) | Loaded | Changes |
|---|---|---|---|
| **Instructions** | `CLAUDE.md` (root) | Automatically, every session | Rarely; only by the tech lead |
| **Area instructions** | `apps/web/CLAUDE.md`, `apps/mobile/CLAUDE.md`, `supabase/CLAUDE.md` | Automatically when Claude works in that folder | When conventions for that area change |
| **Spec** | `docs/PRODUCT.md`, `docs/BUILD_PLAN.md`, `docs/EXECUTION_PLAN.md` | On demand (Claude reads the relevant section) | Through a PR when scope changes |
| **Living memory** | `docs/memory/*.md` | `progress.md` and `decisions.md` are imported by CLAUDE.md; others on demand | Every task |

Keep the auto-loaded set small. Every line in CLAUDE.md and its imports costs context in every session.

## 2. Living memory files (`docs/memory/`)

### `progress.md` — where are we
```md
# Progress
_Last updated: 2026-11-03 by Member B_

## Current phase: P2 — Money + booking

## Done
- T-20 ledger + balance view (PR #14)

## In progress
- T-22 book_meal / cancel_booking — B — branch feat/m4-booking-rpc — cutoff tests written, cancel pending

## Next up
- T-23 lock + no-show cron

## Blocked
- T-27 waiting on open question 2 (deposit flow)
```
**Rule:** keep it under 60 lines. When a phase completes, collapse its Done list into one line.

### `decisions.md` — why things are the way they are (ADR-lite)
```md
## D-09 — Booking writes go through RPC only (2026-11-02)
Context: clients writing bookings directly made balance checks racy.
Decision: revoke insert/update on bookings; use book_meal() security definer.
Consequences: every new booking feature needs an RPC + pgTAP test.
```
**Rule:** append only; to reverse a decision, add a new entry that supersedes the old one (`Supersedes D-04`). IDs continue from PRODUCT.md §9 (D-01…D-08).

### `open-questions.md` — what we don't know yet
Questions with an owner, the phase they block, and the answer once known. When answered, move the result into `decisions.md`.

### `gotchas.md` — traps already hit
Short bullets, for example: "Supabase `now()` is UTC; always go through `slot_start_ist()`" or "Expo push tokens change after reinstall; upsert on login". Claude reads this before touching the related area.

### `modules/<module>.md` (optional)
For large modules (booking, scanning): key functions, invariants and test files, kept to 40 lines.

## 3. Session protocol for Claude CLI

**Start of session**
1. CLAUDE.md, `progress.md` and `decisions.md` load automatically.
2. Read the task row in `EXECUTION_PLAN.md` and the BR-xx it touches in `PRODUCT.md`.
3. Read `gotchas.md` and the `modules/<module>.md` entry if they exist.

**During**
- New non-obvious choice → draft a `decisions.md` entry.
- Hit a trap → add to `gotchas.md`.
- Unclear business rule → stop and ask; record it in `open-questions.md`. Never invent a business rule.

**End of task (before the final commit)**
1. Update `progress.md` (move the task, note the branch/PR).
2. Commit memory updates in the same PR: `docs(memory): progress T-22`.

## 4. Team protocol

- Memory files merge like code. Conflicts in `progress.md` go to whoever merges second, who keeps both entries.
- The tech lead prunes `progress.md` and `gotchas.md` every Saturday demo.
- Personal notes stay out of the repo. Use your own `CLAUDE.local.md` (gitignored) for personal preferences.

## 5. What NOT to put in memory

- Secrets, keys, real student data, roll numbers.
- Transcripts of chats or long logs; summarise in one line instead.
- Anything already obvious from the code or the git log.
- Duplicates of the spec; link to the BR or section instead.

## 6. Bootstrap (run once in P0)

Ask Claude CLI to create these with headers only:
```
docs/memory/progress.md
docs/memory/decisions.md        (copy D-01…D-08 from PRODUCT.md §9)
docs/memory/open-questions.md   (copy PRODUCT.md §10)
docs/memory/gotchas.md
apps/web/CLAUDE.md
apps/mobile/CLAUDE.md
supabase/CLAUDE.md
.gitignore entry: CLAUDE.local.md
```
