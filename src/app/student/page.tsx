import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { balance, slots, sql, tick } from "@/lib/db";
import { rupees } from "@/lib/money";
import { fmtIST, todayIST, cutoffAt } from "@/lib/time";
import { Gauge } from "@/components/Gauge";
import { Icon } from "@/components/Icon";

const ART: Record<string, string> = { B: "🥞", L: "🍛", S: "☕", D: "🍲" };
const firstItems = (items: string, n = 3) => items.split(",").map((x) => x.trim()).filter(Boolean).slice(0, n).join(", ");
const prettyDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// Story 7 / BR-16: transparency dashboard, laid out as a food app home.
export default async function StudentDashboard() {
  await tick();
  const user = await requireRole("student");
  const b = await balance(user.id);
  const today = todayIST();
  const ss = await slots();
  const [menu, bySource, ledger, upcoming, prices] = await Promise.all([
    sql<{ slot_id: number; diet: string; items: string; special_price: number | null }[]>`
      select slot_id, diet, items, special_price from menu_entries where served_on = ${today}`,
    sql<{ source: string; n: number }[]>`select source, count(*)::int as n from bookings
      where student_id = ${user.id} and status in ('booked','locked') group by source`,
    sql<{ created_at: Date; kind: string; amount: number; ref: string | null; note: string | null }[]>`
      select created_at, kind, amount, ref, note from ledger_entries where student_id = ${user.id} order by created_at desc limit 40`,
    sql<{ id: string; served_on: string; code: string; label: string; diet: string; status: string; price_snapshot: number; is_special: boolean }[]>`
      select b.id, to_char(b.served_on,'YYYY-MM-DD') as served_on, s.code, s.label, b.diet, b.status, b.price_snapshot, b.is_special
      from bookings b join meal_slots s on s.id = b.slot_id
      where b.student_id = ${user.id} and b.served_on >= ${today} and b.status in ('booked','locked','served')
      order by b.served_on, s.sort limit 40`,
    sql<{ slot_id: number; diet: string; amount: number }[]>`select slot_id, diet, amount from prices`,
  ]);
  const n = (s: string) => bySource.find((r) => r.source === s)?.n ?? 0;
  const total = Math.max(1, b.deposits + b.adjustments);
  const now = Date.now();
  const next = upcoming.find((u) => u.status !== "served");
  const todays = upcoming.filter((u) => u.served_on === today);
  const firstName = user.full_name.split(" ")[0];

  return (
    <div className="layout-rail">
      <div>
        <section className="banner">
          <div>
            <h1>{next ? `Next up: ${next.label.toLowerCase()} on ${prettyDate(next.served_on)}` : `Hungry, ${firstName}?`}</h1>
            <p>{next
              ? `${next.diet === "veg" ? "Veg" : "Non-veg"} plate, ${rupees(next.price_snapshot)}. ${next.status === "locked" ? "It's locked in; show your QR at the counter." : "You can still cancel before the 24-hour cutoff."}`
              : "Meals are opt-in. Pick the ones you'll eat, at least a day ahead, and pay only for those."}</p>
            <div className="row" style={{ marginTop: 14 }}>
              <Link className="btn" href={next ? "/student/qr" : "/student/menu"}>{next ? "Show my QR" : "Book meals"}</Link>
              <Link className="btn secondary" href="/student/pattern">Weekly pattern</Link>
            </div>
          </div>
          <div className="banner-art" aria-hidden>{next ? ART[next.code] ?? "🍽️" : "🍱"}</div>
        </section>

        <div className="section-head"><h2>Today at the mess</h2><Link href="/student/menu">Full menu</Link></div>
        <div className="chips" role="list">
          {ss.map((s) => {
            const mine = todays.find((t) => t.code === s.code);
            return (
              <Link key={s.id} href="/student/menu" className="chip" role="listitem" aria-current={mine ? "true" : undefined}>
                <span className="chip-art" aria-hidden>{ART[s.code] ?? "🍽️"}</span>
                {s.label}
                <small>{mine ? (mine.status === "served" ? "Eaten" : "Booked") : `${s.start_time}–${s.end_time}`}</small>
              </Link>
            );
          })}
        </div>

        <div className="meals">
          {ss.map((s) => {
            const m = menu.find((x) => x.slot_id === s.id && x.diet === "nonveg") ?? menu.find((x) => x.slot_id === s.id);
            const veg = menu.find((x) => x.slot_id === s.id && x.diet === "veg");
            const mine = todays.find((t) => t.code === s.code);
            const price = m?.special_price ?? prices.find((p) => p.slot_id === s.id && p.diet === "veg")?.amount ?? 0;
            const closed = now >= cutoffAt(today, s.start_time);
            return (
              <article key={s.id} className="meal-card">
                <span className="tag">{mine ? (mine.status === "served" ? "Eaten" : "Booked") : closed ? "Booking closed" : "Open"}</span>
                <div className="plate" aria-hidden>{ART[s.code] ?? "🍽️"}</div>
                <h3>{s.label}</h3>
                <p>{veg ? firstItems(veg.items, 5) : "Menu not published yet."}</p>
                <div className="foot">
                  <span className="price">{rupees(mine?.price_snapshot ?? price)}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{s.start_time} – {s.end_time}</span>
                </div>
              </article>
            );
          })}
        </div>

        <div className="grid" style={{ marginBottom: 18 }}>
          <div className="stat"><span>Meals eaten</span><b>{b.consumed}</b></div>
          <div className="stat"><span>Meals booked</span><b>{b.scheduled}</b><span>{n("pattern")} pattern · {n("oneoff")} single · {n("special")} special</span></div>
          <div className="stat"><span>Spent so far</span><b>{rupees(b.charges)}</b></div>
          <div className="stat"><span>Booked ahead</span><b>{rupees(b.committed)}</b></div>
        </div>

        <section className="card">
          <div className="section-head"><h2>Ledger history</h2><span className="muted">Every rupee in and out</span></div>
          {ledger.length === 0 ? <p className="muted">No money movements yet. Your verified deposit will appear here first.</p> : (
            <div className="scroll"><table>
              <thead><tr><th>When</th><th>What</th><th>Amount</th><th>Note</th></tr></thead>
              <tbody>{ledger.map((l, i) => (
                <tr key={i}><td>{fmtIST(l.created_at.getTime())}</td><td style={{ textTransform: "capitalize" }}>{l.kind.replace("_", " ")}</td>
                  <td className={l.amount < 0 ? "bad" : "ok"} style={{ fontWeight: 600 }}>{l.amount < 0 ? "−" : "+"}{rupees(Math.abs(l.amount))}</td>
                  <td className="muted">{l.note ?? l.ref ?? ""}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </div>

      <aside className="rail">
        <section className="card">
          <div className="mess-card">
            <div className="mc-top"><span>Saapidalaam mess card</span><span aria-hidden>◐</span></div>
            <div>
              <small style={{ opacity: 0.7 }}>Expected refund now</small>
              <div className="mc-num">{rupees(b.expectedRefund)}</div>
            </div>
            <div className="mc-foot">
              <span><small style={{ opacity: 0.7 }}>Card holder</small><b>{user.full_name}</b></span>
              <span><small style={{ opacity: 0.7 }}>Roll no</small><b>{user.roll_no ?? "—"}</b></span>
            </div>
          </div>
          <div style={{ marginTop: 18, position: "relative" }}>
            <Gauge spent={b.charges / total} committed={b.committed / total} />
            <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
              <span><b>{rupees(b.deposits)}</b><br /><span className="muted">deposited</span></span>
              <span style={{ textAlign: "right" }}><b>{rupees(b.available)}</b><br /><span className="muted">free to book</span></span>
            </div>
          </div>
          {b.expectedRefund < 50000 && <p className="warn" style={{ marginTop: 12, fontWeight: 600 }}>Balance is running low. Add a deposit to keep booking.</p>}
          <Link className="btn secondary" style={{ width: "100%", marginTop: 14 }} href="/student/deposit"><Icon name="wallet" size={18} /> Add deposit</Link>
        </section>

        <section className="card">
          <div className="section-head"><h3 style={{ margin: 0 }}>Upcoming meals</h3><Link href="/student/menu">View all</Link></div>
          {upcoming.filter((u) => u.status !== "served").length === 0 ? <p className="muted">Nothing booked. Book from the menu.</p> : (
            <div className="list">
              {upcoming.filter((u) => u.status !== "served").slice(0, 6).map((u) => (
                <div className="list-item" key={u.id}>
                  <span className="li-art" aria-hidden>{ART[u.code] ?? "🍽️"}</span>
                  <span><b>{u.label}{u.is_special && " ⭐"}</b><small>{prettyDate(u.served_on)} · {u.diet === "veg" ? "Veg" : "Non-veg"}</small></span>
                  <span className={`pill ${u.status}`}>{rupees(u.price_snapshot)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
