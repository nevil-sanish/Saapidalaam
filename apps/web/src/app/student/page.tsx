import { requireRole } from "@/lib/auth";
import { balance, sql, tick } from "@/lib/db";
import { rupees } from "@/lib/money";
import { fmtIST, todayIST } from "@/lib/time";

// Story 7 / BR-16: transparency dashboard.
export default async function StudentDashboard() {
  await tick();
  const user = await requireRole("student");
  const b = await balance(user.id);
  const bySource = await sql<{ source: string; n: number }[]>`select source, count(*)::int as n from bookings
    where student_id = ${user.id} and status in ('booked','locked') group by source`;
  const n = (s: string) => bySource.find((r) => r.source === s)?.n ?? 0;
  const ledger = await sql<{ created_at: Date; kind: string; amount: number; ref: string | null; note: string | null }[]>`
    select created_at, kind, amount, ref, note from ledger_entries where student_id = ${user.id} order by created_at desc`;
  const upcoming = await sql<{ id: string; served_on: string; label: string; diet: string; source: string; status: string; price_snapshot: number; is_special: boolean }[]>`
    select b.id, to_char(b.served_on,'YYYY-MM-DD') as served_on, s.label, b.diet, b.source, b.status, b.price_snapshot, b.is_special
    from bookings b join meal_slots s on s.id = b.slot_id
    where b.student_id = ${user.id} and b.served_on >= ${todayIST()} and b.status in ('booked','locked')
    order by b.served_on, s.sort limit 60`;

  const stats: [string, string][] = [
    ["Verified deposits", rupees(b.deposits)],
    ["Meals consumed", String(b.consumed)],
    ["Meals scheduled", `${b.scheduled} (pattern ${n("pattern")} · one-off ${n("oneoff")} · special ${n("special")})`],
    ["Spent (charges)", rupees(b.charges)],
    ["Committed (future)", rupees(b.committed)],
    ["Available", rupees(b.available)],
  ];
  return (
    <>
      <h1>Hi, {user.full_name}</h1>
      <div className="card">
        <div className="stat"><span>Expected refund now (BR-16)</span><b className={b.expectedRefund < 50000 ? "warn" : "ok"}>{rupees(b.expectedRefund)}</b></div>
        <p className="muted">Deposits − charges − refunds paid{b.adjustments ? " ± adjustments" : ""} − value of future booked meals.</p>
      </div>
      <div className="grid card">
        {stats.map(([k, v]) => <div key={k} className="stat"><span>{k}</span><b>{v}</b></div>)}
        {b.refunds > 0 && <div className="stat"><span>Refunds paid</span><b>{rupees(b.refunds)}</b></div>}
      </div>

      <div className="card">
        <h2>Upcoming bookings</h2>
        {upcoming.length === 0 ? <p className="muted">No upcoming meals. Book from the menu or set a pattern.</p> : (
          <div className="scroll"><table>
            <thead><tr><th>Date</th><th>Slot</th><th>Diet</th><th>Source</th><th>Price</th><th>Status</th></tr></thead>
            <tbody>{upcoming.map((u) => (
              <tr key={u.id}><td>{u.served_on}</td><td>{u.label}{u.is_special && " ⭐"}</td><td>{u.diet}</td><td>{u.source}</td>
                <td>{rupees(u.price_snapshot)}</td><td><span className="pill">{u.status}</span></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <h2>Ledger history</h2>
        {ledger.length === 0 ? <p className="muted">No entries yet.</p> : (
          <div className="scroll"><table>
            <thead><tr><th>When</th><th>Kind</th><th>Amount</th><th>Ref</th><th>Note</th></tr></thead>
            <tbody>{ledger.map((l, i) => (
              <tr key={i}><td>{fmtIST(l.created_at.getTime())}</td><td>{l.kind}</td>
                <td className={l.amount < 0 ? "bad" : "ok"}>{l.amount < 0 ? "−" : "+"}{rupees(Math.abs(l.amount))}</td>
                <td>{l.ref ?? ""}</td><td className="muted">{l.note ?? ""}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
