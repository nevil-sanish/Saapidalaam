# Execution Plan — Team, Timeline, Tasks

> **D-09: web app only.** Mobile tasks (T-04, T-11, T-25…T-27, T-32, T-33, T-40, T-52) are delivered as web screens in the same Next.js app.

> *Who* builds *what* and *when*. Team of 6. Names are placeholders. Start: Mon 26 Oct 2026.
> Each task ID (T-xx) maps to a branch and is completed by one or more commits. Modules M0–M13 are defined in `BUILD_PLAN.md`.

---

## 1. Team (dummy distribution)

| Member | Role | Owns modules | Backup for |
|---|---|---|---|
| **A** | Tech lead + database | M0, M1 (DB side), M3, reviews all SQL/RLS | B |
| **B** | Backend: booking engine | M4, M5, M6, cron jobs | A |
| **C** | Backend: scanning + notifications | M7, M12, Edge Functions | B |
| **D** | Web: admin | M11, shared web UI kit | E |
| **E** | Web: manager + staff web | M10, M9 (web scanner), M2 admin screens | D |
| **F** | Mobile: student + staff app | M8, M9 (mobile), M1 (mobile login/photo) | C |

**Rules**
- Every PR needs one reviewer. SQL/RLS PRs are always reviewed by A.
- Shared packages (`packages/shared`) changes need a heads-up in the team chat.
- Daily 10-min standup; weekly demo on Saturday.

## 2. Phases & milestones

| Phase | Weeks | Dates | Milestone (exit criteria) |
|---|---|---|---|
| P0 Setup | W0 | 26 Oct – 1 Nov | Repo, CI green, Supabase staging live, Vercel + EAS preview builds work, open questions 1–3 answered |
| P1 Foundation | W1–W2 | 2 – 15 Nov | Login works for all 4 roles; admin can create a semester, slots, prices, menu |
| P2 Core money + booking | W3–W4 | 16 – 29 Nov | Student can deposit (admin-verified), book/cancel, set patterns; locking + charges + balance correct in pgTAP |
| P3 Counter | W5 | 30 Nov – 6 Dec | Staff scans the rotating QR / backup code, photo shown, double scan blocked, live counts |
| P4 Dashboards | W6 | 7 – 13 Dec | Student transparency dashboard, manager demand views, admin finance + audit |
| P5 Specials + notifications | W7 | 14 – 20 Dec | Special meals end to end, push notifications live |
| P6 Hardening | W8 | 21 – 27 Dec | Security review, load test (500 scans / 15 min), bug bash, backup restore drill |
| P7 Pilot | W9–W10 | Jan 2027 (start of semester) | 1 hostel block / ~100 students, run in parallel with the current system |
| P8 Rollout | W11+ | after pilot review | All students; register-based process retired |

Adjust dates to your academic calendar. Exams will slow P4–P6.

## 3. Task backlog

### P0 — Setup (owner → task)
- **T-01** A: pnpm + Turborepo monorepo, TS config, ESLint/Prettier, CI workflow.
- **T-02** A: Supabase local + staging, migration pipeline, generated types into `packages/supabase-client`.
- **T-03** E: Next.js app skeleton, Tailwind + shadcn, role-based layout shells.
- **T-04** F: Expo app skeleton, Expo Router groups `(student)`, `(staff)`, EAS config.
- **T-05** All: read PRODUCT.md; A collects answers to open questions 1–3.

### P1 — Foundation
- **T-10** A: `profiles`, `role_allowlist`, enum types, auth hook (domain + allowlist), JWT role claim. pgTAP.
- **T-11** F: mobile Google login, first-run photo capture + upload to private bucket.
- **T-12** E: web Google login, role redirect (`/admin`, `/manager`, `/staff`).
- **T-13** A: catalog tables (semesters, slots, prices, menu_cycles, menu_entries) + RLS.
- **T-14** E: admin screens for semesters, slots, prices.
- **T-15** D: admin menu builder (month grid, slot × diet items, publish).
- **T-16** D: admin user management + allowlist screens.

### P2 — Money + booking
- **T-20** A: `deposits`, `ledger_entries` (append-only trigger), `v_student_balance`. pgTAP for balance math.
- **T-21** D: admin deposit verification + refund + adjustment screens.
- **T-22** B: `bookings` table, `book_meal`, `cancel_booking` RPCs (BR-02, 03, 04, 08, 12). pgTAP boundary tests.
- **T-23** B: `lock_due_bookings`, `mark_no_shows` cron jobs (BR-13, 14).
- **T-24** B: `patterns`, `save_pattern` + materialisation, `extend_patterns` cron (BR-05, 06, 07).
- **T-25** F: student menu view, one-off book/cancel with cutoff countdown.
- **T-26** F: weekly pattern editor + monthly package editor.
- **T-27** F: deposit screen (enter txn ref, status).

### P3 — Counter
- **T-30** C: `qr-token` Edge Function + HMAC scheme; backup code generation/regeneration.
- **T-31** C: `scan` Edge Function + `serve_booking` SQL (BR-30–34); scan log incl. failures.
- **T-32** F: student QR screen (auto-refresh, max brightness) + backup code view.
- **T-33** F: staff mobile scanner (camera) + result card with photo.
- **T-34** E: staff web scanner (webcam + backup code input) + live counts and remaining list.

### P4 — Dashboards
- **T-40** F: student transparency dashboard + ledger history (BR-16).
- **T-41** E: manager demand views (day/week/month), locked vs estimate, payable, CSV.
- **T-42** D: admin overview, per-student drill-down, scan audit, reports, CSV.

### P5 — Specials + notifications
- **T-50** B: special meals: create, auto-move, opt-out, prebook (BR-20–23).
- **T-51** D: admin special-meal creation screen.
- **T-52** F: student special-meal card with extra cost + opt-out.
- **T-53** C: push tokens, `notify` function, triggers: menu published, special announced, package confirmation needed, low balance, optional cutoff reminder.

### P6 — Hardening
- **T-60** A: RLS audit (every table × every role), secrets check, rate limit on `scan`.
- **T-61** C: load test the scan path; tune indexes.
- **T-62** All: bug bash with the scenario list from BUILD_PLAN §11.
- **T-63** A: backup + restore drill; runbook for cron failure and a bad price published.

### P7 — Pilot
- **T-70** Onboard the pilot block; brief mess staff (15-min training on scanning + backup code).
- **T-71** Daily reconciliation: app served count vs kitchen count.
- **T-72** Feedback form; triage weekly.

## 4. Dependencies (critical path)

```
T-01 → T-02 → T-10 → T-13 → T-20 → T-22 → T-24 → T-31 → T-40/41/42 → T-60 → pilot
                       └→ T-11/T-12 (parallel)        └→ T-30 (parallel from W4)
```
Blocking risk: **T-22 (booking RPC)**. B starts it in W2 against draft tables if T-20 slips.

## 5. Definition of Done (every task)

- [ ] Business rules referenced in code comments/tests (BR-xx)
- [ ] pgTAP / Vitest tests pass; new RLS has allow + deny tests
- [ ] Typecheck + lint clean
- [ ] Conventional commit(s) scoped to the module
- [ ] `docs/memory/progress.md` updated; new decisions added to `docs/memory/decisions.md`

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Admin/contractor rejects the no-show charging or deposit model | Med | High | Get sign-off on PRODUCT.md §5 before P2 |
| Manager/staff can't log in (no college email) | High | High | Allowlist (BR-41); resolve open question 1 in P0 |
| Mess Wi-Fi fails at peak (D-07) | Med | High | Measure during pilot; keep a printed booked list as fallback; offline mode as a phase-2 candidate |
| Cutoff/timezone bugs | Med | High | Single time helper + boundary tests |
| Exams stall the team | High | Med | Buffer week; freeze scope after P4 |
| App store review delay (iOS) | Med | Med | Android first; iOS via TestFlight for pilot |
