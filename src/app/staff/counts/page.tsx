import { currentOrNextSlot, sql, tick } from "@/lib/db";
import { todayIST } from "@/lib/time";
import { AutoRefresh } from "@/components/staff/AutoRefresh";

export const dynamic = "force-dynamic";
const ART: Record<string, string> = { B: "🥞", L: "🍛", S: "☕", D: "🍲" };
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

  const left = tot.booked - tot.served;
  const pctServed = tot.booked ? Math.round((tot.served / tot.booked) * 100) : 0;

  return (
    <>
      <AutoRefresh />
      <h1>Live counts</h1>
      <div className="bento" style={{ marginBottom: 18 }}>
        <section className="card dark span-5 slot-hero">
          <span className="slot-art" aria-hidden>{ART[slot.code] ?? "🍽️"}</span>
          <div>
            <h2>{slot.label}</h2>
            <p className="muted">{today}, {slot.start_time}–{slot.end_time} IST. Refreshes every 15 seconds.</p>
          </div>
        </section>
        <div className="grid span-7">
          <div className="stat"><span>Booked</span><b>{tot.booked}</b></div>
          <div className="stat"><span>Served</span><b>{tot.served}</b></div>
          <div className="stat"><span>Remaining</span><b>{left}</b></div>
        </div>
        <section className="card span-12">
          <div className="section-head"><h2>Served so far</h2><span className="muted">{pctServed}% of {tot.booked}</span></div>
          <div className="bar bar-lg" role="img" aria-label={`${tot.served} of ${tot.booked} served`}><i style={{ width: `${pctServed}%` }} /></div>
          {split.length === 0 ? <p className="muted" style={{ marginTop: 14 }}>No bookings for this slot.</p> : (
            <div className="diet-rows">
              {split.map((r) => (
                <div className="diet-row" key={r.diet}>
                  <span className={`pill ${r.diet === "veg" ? "served" : "booked"}`}>{r.diet === "veg" ? "Veg" : "Non-veg"}</span>
                  <div className="bar"><i style={{ width: `${r.booked ? (r.served / r.booked) * 100 : 0}%` }} /></div>
                  <span className="muted"><b style={{ color: "var(--ink)" }}>{r.served}</b> of {r.booked} served, {r.booked - r.served} left</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="card">
        <div className="section-head"><h2>Still to come</h2><span className="muted">{remaining.length} students</span></div>
        <form className="search-pill" method="get" role="search">
          <input name="q" type="search" defaultValue={q} placeholder="Search by name or roll no" aria-label="Search remaining students" />
          <button>Search</button>
        </form>
        {remaining.length === 0 ? <p className="muted">{q ? "No matches. Try a shorter name or roll no." : "Nobody left to serve."}</p> : (
          <div className="list">
            {remaining.map((r, i) => (
              <div className="list-item" key={i}>
                <span className="li-art" aria-hidden>{r.full_name.charAt(0)}</span>
                <span><b>{r.full_name}</b><small>{r.roll_no ?? "No roll no"}</small></span>
                <span className={`pill ${r.diet === "veg" ? "served" : "booked"}`}>{r.diet === "veg" ? "Veg" : "Non-veg"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
