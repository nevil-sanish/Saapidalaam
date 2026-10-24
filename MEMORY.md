# MEMORY.md — Saapidalaam
Project index for agents and the team. Details live in `docs/memory/`.

- Status & next task → `docs/memory/progress.md`
- Why things are this way → `docs/memory/decisions.md` (D-09 web-only is the big one)
- Unresolved business questions + provisional answers → `docs/memory/open-questions.md`
- Traps already hit → `docs/memory/gotchas.md`
- Spec → `docs/PRODUCT.md` (BR-xx), `docs/BUILD_PLAN.md` (M0–M13)

## Snapshot
- Web app only; roles: student, staff, manager, admin; one Next.js app, role-guarded routes.
- Supabase local via `npx supabase start`; money in paise; ledger append-only; writes via RPC only.
