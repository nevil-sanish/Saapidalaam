import { requireRole } from "@/lib/auth";
import { act } from "@/lib/act";
import { bookMeal, cancelBooking, slots, sql, type Diet } from "@/lib/db";
import { rupees } from "@/lib/money";
import { addDays, cutoffAt, todayIST } from "@/lib/time";
import { Flash } from "@/components/Shell";

const DAYS = 14;

async function book(fd: FormData) {
  "use server";
  const user = await requireRole("student");
  await act("/student/menu", async () => {
    const date = String(fd.get("date") ?? ""), slot = Number(fd.get("slot")), diet = String(fd.get("diet"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(slot) || (diet !== "veg" && diet !== "nonveg")) throw new Error("Bad request");
    await bookMeal(user.id, date, slot, diet as Diet);
    return `Booked ${diet} for ${date}`;
  });
}

async function cancel(fd: FormData) {
  "use server";
  const user = await requireRole("student");
  await act("/student/menu", async () => {
    const id = String(fd.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Bad request");
    await cancelBooking(user.id, id);
    return "Booking cancelled";
  });
}

const countdown = (ms: number) => {
  if (ms <= 0) return "locked";
  const m = Math.floor(ms / 60_000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return `closes in ${d ? `${d}d ` : ""}${h}h ${m % 60}m`;
};

// Stories 2, 4, 5: menu grid with booking, cutoff countdown and special opt-out (BR-02, 03, 21, 22).
export default async function MenuPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const now = Date.now();
  const from = todayIST(now), to = addDays(from, DAYS - 1);
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  const ss = await slots();
  const prices = await sql<{ slot_id: number; diet: Diet; amount: number }[]>`select slot_id, diet, amount from prices`;
  const entries = await sql<{ served_on: string; slot_id: number; diet: Diet; items: string; special_price: number | null }[]>`
    select to_char(served_on,'YYYY-MM-DD') as served_on, slot_id, diet, items, special_price from menu_entries where served_on between ${from} and ${to}`;
  const mine = await sql<{ id: string; served_on: string; slot_id: number; diet: Diet; status: string; price_snapshot: number; is_special: boolean }[]>`
    select id, to_char(served_on,'YYYY-MM-DD') as served_on, slot_id, diet, status, price_snapshot, is_special from bookings
    where student_id = ${user.id} and served_on between ${from} and ${to} and status <> 'cancelled'`;

  const regular = (slot: number, diet: Diet) => prices.find((p) => p.slot_id === slot && p.diet === diet)?.amount;
  const entry = (d: string, slot: number, diet: Diet) => entries.find((e) => e.served_on === d && e.slot_id === slot && e.diet === diet);

  return (
    <>
      <h1>Menu &amp; booking</h1>
      <Flash sp={sp} />
      <p className="muted">Booking and cancelling close 24h before each meal (BR-02/03). ⭐ = special meal; cancelling opts you out.</p>
      <div className="card scroll">
        <table>
          <thead><tr><th>Date</th>{ss.map((s) => <th key={s.id}>{s.label} <span className="muted">{s.start_time}</span></th>)}</tr></thead>
          <tbody>
            {dates.map((d) => (
              <tr key={d}>
                <th>{new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</th>
                {ss.map((s) => {
                  const left = cutoffAt(d, s.start_time) - now;
                  const b = mine.find((x) => x.served_on === d && x.slot_id === s.id);
                  const items = entry(d, s.id, "veg")?.items || entry(d, s.id, "nonveg")?.items;
                  return (
                    <td key={s.id} style={{ minWidth: 170 }}>
                      {items ? <div>{items}</div> : <div className="muted">Menu not set</div>}
                      {(["veg", "nonveg"] as const).map((diet) => {
                        const e = entry(d, s.id, diet), reg = regular(s.id, diet);
                        const sp = e?.special_price;
                        return (
                          <div key={diet} className="muted" style={{ fontSize: 13 }}>
                            {diet === "veg" ? "Veg" : "Non-veg"}: {sp != null ? <>⭐ {rupees(sp)}{reg != null && sp > reg && <> (+{rupees(sp - reg)})</>}</> : reg != null ? rupees(reg) : "—"}
                          </div>
                        );
                      })}
                      <div className={left > 0 ? "muted" : "bad"} style={{ fontSize: 12 }}>{countdown(left)}</div>
                      {b ? (
                        <div className="row">
                          <span className="pill ok">{b.status} · {b.diet}{b.is_special && " ⭐"} · {rupees(b.price_snapshot)}</span>
                          {b.status === "booked" && left > 0 && (
                            <form action={cancel}><input type="hidden" name="id" value={b.id} />
                              <button className="secondary">{b.is_special ? "Opt out" : "Cancel"}</button></form>
                          )}
                        </div>
                      ) : left > 0 && (
                        <div className="row">
                          {(["veg", "nonveg"] as const).map((diet) => (
                            <form key={diet} action={book}>
                              <input type="hidden" name="date" value={d} /><input type="hidden" name="slot" value={s.id} /><input type="hidden" name="diet" value={diet} />
                              <button aria-label={`Book ${diet} ${s.label} on ${d}`}>{diet === "veg" ? "Book veg" : "Book non-veg"}</button>
                            </form>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
