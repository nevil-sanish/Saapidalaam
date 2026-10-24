import Link from "next/link";
import { sql } from "@/lib/db";
import { rupees } from "@/lib/money";
import { todayIST } from "@/lib/time";
import { Icon } from "@/components/Icon";

const dayLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });

export default async function AdminHome() {
  const today = todayIST();
  const [r] = await sql`select
    (select count(*)::int from profiles where role = 'student') as students,
    (select count(*)::int from profiles where role = 'student' and is_active) as active_students,
    (select coalesce(sum(amount),0)::bigint from ledger_entries where kind = 'deposit') as deposits,
    (select coalesce(-sum(amount),0)::bigint from ledger_entries where kind = 'meal_charge') as charges,
    (select coalesce(-sum(amount),0)::bigint from ledger_entries where kind = 'refund') as refunds,
    (select count(*)::int from deposits where status = 'pending') as pending,
    (select count(*)::int from bookings where served_on = ${today} and status <> 'cancelled') as booked_today,
    (select count(*)::int from bookings where served_on = ${today} and status = 'served') as served_today,
    (select count(*)::int from scans where (scanned_at at time zone 'Asia/Kolkata')::date = ${today}
       and result in ('invalid_token','no_booking','outside_window','already_served')) as failed_today`;
  const week = await sql<{ d: string; served: number; revenue: number }[]>`
    select to_char(d,'YYYY-MM-DD') as d,
      (select count(*)::int from bookings where served_on = d::date and status = 'served') as served,
      (select coalesce(-sum(amount),0)::int from ledger_entries where kind = 'meal_charge'
         and (created_at at time zone 'Asia/Kolkata')::date = d::date) as revenue
    from generate_series(${today}::date - 6, ${today}::date, interval '1 day') d order by d`;
  const maxServed = Math.max(1, ...week.map((w) => w.served));
  const maxRev = Math.max(1, ...week.map((w) => w.revenue));
  const weekRev = week.reduce((a, w) => a + w.revenue, 0);
  const pct = r.booked_today ? Math.round((r.served_today / r.booked_today) * 100) : 0;

  const actions: [string, string, string, string, number | string, string][] = [
    ["wallet", "Pending deposits", r.pending ? "Verify them so students can book" : "All deposits are verified", "/admin/finance", r.pending, r.pending ? "pending" : "good"],
    ["shield", "Failed scans today", r.failed_today ? "Check who was turned away at the counter" : "No failed scans today", "/admin/audit?result=failed", r.failed_today, r.failed_today ? "bad" : "good"],
    ["users", "Active students", `${r.students} accounts in total`, "/admin/users", r.active_students, ""],
    ["receipt", "Refunds paid", "Payouts recorded in the ledger", "/admin/finance", rupees(r.refunds), ""],
  ];

  return (
    <>
      <h1>Admin overview</h1>
      <div className="bento" style={{ marginBottom: 18 }}>
        <section className="card dark span-6">
          <div className="section-head"><h2>Today at the counter</h2><Link href="/manager">Demand view</Link></div>
          <div className="hero-num">{r.served_today} <small>of {r.booked_today} served</small></div>
          <div className="bar" role="img" aria-label={`${pct}% of today's booked meals served`}><i className="hatched" style={{ width: `${pct}%` }} /></div>
          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>{r.booked_today ? `${pct}% of booked meals served so far` : "No meals booked for today"}</p>
        </section>
        <section className="card mint span-3">
          <h3>Verified deposits</h3>
          <div className="tile-num">{rupees(r.deposits)}</div>
          <span className="muted">Money students have put in</span>
        </section>
        <section className="card lilac span-3">
          <h3>Charges posted</h3>
          <div className="tile-num">{rupees(r.charges)}</div>
          <span className="muted">Meals billed to date</span>
        </section>
      </div>

      <div className="bento">
        <section className="card paper span-7">
          <div className="section-head"><h2>Last 7 days</h2><Link href="/admin/reports">Reports</Link></div>
          <div className="spark" role="img" aria-label={`Meals served and revenue for the last 7 days; revenue ${rupees(weekRev)}`}>
            {week.map((w) => (
              <div className="spark-col" key={w.d} title={`${w.d}: ${w.served} served, ${rupees(w.revenue)}`}>
                <div className="track">
                  <i className={w.d === today ? "today" : ""} style={{ height: `${(w.served / maxServed) * 100}%` }} />
                  <i className="rev" style={{ height: `${(w.revenue / maxRev) * 100}%` }} />
                </div>
                <small>{dayLabel(w.d)}</small>
              </div>
            ))}
          </div>
          <div className="form-foot">
            <span className="legend"><span><i />Meals served</span><span><i className="rev" />Revenue</span></span>
            <span className="muted">{rupees(weekRev)} billed this week</span>
          </div>
        </section>
        <section className="card span-5">
          <div className="section-head"><h2>Needs a look</h2></div>
          <div className="list">
            {actions.map(([icon, title, note, href, v, tone]) => (
              <Link className="list-item" href={href} key={title}>
                <span className="li-art" aria-hidden><Icon name={icon} /></span>
                <span><b>{title}</b><small>{note}</small></span>
                {tone ? <span className={`pill ${tone}`}>{v}</span> : <span className="count">{v}</span>}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
