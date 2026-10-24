# Saapidalaam

IIIT Kottayam mess system: students pre-book meals at least 24h ahead and pay from a semester deposit. Staff verify each student at the counter with a rotating QR code. The manager sees demand, and the admin sees everything. **Every role uses one web app** (D-09).

| Role | Routes |
|---|---|
| Student | `/student` dashboard · menu & booking · weekly/monthly pattern · QR + backup code · deposit · notifications |
| Staff | `/staff` camera scanner + backup code · live counts |
| Manager | `/manager` demand · payable · CSV (no per-student money, BR-42) |
| Admin | `/admin` catalog · menu · specials · users/allowlist · finance · audit · reports · health |

Spec: `docs/PRODUCT.md` (BR-xx) · architecture: `docs/BUILD_PLAN.md` · memory: `MEMORY.md`.

## Run locally
```
docker run -d --name saapidalaam-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=saapidalaam -p 54329:5432 postgres:17-alpine
npm i
npm run dev            # migrations + seed run on first request
npm test               # unit (money/time)
npm run test:engine    # BR scenario tests against Postgres (db: saapidalaam_test)
```
Demo accounts (password `password`, disable with `DEMO_SEED=off`): `admin@iiitkottayam.ac.in`, `manager@mess.test`, `staff@mess.test`, `anu.24bcs01@iiitkottayam.ac.in`. The students' backup code is `TESTCODE`.

## Deploy
- **Supabase** (CLI): `npx supabase login`, then `npx supabase link --project-ref <ref>`, `npx supabase db push`, and `npx supabase config push` (this also enables Google auth with `SUPABASE_AUTH_EXTERNAL_GOOGLE_*`).
- **Render** web service: build `npm ci && npm run build`, start `npm start`, env vars from `.env.example`.
- In Google Cloud Console, add the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
