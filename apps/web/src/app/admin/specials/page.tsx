import { createSpecial, slots, sql } from "@/lib/db";
import { adminAct, date, int, money, str } from "@/lib/admin";
import { rupees } from "@/lib/money";
import { addDays, todayIST } from "@/lib/time";
import { Flash } from "@/components/Shell";

const P = "/admin/specials";

async function create(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const d = date(fd, "date"), slotId = int(fd, "slot_id"), items = str(fd, "items", 300);
    if (!(await slots()).some((s) => s.id === slotId)) throw new Error("Unknown slot");
    const veg = money(fd, "veg", { allowZero: true }), nonveg = money(fd, "nonveg", { allowZero: true });
    await createSpecial(admin, d, slotId, items, { veg, nonveg }); // BR-20..23; audits + notifies inside
    return `Special created for ${d}`;
  });
}

export default async function Specials({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ss = await slots();
  const list = await sql`select to_char(m.served_on,'YYYY-MM-DD') as d, s.label, m.diet, m.items, m.special_price,
      (select count(*)::int from bookings b where b.served_on = m.served_on and b.slot_id = m.slot_id and b.diet = m.diet and b.status <> 'cancelled') as booked
    from menu_entries m join meal_slots s on s.id = m.slot_id
    where m.special_price is not null and m.served_on >= ${todayIST()} order by m.served_on, s.sort, m.diet`;
  return (
    <>
      <h1>Special meals</h1>
      <Flash sp={sp} />
      <form action={create} className="card" style={{ display: "grid", gap: 8, maxWidth: 520 }}>
        <p className="muted">At least 3 days ahead (BR-20). Existing bookings move to the special and students are notified (BR-21, BR-23).</p>
        <label>Date <input type="date" name="date" min={addDays(todayIST(), 3)} required /></label>
        <label>Slot <select name="slot_id" required>{ss.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label>Items <input name="items" required maxLength={300} placeholder="Biryani, raita, payasam" /></label>
        <div className="row">
          <label>Veg ₹ <input name="veg" inputMode="decimal" required size={8} /></label>
          <label>Non-veg ₹ <input name="nonveg" inputMode="decimal" required size={8} /></label>
        </div>
        <button>Create special</button>
      </form>
      <div className="card scroll">
        <h2>Upcoming specials</h2>
        <table>
          <thead><tr><th>Date</th><th>Slot</th><th>Diet</th><th>Items</th><th>Price</th><th>Booked</th></tr></thead>
          <tbody>{list.map((r, i) => (
            <tr key={i}><td>{r.d}</td><td>{r.label}</td><td>{r.diet}</td><td>{r.items}</td><td>{rupees(r.special_price)}</td><td>{r.booked}</td></tr>
          ))}{list.length === 0 && <tr><td colSpan={6} className="muted">No upcoming specials.</td></tr>}</tbody>
        </table>
      </div>
    </>
  );
}
