import { tick } from "@/lib/db";
import { demand, rangeFor, wastage } from "@/lib/reports";
import { todayIST } from "@/lib/time";
import { RangePicker } from "./RangePicker";

type SP = Promise<{ view?: string; from?: string }>;

export default async function Demand({ searchParams }: { searchParams: SP }) {
  await tick();
  const sp = await searchParams;
  const range = rangeFor(sp.view, sp.from);
  const [rows, waste] = await Promise.all([demand(range.from, range.to), wastage(range.from, range.to)]);
  const today = todayIST();
  const tot = rows.reduce((a, r) => ({ locked: a.locked + r.locked, estimate: a.estimate + r.estimate, served: a.served + r.served, no_show: a.no_show + r.no_show }),
    { locked: 0, estimate: 0, served: 0, no_show: 0 });
  const pct = (served: number, booked: number) => (booked ? Math.round((served / booked) * 100) + "%" : "—");

  return (
    <>
      <h1>Demand</h1>
      <RangePicker path="/manager" range={range} />
      <div className="grid">
        <div className="card stat"><b>{tot.locked}</b><span>Locked (exact)</span></div>
        <div className="card stat"><b>{tot.estimate}</b><span>Still changeable (estimate)</span></div>
        <div className="card stat"><b>{tot.served}</b><span>Served</span></div>
        <div className="card stat"><b>{tot.no_show}</b><span>No-show</span></div>
      </div>
      <p><a href={`/manager/export?view=${range.view}&from=${range.from}`} download>Download CSV</a></p>
      <div className="card scroll">
        {rows.length === 0 ? <p className="muted" role="status">No bookings or menu entries in this range.</p> : (
          <table>
            <thead><tr><th>Date</th><th>Slot</th><th>Diet</th><th>Menu</th><th>Locked</th><th>Estimate</th><th>Served</th><th>No-show</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const upcoming = r.date >= today;
                return (
                  <tr key={`${r.date}-${r.slot_id}-${r.diet}`}>
                    <td>{r.date}</td><td>{r.slot}</td><td>{r.diet === "veg" ? "Veg" : "Non-veg"}</td>
                    <td>{r.items || <span className="muted">—</span>}{r.special && <> <span className="pill warn">special</span></>}</td>
                    <td>{r.locked}</td><td>{r.estimate}</td><td>{r.served}</td><td>{r.no_show}</td>
                    <td>{upcoming
                      ? (r.estimate ? <span className="pill warn">estimate: {r.estimate} can change</span> : <span className="pill ok">locked</span>)
                      : <span className="muted">served {pct(r.served, r.locked + r.estimate)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <h2>Served vs booked (past days)</h2>
      <div className="card scroll">
        {waste.length === 0 ? <p className="muted" role="status">No past days in this range.</p> : (
          <table>
            <thead><tr><th>Date</th><th>Booked</th><th>Served</th><th>Served %</th><th>Wasted</th></tr></thead>
            <tbody>
              {waste.map((w) => (
                <tr key={w.date}>
                  <td>{w.date}</td><td>{w.booked}</td><td>{w.served}</td>
                  <td className={w.pct == null ? "muted" : w.pct >= 90 ? "ok" : w.pct >= 75 ? "warn" : "bad"}>{w.pct == null ? "—" : w.pct + "%"}</td>
                  <td>{w.booked - w.served}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
