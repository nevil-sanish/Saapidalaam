// Scenario tests (BUILD_PLAN §11) against a real Postgres. Run: npm run test:engine (needs DATABASE_URL or local docker pg).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { sql, ready, bookMeal, cancelBooking, balance, scan, tick, savePattern, createSpecial, slots, regenerateBackupCode } from "../src/lib/db";
import { addDays, cutoffAt, slotStart, todayIST } from "../src/lib/time";

after(() => sql.end());

async function freshStudent(depositPaise = 100_000) {
  await ready();
  const email = `t${Math.random().toString(36).slice(2, 10)}@iiitkottayam.ac.in`;
  const [p] = await sql`insert into profiles (email, full_name, roll_no, photo, photo_type) values (${email}, 'Test', ${email.slice(0, 11)}, '\\x00', 'image/png') returning id`;
  await sql`insert into ledger_entries (student_id, kind, amount, note) values (${p.id}, 'deposit', ${depositPaise}, 'test')`;
  return p.id as string;
}
const lunch = async () => (await slots()).find((s) => s.code === "L")!;
const [staff] = await (async () => { await ready(); return sql`select id from profiles where role = 'staff' limit 1`; })();

test("cutoff boundary: 24h01m ok, 23h59m rejected (BR-02)", async () => {
  const id = await freshStudent();
  const L = await lunch(), date = addDays(todayIST(), 5);
  const c = cutoffAt(date, L.start_time);
  await assert.rejects(bookMeal(id, date, L.id, "veg", c + 60_000), /24h/);
  await bookMeal(id, date, L.id, "veg", c - 60_000);
});

test("double booking rejected (BR-04) and cancel after lock rejected (BR-03)", async () => {
  const id = await freshStudent();
  const L = await lunch(), date = addDays(todayIST(), 5);
  await bookMeal(id, date, L.id, "veg");
  await assert.rejects(bookMeal(id, date, L.id, "nonveg"), /Already/);
  const [b] = await sql`select id, cutoff_at from bookings where student_id = ${id}`;
  await assert.rejects(cancelBooking(id, b.id, new Date(b.cutoff_at).getTime() + 1), /Locked/);
  await cancelBooking(id, b.id);
});

test("insufficient balance (BR-12) and committed value counts", async () => {
  const id = await freshStudent(7000); // exactly one veg lunch
  const L = await lunch();
  await bookMeal(id, addDays(todayIST(), 5), L.id, "veg");
  assert.equal((await balance(id)).available, 0);
  await assert.rejects(bookMeal(id, addDays(todayIST(), 6), L.id, "veg"), /Insufficient/);
});

test("price change after booking keeps snapshot (BR-08)", async () => {
  const id = await freshStudent();
  const L = await lunch(), date = addDays(todayIST(), 7);
  await bookMeal(id, date, L.id, "veg");
  const [{ amount }] = await sql`select amount from prices where slot_id = ${L.id} and diet = 'veg'`;
  await sql`update prices set amount = amount + 1000 where slot_id = ${L.id} and diet = 'veg'`;
  const [b] = await sql`select price_snapshot from bookings where student_id = ${id}`;
  await sql`update prices set amount = ${amount} where slot_id = ${L.id} and diet = 'veg'`;
  assert.equal(b.price_snapshot, amount);
});

test("lock posts charge, ledger is append-only (BR-13, BR-15)", async () => {
  const id = await freshStudent();
  const L = await lunch(), date = addDays(todayIST(), 5);
  await bookMeal(id, date, L.id, "veg");
  await sql`delete from job_runs`;
  await tick(cutoffAt(date, L.start_time) + 1000);
  const [b] = await sql`select status, price_snapshot from bookings where student_id = ${id}`;
  assert.equal(b.status, "locked");
  const [l] = await sql`select amount from ledger_entries where student_id = ${id} and kind = 'meal_charge'`;
  assert.equal(l.amount, -b.price_snapshot);
  await assert.rejects(sql`update ledger_entries set amount = 0 where student_id = ${id}`, /append-only/);
});

test("double scan: served once, then already_served; backup code flagged (BR-31, BR-33)", async () => {
  const id = await freshStudent();
  const L = await lunch(), today = todayIST();
  // insert a locked booking for today's lunch directly (cutoff already passed)
  await sql`insert into bookings (student_id, served_on, slot_id, diet, source, price_snapshot, status, cutoff_at)
    values (${id}, ${today}, ${L.id}, 'veg', 'oneoff', 7000, 'locked', now())`;
  const code = await regenerateBackupCode(id);
  const during = slotStart(today, L.start_time) + 60_000;
  const r1 = await scan(staff.id, code, "backup", during);
  assert.equal(r1.result, "served"); assert.equal(r1.flagged, true);
  assert.equal((await scan(staff.id, code, "backup", during)).result, "already_served");
  assert.equal((await scan(staff.id, code, "backup", slotStart(today, L.start_time) - 3_600_000)).result, "outside_window"); // BR-34
  assert.equal((await scan(staff.id, "garbage", "qr", during)).result, "invalid_token");
  const [n] = await sql`select count(*)::int as n from scans where student_id = ${id}`;
  assert.equal(n.n, 3); // every attempt logged (invalid has no student)
});

test("pattern switch mid-month replaces future pattern bookings (BR-05/06)", async () => {
  const id = await freshStudent(2_000_000);
  const L = await lunch();
  const all7 = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [String(d), [{ slot: L.id, diet: "veg" as const }]]));
  const r1 = await savePattern(id, "weekly", all7, null);
  assert.ok(r1.created >= 26);
  await savePattern(id, "weekly", { "1": [{ slot: L.id, diet: "nonveg" }] }, null);
  const [{ n }] = await sql`select count(*)::int as n from bookings where student_id = ${id} and source = 'pattern' and status = 'booked'`;
  assert.ok(n <= 5, `expected only Mondays, got ${n}`);
});

test("special meal moves existing booking; opt-out = cancel (BR-20, BR-21)", async () => {
  const id = await freshStudent();
  const [admin] = await sql`select id from profiles where role = 'admin' limit 1`;
  const D = (await slots()).find((s) => s.code === "D")!, date = addDays(todayIST(), 10);
  await bookMeal(id, date, D.id, "veg");
  await assert.rejects(createSpecial(admin.id, addDays(todayIST(), 1), D.id, "Biryani", { veg: 15000, nonveg: 20000 }), /3 days/);
  await createSpecial(admin.id, date, D.id, "Onam Sadya", { veg: 15000, nonveg: 20000 });
  const [b] = await sql`select id, price_snapshot, is_special from bookings where student_id = ${id}`;
  assert.equal(b.price_snapshot, 15000); assert.equal(b.is_special, true);
  await cancelBooking(id, b.id);
  await sql`delete from menu_entries where served_on = ${date}`;
});
