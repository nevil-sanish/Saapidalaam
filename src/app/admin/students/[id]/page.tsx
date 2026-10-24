import { notFound } from "next/navigation";
import { balance, sql } from "@/lib/db";
import { rupees } from "@/lib/money";
import { fmtIST } from "@/lib/time";

const ts = (d: Date | string) => fmtIST(new Date(d).getTime());

export default async function Student({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await sql`select id, email, full_name, roll_no, is_active, photo is not null as has_photo, created_at from profiles where id = ${id} and role = 'student'`;
  if (!p) notFound();
  const [b, bookings, scans, ledger, deposits] = await Promise.all([
    balance(id),
    sql`select to_char(b.served_on,'YYYY-MM-DD') as d, s.label, b.diet, b.source, b.status, b.price_snapshot, b.is_special
      from bookings b join meal_slots s on s.id = b.slot_id where b.student_id = ${id} order by b.served_on desc, s.sort limit 200`,
    sql`select sc.scanned_at, sc.method, sc.result, st.full_name as staff from scans sc left join profiles st on st.id = sc.staff_id
      where sc.student_id = ${id} order by sc.scanned_at desc limit 100`,
    sql`select kind, amount, ref, note, created_at from ledger_entries where student_id = ${id} order by created_at desc`,
    sql`select amount, txn_ref, status, created_at from deposits where student_id = ${id} order by created_at desc`,
  ]);
  const stats: [string, string | number][] = [
    ["Available", rupees(b.available)], ["Verified deposits", rupees(b.deposits)], ["Charges", rupees(b.charges)],
    ["Committed (booked)", rupees(b.committed)], ["Refunds", rupees(b.refunds)], ["Adjustments", rupees(b.adjustments)],
    ["Meals consumed", b.consumed], ["Meals scheduled", b.scheduled],
  ];
  return (
    <>
      <h1>{p.full_name}</h1>
      <p className="row">
        {p.has_photo && <img src={`/api/photo/${id}`} alt={`Photo of ${p.full_name}`} width={72} height={72} style={{ objectFit: "cover", borderRadius: 8 }} />}
        <span>{p.email} · {p.roll_no ?? "no roll no"} · <span className={p.is_active ? "ok" : "bad"}>{p.is_active ? "active" : "inactive"}</span> · joined {ts(p.created_at)}</span>
      </p>
      <div className="grid">{stats.map(([l, v]) => <div key={l} className="card stat"><b>{v}</b><span>{l}</span></div>)}</div>
      <section className="card scroll"><h2>Ledger</h2><table>
        <thead><tr><th>When</th><th>Kind</th><th>Amount</th><th>Ref</th><th>Note</th></tr></thead>
        <tbody>{ledger.map((l, i) => <tr key={i}><td>{ts(l.created_at)}</td><td>{l.kind}</td><td className={l.amount < 0 ? "bad" : "ok"}>{rupees(l.amount)}</td><td>{l.ref}</td><td>{l.note}</td></tr>)}
          {ledger.length === 0 && <tr><td colSpan={5} className="muted">No entries.</td></tr>}</tbody>
      </table></section>
      <section className="card scroll"><h2>Deposits</h2><table>
        <thead><tr><th>Submitted</th><th>Amount</th><th>Txn ref</th><th>Status</th></tr></thead>
        <tbody>{deposits.map((d, i) => <tr key={i}><td>{ts(d.created_at)}</td><td>{rupees(d.amount)}</td><td>{d.txn_ref}</td><td>{d.status}</td></tr>)}
          {deposits.length === 0 && <tr><td colSpan={4} className="muted">None.</td></tr>}</tbody>
      </table></section>
      <section className="card scroll"><h2>Bookings</h2><table>
        <thead><tr><th>Date</th><th>Slot</th><th>Diet</th><th>Source</th><th>Status</th><th>Price</th></tr></thead>
        <tbody>{bookings.map((x, i) => <tr key={i}><td>{x.d}</td><td>{x.label}{x.is_special && " ★"}</td><td>{x.diet}</td><td>{x.source}</td><td>{x.status}</td><td>{rupees(x.price_snapshot)}</td></tr>)}
          {bookings.length === 0 && <tr><td colSpan={6} className="muted">No bookings.</td></tr>}</tbody>
      </table></section>
      <section className="card scroll"><h2>Scans</h2><table>
        <thead><tr><th>When</th><th>Method</th><th>Result</th><th>Staff</th></tr></thead>
        <tbody>{scans.map((s, i) => <tr key={i}><td>{ts(s.scanned_at)}</td><td>{s.method}</td><td className={s.result === "served" ? "ok" : "bad"}>{s.result}</td><td>{s.staff}</td></tr>)}
          {scans.length === 0 && <tr><td colSpan={4} className="muted">No scans.</td></tr>}</tbody>
      </table></section>
    </>
  );
}
