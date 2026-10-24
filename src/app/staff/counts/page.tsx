import { currentOrNextSlot, sql, tick } from "@/lib/db";
import { todayIST } from "@/lib/time";
import { AutoRefresh } from "@/components/staff/AutoRefresh";

export const dynamic = "force-dynamic";
type Row = { full_name: string; roll_no: string | null; diet: string };

// Story 3: live count for the current (or next) slot today.
export default async function Counts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await tick();
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const today = todayIST();
  const slot = await currentOrNextSlot();
  const split = await sql<{ diet: string; booked: number; served: number }[]>`
    select diet, count(*)::int as booked, count(*) filter (where status = 'served')::int as served
    from bookings where served_on = ${today} and slot_id = ${slot.id} and status in ('booked','locked','served','no_show')
    group by diet order by diet`;
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const remaining = await sql<Row[]>`
    select p.full_name, p.roll_no, b.diet from bookings b join profiles p on p.id = b.student_id
    where b.served_on = ${today} and b.slot_id = ${slot.id} and b.status in ('booked','locked')
    ${q ? sql`and (p.full_name ilike ${like} or p.roll_no ilike ${like})` : sql``}
    order by p.roll_no nulls last, p.full_name limit 500`;
  const tot = split.reduce((a, r) => ({ booked: a.booked + r.booked, served: a.served + r.served }), { booked: 0, served: 0 });

  return (
    <>
      <AutoRefresh />
      <h1>Live counts</h1>
      <p className="muted">{slot.label} · {today} · {slot.start_time}–{slot.end_time} IST · refreshes every 15s</p>
      <div className="grid">
        <div className="card stat"><b>{tot.booked}</b><span>Booked</span></div>
        <div className="card stat"><b className="ok">{tot.served}</b><span>Served</span></div>
        <div className="card stat"><b className="warn">{tot.booked - tot.served}</b><span>Remaining</span></div>
      </div>
      <div className="card">
        <h2>By diet</h2>
        {split.length === 0 ? <p className="muted">No bookings for this slot.</p> : (
          <table>
            <thead><tr><th>Diet</th><th>Booked</th><th>Served</th><th>Remaining</th></tr></thead>
            <tbody>{split.map((r) => <tr key={r.diet}><td>{r.diet === "veg" ? "Veg" : "Non-veg"}</td><td>{r.booked}</td><td>{r.served}</td><td>{r.booked - r.served}</td></tr>)}</tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>Remaining</h2>
        <form className="inline" method="get" role="search">
          <input name="q" type="search" defaultValue={q} placeholder="Name or roll no" aria-label="Search remaining students" />
          <button>Search</button>
        </form>
        {remaining.length === 0 ? <p className="muted">{q ? "No matches." : "Nobody left to serve."}</p> : (
          <div className="scroll"><table>
            <thead><tr><th>Name</th><th>Roll no</th><th>Diet</th></tr></thead>
            <tbody>{remaining.map((r, i) => <tr key={i}><td>{r.full_name}</td><td>{r.roll_no ?? "—"}</td><td>{r.diet === "veg" ? "Veg" : "Non-veg"}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
