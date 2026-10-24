import { audit, slots, sql } from "@/lib/db";
import { adminAct, date, int, money, oneOf, str, time } from "@/lib/admin";
import { rupees } from "@/lib/money";
import { Flash } from "@/components/Shell";

const P = "/admin/catalog";
const STATUSES = ["upcoming", "active", "closed"] as const;
const DIETS = ["veg", "nonveg"] as const;

async function createSemester(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const name = str(fd, "name", 80), starts = date(fd, "starts_on"), ends = date(fd, "ends_on");
    if (ends <= starts) throw new Error("End date must be after start date");
    const amount = money(fd, "deposit");
    await sql.begin(async (t) => {
      const [s] = await t`insert into semesters (name, starts_on, ends_on, deposit_amount, status) values (${name}, ${starts}, ${ends}, ${amount}, 'upcoming') returning id`;
      await audit(t, admin, "semester.create", String(s.id), { name, starts, ends, amount });
    });
    return "Semester created";
  });
}
async function setSemesterStatus(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const id = int(fd, "id"), status = oneOf(fd, "status", STATUSES);
    await sql.begin(async (t) => {
      const [s] = await t`update semesters set status = ${status} where id = ${id} returning id`;
      if (!s) throw new Error("Semester not found");
      await audit(t, admin, "semester.status", String(id), { status });
    });
    return "Semester updated";
  });
}
async function saveSlot(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const id = int(fd, "id"), label = str(fd, "label", 40), start = time(fd, "start_time"), end = time(fd, "end_time");
    if (end <= start) throw new Error("End time must be after start time");
    await sql.begin(async (t) => {
      const [s] = await t`update meal_slots set label = ${label}, start_time = ${start}, end_time = ${end} where id = ${id} returning id`;
      if (!s) throw new Error("Slot not found");
      await audit(t, admin, "slot.update", String(id), { label, start, end });
    });
    return "Slot saved";
  });
}
async function savePrice(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const slot = int(fd, "slot_id"), diet = oneOf(fd, "diet", DIETS), amount = money(fd, "amount");
    // BR-08: bookings keep their price_snapshot; only new bookings use this price.
    await sql.begin(async (t) => {
      await t`insert into prices (slot_id, diet, amount) values (${slot}, ${diet}, ${amount}) on conflict (slot_id, diet) do update set amount = excluded.amount`;
      await audit(t, admin, "price.set", `${slot}/${diet}`, { amount });
    });
    return "Price saved (existing bookings keep their snapshot, BR-08)";
  });
}

export default async function Catalog({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const sems = await sql`select id, name, to_char(starts_on,'YYYY-MM-DD') as starts_on, to_char(ends_on,'YYYY-MM-DD') as ends_on, deposit_amount, status from semesters order by starts_on desc`;
  const ss = await slots();
  const prices = await sql<{ slot_id: number; diet: string; amount: number }[]>`select slot_id, diet, amount from prices`;
  const price = (s: number, d: string) => prices.find((p) => p.slot_id === s && p.diet === d)?.amount;
  return (
    <>
      <h1>Catalog</h1>
      <Flash sp={sp} />
      <section className="card">
        <h2>Semesters</h2>
        <div className="scroll"><table>
          <thead><tr><th>Name</th><th>Dates</th><th>Deposit</th><th>Status</th></tr></thead>
          <tbody>{sems.map((s) => (
            <tr key={s.id}><td>{s.name}</td><td>{s.starts_on} → {s.ends_on}</td><td>{rupees(s.deposit_amount)}</td>
              <td><form action={setSemesterStatus} className="inline">
                <input type="hidden" name="id" value={s.id} />
                <select name="status" defaultValue={s.status} aria-label="Status">{STATUSES.map((x) => <option key={x}>{x}</option>)}</select>
                <button className="secondary">Set</button>
              </form></td></tr>
          ))}{sems.length === 0 && <tr><td colSpan={4} className="muted">No semesters yet.</td></tr>}</tbody>
        </table></div>
        <form action={createSemester} className="row" style={{ marginTop: 12 }}>
          <input name="name" placeholder="Monsoon 2026" required maxLength={80} aria-label="Name" />
          <label>Start <input type="date" name="starts_on" required /></label>
          <label>End <input type="date" name="ends_on" required /></label>
          <label>Deposit ₹ <input name="deposit" defaultValue="30000" inputMode="decimal" required size={8} /></label>
          <button>Create semester</button>
        </form>
      </section>
      <section className="card">
        <h2>Meal slots and prices</h2>
        <p className="muted">Price changes apply to new bookings only; existing bookings keep their snapshot (BR-08).</p>
        <div className="scroll"><table>
          <thead><tr><th>Slot</th><th>Label / times</th>{DIETS.map((d) => <th key={d}>{d} price</th>)}</tr></thead>
          <tbody>{ss.map((s) => (
            <tr key={s.id}><td>{s.code}</td>
              <td><form action={saveSlot} className="inline">
                <input type="hidden" name="id" value={s.id} />
                <input name="label" defaultValue={s.label} required maxLength={40} size={10} aria-label="Label" />
                <input type="time" name="start_time" defaultValue={s.start_time} required aria-label="Start" />
                <input type="time" name="end_time" defaultValue={s.end_time} required aria-label="End" />
                <button className="secondary">Save</button>
              </form></td>
              {DIETS.map((d) => { const a = price(s.id, d); return (
                <td key={d}><form action={savePrice} className="inline">
                  <input type="hidden" name="slot_id" value={s.id} /><input type="hidden" name="diet" value={d} />
                  ₹<input name="amount" defaultValue={a != null ? (a / 100).toFixed(2) : ""} inputMode="decimal" required size={6} aria-label={`${s.label} ${d} price`} />
                  <button className="secondary">Save</button>
                </form></td>); })}
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  );
}
