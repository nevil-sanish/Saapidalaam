import "server-only";
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { addDays, cutoffAt, slotStart, todayIST } from "./time";

// All money/booking logic lives here, server-only, inside transactions. Browsers never touch tables (rule 3);
// Supabase RLS is on with no policies, so PostgREST exposes nothing (see migration).

export type Role = "student" | "staff" | "manager" | "admin";
export type Diet = "veg" | "nonveg";
export const COLLEGE_DOMAIN = "@iiitkottayam.ac.in";

type Sql = postgres.Sql<{ bigint: number }>;
const g = globalThis as unknown as { __sql?: Sql; __ready?: Promise<void> };
export const sql: Sql = g.__sql ?? (g.__sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:dev@localhost:54329/saapidalaam", {
  ssl: process.env.DATABASE_URL?.includes("localhost") || !process.env.DATABASE_URL ? false : "require",
  types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } }, // paise fit in JS numbers
  prepare: false, // Supabase pooler (transaction mode) friendly
}));
type Tx = postgres.TransactionSql<{ bigint: number }>;

// ---------- boot: migrations + demo seed ----------
export const ready = () => (g.__ready ??= boot());
async function boot() {
  const dir = join(process.cwd(), "supabase/migrations");
  for (const f of readdirSync(dir).sort()) await sql.unsafe(readFileSync(join(dir, f), "utf8"));
  if ((await sql`select count(*)::int as n from meal_slots`)[0].n === 0)
    await sql.unsafe(readFileSync(join(process.cwd(), "supabase/seed.sql"), "utf8"));
  if (process.env.DEMO_SEED !== "off" && (await sql`select count(*)::int as n from profiles`)[0].n === 0) await demoSeed();
}
async function demoSeed() {
  // Fake accounts only (password "password"). Disable with DEMO_SEED=off in production.
  for (const [email, name, role] of [["admin@iiitkottayam.ac.in", "College Admin", "admin"], ["manager@mess.test", "Mess Manager", "manager"], ["staff@mess.test", "Counter Staff", "staff"]] as const) {
    await sql`insert into role_allowlist (email, role) values (${email}, ${role}) on conflict do nothing`;
    await sql`insert into profiles (email, full_name, role, pw_hash) values (${email}, ${name}, ${role}, ${hashPw("password")})`;
  }
  for (const [email, name, roll, code] of [["anu.24bcs01@iiitkottayam.ac.in", "Anu S", "2024BCS0001", "TESTCODE"], ["ravi.24bcs02@iiitkottayam.ac.in", "Ravi K", "2024BCS0002", "RAVICODE"]]) {
    const [p] = await sql`insert into profiles (email, full_name, roll_no, pw_hash, backup_code_hash) values (${email}, ${name}, ${roll}, ${hashPw("password")}, ${codeHash(code)}) returning id`;
    await sql`insert into deposits (student_id, amount, txn_ref, status, verified_at) values (${p.id}, 3000000, 'SEED-TXN', 'verified', now())`;
    await sql`insert into ledger_entries (student_id, kind, amount, ref, note) values (${p.id}, 'deposit', 3000000, 'SEED-TXN', 'seed')`;
  }
}

// ---------- helpers ----------
export const hashPw = (pw: string) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pw, salt, 32).toString("hex");
};
export const checkPw = (pw: string, stored: string | null) => {
  if (!stored) return false;
  const [salt, h] = stored.split(":");
  return timingSafeEqual(Buffer.from(h, "hex"), scryptSync(pw, salt, 32));
};
const codeHash = (s: string) => createHmac("sha256", "backup-code").update(s.trim().toUpperCase()).digest("hex");
export const audit = (q: Sql | Tx, actor: string, action: string, entityId: string | null, diff: unknown) =>
  q`insert into audit_log (actor_id, action, entity_id, diff) values (${actor}, ${action}, ${entityId}, ${q.json(diff as never)})`;
export const notify = (q: Sql | Tx, userId: string, title: string, body: string) =>
  q`insert into notifications (user_id, title, body) values (${userId}, ${title}, ${body})`;
export async function notifyAllStudents(q: Sql | Tx, title: string, body: string) {
  await q`insert into notifications (user_id, title, body) select id, ${title}, ${body} from profiles where role = 'student' and is_active`;
}

export type Slot = { id: number; code: string; label: string; start_time: string; end_time: string; sort: number };
export const slots = async (q: Sql | Tx = sql) =>
  (await q<Slot[]>`select id, code, label, to_char(start_time,'HH24:MI') as start_time, to_char(end_time,'HH24:MI') as end_time, sort from meal_slots order by sort`);
const lock = (t: Tx, studentId: string) => t`select pg_advisory_xact_lock(hashtext(${studentId}))`;

// ---------- jobs (BR-06, BR-13, BR-14) ----------
// ponytail: runs lazily (throttled to once/min) on page loads instead of pg_cron; add a cron hitting /api/tick if pages go quiet.
export async function tick(now = Date.now()) {
  await ready();
  const [r] = await sql`insert into job_runs values ('tick', now()) on conflict (name) do update set last_run = now()
    where job_runs.last_run < now() - interval '1 minute' returning 1 as ran`;
  if (!r) return;
  await sql.begin(async (t) => {
    const due = await t`update bookings set status = 'locked', locked_at = now()
      where status = 'booked' and cutoff_at <= ${new Date(now)} returning id, student_id, price_snapshot`;
    for (const b of due)
      await t`insert into ledger_entries (student_id, kind, amount, booking_id, note) values (${b.student_id}, 'meal_charge', ${-b.price_snapshot}, ${b.id}, 'charged at cutoff (BR-13)')`;
    const ss = await slots(t);
    for (const s of ss) // BR-14: locked + slot ended → no_show (charge stays)
      await t`update bookings b set status = 'no_show' where b.status = 'locked' and b.slot_id = ${s.id}
        and (b.served_on + ${s.end_time}::time) at time zone 'Asia/Kolkata' <= ${new Date(now)}`;
  });
  const pats = await sql<{ id: string }[]>`select id from patterns where is_active and kind = 'weekly'`;
  for (const p of pats) await materialise(p.id, now).catch(() => {}); // BR-06 extend weekly patterns forward
}

// ---------- balance (BR-12, BR-16) ----------
export type Balance = { deposits: number; charges: number; refunds: number; adjustments: number; committed: number; available: number; expectedRefund: number; consumed: number; scheduled: number };
export async function balance(studentId: string, q: Sql | Tx = sql): Promise<Balance> {
  const [r] = await q`select
    coalesce(sum(amount) filter (where kind = 'deposit'), 0)::bigint as deposits,
    coalesce(-sum(amount) filter (where kind = 'meal_charge'), 0)::bigint as charges,
    coalesce(-sum(amount) filter (where kind = 'refund'), 0)::bigint as refunds,
    coalesce(sum(amount) filter (where kind = 'adjustment'), 0)::bigint as adjustments,
    (select coalesce(sum(price_snapshot), 0)::bigint from bookings where student_id = ${studentId} and status = 'booked') as committed,
    (select count(*)::int from bookings where student_id = ${studentId} and status = 'served') as consumed,
    (select count(*)::int from bookings where student_id = ${studentId} and status in ('booked','locked')) as scheduled
    from ledger_entries where student_id = ${studentId}`;
  const available = r.deposits - r.charges - r.refunds + r.adjustments - r.committed;
  return { ...(r as unknown as Balance), available, expectedRefund: available };
}
const LOW_BALANCE = 50000; // ₹500

// ---------- booking (BR-02, 03, 04, 08, 12) ----------
export async function priceFor(q: Sql | Tx, date: string, slotId: number, diet: Diet) {
  const [sp] = await q`select special_price from menu_entries where served_on = ${date} and slot_id = ${slotId} and diet = ${diet}`;
  if (sp?.special_price != null) return { amount: Number(sp.special_price), special: true };
  const [p] = await q`select amount from prices where slot_id = ${slotId} and diet = ${diet}`;
  if (!p) throw new Error("No price set for this slot");
  return { amount: Number(p.amount), special: false };
}

async function insertBooking(t: Tx, studentId: string, date: string, slot: Slot, diet: Diet, source: "pattern" | "oneoff" | "special", patternId: string | null, now: number) {
  const cutoff = cutoffAt(date, slot.start_time);
  if (now >= cutoff) throw new Error("Booking closes 24h before the meal (BR-02)");
  const [ex] = await t`select id, source from bookings where student_id = ${studentId} and served_on = ${date} and slot_id = ${slot.id} and status <> 'cancelled'`;
  if (ex) throw new Error("Already booked for this slot (BR-04)");
  const { amount, special } = await priceFor(t, date, slot.id, diet);
  if ((await balance(studentId, t)).available < amount) throw new Error("Insufficient balance (BR-12)");
  await t`insert into bookings (student_id, served_on, slot_id, diet, source, pattern_id, price_snapshot, is_special, status, cutoff_at)
    values (${studentId}, ${date}, ${slot.id}, ${diet}, ${special && source === "oneoff" ? "special" : source}, ${patternId}, ${amount}, ${special}, 'booked', ${new Date(cutoff)})`;
}

export async function bookMeal(studentId: string, date: string, slotId: number, diet: Diet, now = Date.now()) {
  await sql.begin(async (t) => {
    await lock(t, studentId);
    const [p] = await t`select photo is not null as has from profiles where id = ${studentId}`;
    if (!p?.has) throw new Error("Upload your profile photo before booking");
    const slot = (await slots(t)).find((s) => s.id === slotId);
    if (!slot) throw new Error("Unknown slot");
    await insertBooking(t, studentId, date, slot, diet, "oneoff", null, now);
    const b = await balance(studentId, t);
    if (b.available < LOW_BALANCE) await notify(t, studentId, "Low balance", `Available balance is below ₹500.`);
  });
}

export async function cancelBooking(studentId: string, bookingId: string, now = Date.now()) {
  await sql.begin(async (t) => {
    const [b] = await t`select status, cutoff_at from bookings where id = ${bookingId} and student_id = ${studentId} for update`;
    if (!b) throw new Error("Booking not found");
    if (b.status !== "booked" || now >= new Date(b.cutoff_at).getTime()) throw new Error("Locked after cutoff (BR-03)");
    await t`update bookings set status = 'cancelled', cancelled_at = now() where id = ${bookingId}`;
  });
}

// ---------- patterns (BR-05, 06, 07) ----------
export type Rule = { slot: number; diet: Diet };
export type PatternRules = Record<string, Rule[]>; // weekly: ISO weekday "1".."7"; monthly: "YYYY-MM-DD"
const HORIZON_DAYS = 28;
const isoDow = (date: string) => ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;

export async function savePattern(studentId: string, kind: "weekly" | "monthly", rules: PatternRules, month: string | null, now = Date.now()) {
  if (kind === "monthly") {
    if (!month || !/^\d{4}-\d{2}-01$/.test(month)) throw new Error("Pick a month");
    const [pub] = await sql`select 1 from menu_months where month = ${month}`;
    if (!pub) throw new Error("Menu for that month isn't published yet (BR-07)");
    if (Object.keys(rules).some((d) => !d.startsWith(month.slice(0, 7)))) throw new Error("Dates must be inside the month");
  }
  const id = await sql.begin(async (t) => {
    await lock(t, studentId);
    // BR-05: one active pattern; switching drops future pre-cutoff pattern bookings.
    await t`update patterns set is_active = false where student_id = ${studentId} and is_active`;
    await t`update bookings set status = 'cancelled', cancelled_at = now()
      where student_id = ${studentId} and source = 'pattern' and status = 'booked' and cutoff_at > ${new Date(now)}`;
    const [p] = await t`insert into patterns (student_id, kind, month, rules) values (${studentId}, ${kind}, ${month}, ${t.json(rules as never)}) returning id`;
    return p.id as string;
  });
  return materialise(id, now);
}

/** Creates bookings for every pattern slot beyond cutoff. Skips taken slots (one-offs override, BR-04); stops a day's slot on low balance. */
export async function materialise(patternId: string, now = Date.now()) {
  return sql.begin(async (t) => {
    const [p] = await t`select * from patterns where id = ${patternId} and is_active`;
    if (!p) return { created: 0, skipped: 0 };
    await lock(t, p.student_id);
    const ss = await slots(t);
    const today = todayIST(now);
    const dates = p.kind === "weekly"
      ? Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(today, i + 1))
      : Object.keys(p.rules).sort();
    let created = 0, skipped = 0;
    for (const date of dates) {
      const rules: Rule[] = p.kind === "weekly" ? p.rules[String(isoDow(date))] ?? [] : p.rules[date] ?? [];
      for (const r of rules) {
        const slot = ss.find((s) => s.id === Number(r.slot));
        if (!slot || now >= cutoffAt(date, slot.start_time)) continue;
        // BR-04: a cancelled pattern slot stays cancelled — respect the student's override.
        const [ex] = await t`select 1 from bookings where student_id = ${p.student_id} and served_on = ${date} and slot_id = ${slot.id}
          and (status <> 'cancelled' or (pattern_id = ${patternId}))`;
        if (ex) continue;
        try { await t.savepoint((s) => insertBooking(s as unknown as Tx, p.student_id, date, slot, r.diet, "pattern", patternId, now)); created++; }
        catch { skipped++; }
      }
    }
    if (skipped) await notify(t, p.student_id, "Some pattern meals were not booked", `${skipped} meal(s) skipped (insufficient balance or no price).`);
    return { created, skipped };
  });
}

/** BR-07: publishing a month's menu. Monthly packages never roll over; students must re-pick. */
export async function publishMonth(adminId: string, month: string) {
  await sql.begin(async (t) => {
    await t`insert into menu_months (month) values (${month}) on conflict (month) do update set published_at = now()`;
    await notifyAllStudents(t, "Menu published", `The menu for ${month.slice(0, 7)} is out. Confirm or pick your monthly package.`);
    await audit(t, adminId, "menu.publish", month, { month });
  });
}

// ---------- specials (BR-20..23) ----------
export async function createSpecial(adminId: string, date: string, slotId: number, items: string, prices: Record<Diet, number>, now = Date.now()) {
  if (date < addDays(todayIST(now), 3)) throw new Error("Special meals need at least 3 days notice (BR-20)");
  await sql.begin(async (t) => {
    for (const diet of ["veg", "nonveg"] as const) {
      await t`insert into menu_entries (served_on, slot_id, diet, items, special_price) values (${date}, ${slotId}, ${diet}, ${items}, ${prices[diet]})
        on conflict (served_on, slot_id, diet) do update set items = excluded.items, special_price = excluded.special_price`;
      // BR-21: existing (unlocked) bookings move to the special automatically; student may opt out until cutoff.
      const moved = await t`update bookings set price_snapshot = ${prices[diet]}, is_special = true
        where served_on = ${date} and slot_id = ${slotId} and diet = ${diet} and status = 'booked' returning student_id, price_snapshot`;
      for (const m of moved) await notify(t, m.student_id, "You're on a special meal", `Your ${date} booking moved to the special meal (${items}). Opt out before cutoff if you don't want it.`);
    }
    await notifyAllStudents(t, "Special meal announced", `${date}: ${items}. Prebook before the cutoff.`); // BR-23
    await audit(t, adminId, "special.create", `${date}/${slotId}`, { items, prices });
  });
}

// ---------- QR + backup code (BR-30, BR-31) ----------
const WINDOW = 30_000;
const sign = (secret: string, userId: string, w: number) => createHmac("sha256", secret).update(`${userId}.${w}`).digest("base64url").slice(0, 22);
export async function qrToken(userId: string, now = Date.now()) {
  const [p] = await sql`select qr_secret from profiles where id = ${userId}`;
  const w = Math.floor(now / WINDOW);
  return { token: `${userId}.${w}.${sign(p.qr_secret, userId, w)}`, expiresAt: (w + 1) * WINDOW };
}
async function verifyQr(t: Tx, token: string, now: number) {
  const [userId, ws, sig] = token.trim().split(".");
  if (!/^[0-9a-f-]{36}$/.test(userId ?? "") || !sig) return null;
  const w = Number(ws);
  if (Math.abs(w - Math.floor(now / WINDOW)) > 1) return null; // current window ±1
  const [p] = await t`select qr_secret from profiles where id = ${userId} and role = 'student' and is_active`;
  if (!p) return null;
  const exp = Buffer.from(sign(p.qr_secret, userId, w)), got = Buffer.from(sig);
  return exp.length === got.length && timingSafeEqual(exp, got) ? userId : null;
}
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export async function regenerateBackupCode(userId: string) {
  const code = Array.from(randomBytes(8), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
  await sql`update profiles set backup_code_hash = ${codeHash(code)} where id = ${userId}`;
  return code; // shown once
}

// ---------- scan (BR-32, 33, 34) ----------
export type ScanResult = {
  result: "served" | "already_served" | "no_booking" | "invalid_token" | "outside_window";
  student?: { id: string; full_name: string; roll_no: string | null }; servedAt?: string; servedBy?: string; slot?: string; flagged?: boolean;
};
export async function scan(staffId: string, input: string, method: "qr" | "backup", now = Date.now()): Promise<ScanResult> {
  return sql.begin(async (t) => {
    const log = (result: ScanResult["result"], studentId: string | null, bookingId: string | null) =>
      t`insert into scans (booking_id, student_id, staff_id, method, result) values (${bookingId}, ${studentId}, ${staffId}, ${method}, ${result})`;
    const studentId = method === "qr" ? await verifyQr(t, input, now)
      : ((await t`select id from profiles where backup_code_hash = ${codeHash(input)} and role = 'student' and is_active`)[0]?.id ?? null);
    if (!studentId) { await log("invalid_token", null, null); return { result: "invalid_token" }; }
    const [student] = await t<{ id: string; full_name: string; roll_no: string | null }[]>`select id, full_name, roll_no from profiles where id = ${studentId}`;
    const flagged = method === "backup";
    const today = todayIST(now);
    const slot = (await slots(t)).find((s) => slotStart(today, s.start_time) <= now && now < slotStart(today, s.end_time));
    if (!slot) { await log("outside_window", studentId, null); return { result: "outside_window", student, flagged }; }
    const [b] = await t`select id, status from bookings where student_id = ${studentId} and served_on = ${today} and slot_id = ${slot.id}
      and status <> 'cancelled' for update`;
    if (!b) { await log("no_booking", studentId, null); return { result: "no_booking", student, slot: slot.label, flagged }; }
    if (b.status === "served") {
      const [prev] = await t`select s.scanned_at, p.full_name from scans s join profiles p on p.id = s.staff_id where s.booking_id = ${b.id} and s.result = 'served'`;
      await log("already_served", studentId, b.id);
      return { result: "already_served", student, slot: slot.label, servedAt: prev?.scanned_at?.toISOString(), servedBy: prev?.full_name, flagged };
    }
    if (b.status === "booked") // edge: cutoff job hasn't run yet — post the charge now (BR-13)
      await t`insert into ledger_entries (student_id, kind, amount, booking_id, note) select student_id, 'meal_charge', -price_snapshot, id, 'charged at serve' from bookings where id = ${b.id}`;
    await t`update bookings set status = 'served', locked_at = coalesce(locked_at, now()) where id = ${b.id}`;
    await log("served", studentId, b.id);
    return { result: "served", student, slot: slot.label, flagged };
  });
}

// ---------- current slot (staff live counts) ----------
export async function currentOrNextSlot(now = Date.now()) {
  const today = todayIST(now);
  const ss = await slots();
  return ss.find((s) => now < slotStart(today, s.end_time)) ?? ss[ss.length - 1];
}
