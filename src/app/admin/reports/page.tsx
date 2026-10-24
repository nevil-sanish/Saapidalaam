import { sql } from "@/lib/db";
import { reportRange, reportRows } from "@/lib/admin";
import { rupees } from "@/lib/money";

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { from, to } = reportRange(sp.from, sp.to);
  const rows = await reportRows(from, to);
  const [money] = await sql`select
    coalesce(sum(amount) filter (where kind = 'deposit'), 0)::bigint as deposits,
    coalesce(-sum(amount) filter (where kind = 'refund'), 0)::bigint as refunds,
    coalesce(sum(amount) filter (where kind = 'adjustment'), 0)::bigint as adjustments
    from ledger_entries where (created_at at time zone 'Asia/Kolkata')::date between ${from} and ${to}`;
  const t = rows.reduce((a, r) => ({ booked: a.booked + r.booked, served: a.served + r.served, no_show: a.no_show + r.no_show, revenue: a.revenue + r.revenue }),
    { booked: 0, served: 0, no_show: 0, revenue: 0 });
  const stats: [string, string | number][] = [
    ["Booked", t.booked], ["Served", t.served], ["No-shows", t.no_show], ["Meal revenue", rupees(t.revenue)],
    ["Deposits in period", rupees(money.deposits)], ["Refunds in period", rupees(money.refunds)], ["Adjustments (net)", rupees(money.adjustments)],
  ];
  const q = `from=${from}&to=${to}`;
  return (
    <>
      <h1>Reports</h1>
      <form className="card row">
        <label>From <input type="date" name="from" defaultValue={from} /></label>
        <label>To <input type="date" name="to" defaultValue={to} /></label>
        <button className="secondary">Apply</button>
        <a href={`/admin/reports/export?${q}`}>Download CSV</a>
      </form>
      <div className="grid">{stats.map(([l, v]) => <div key={l} className="card stat"><b>{v}</b><span>{l}</span></div>)}</div>
      <section className="card scroll"><h2>By day and slot</h2><table>
        <thead><tr><th>Date</th><th>Slot</th><th>Booked</th><th>Served</th><th>No-show</th><th>Cancelled</th><th>Revenue</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}><td>{r.date}</td><td>{r.slot}</td><td>{r.booked}</td><td>{r.served}</td><td className={r.no_show ? "warn" : ""}>{r.no_show}</td><td>{r.cancelled}</td><td>{rupees(r.revenue)}</td></tr>
        ))}{rows.length === 0 && <tr><td colSpan={7} className="muted">No bookings in this period.</td></tr>}</tbody>
      </table></section>
      <p className="muted">Revenue = meal charges posted for meals in the period (incl. no-shows, BR-14).</p>
    </>
  );
}
