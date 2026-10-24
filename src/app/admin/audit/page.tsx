import Link from "next/link";
import { sql } from "@/lib/db";
import { fmtIST, todayIST } from "@/lib/time";

const RESULTS = ["served", "already_served", "no_booking", "invalid_token", "outside_window", "failed"] as const;
const METHODS = ["qr", "backup"] as const;
const ts = (d: Date | string) => fmtIST(new Date(d).getTime());

export default async function Audit({ searchParams }: { searchParams: Promise<{ date?: string; result?: string; method?: string }> }) {
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayIST();
  const result = (RESULTS as readonly string[]).includes(sp.result ?? "") ? sp.result! : "";
  const method = (METHODS as readonly string[]).includes(sp.method ?? "") ? sp.method! : "";
  const scans = await sql`select sc.scanned_at, sc.method, sc.result, sc.student_id, st.full_name as student, st.roll_no, sf.full_name as staff
    from scans sc left join profiles st on st.id = sc.student_id left join profiles sf on sf.id = sc.staff_id
    where (sc.scanned_at at time zone 'Asia/Kolkata')::date = ${date}
      and ${result === "failed" ? sql`sc.result <> 'served'` : result ? sql`sc.result = ${result}` : sql`true`}
      and ${method ? sql`sc.method = ${method}` : sql`true`}
    order by sc.scanned_at desc limit 500`;
  const log = await sql`select a.at, a.action, a.entity_id, a.diff, p.full_name as actor from audit_log a left join profiles p on p.id = a.actor_id
    order by a.at desc limit 100`;
  return (
    <>
      <h1>Audit</h1>
      <form className="card row">
        <label>Date <input type="date" name="date" defaultValue={date} /></label>
        <label>Result <select name="result" defaultValue={result}><option value="">any</option>{RESULTS.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>Method <select name="method" defaultValue={method}><option value="">any</option>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <button className="secondary">Filter</button>
      </form>
      <section className="card scroll"><h2>Scans ({scans.length})</h2><table>
        <thead><tr><th>When</th><th>Student</th><th>Staff</th><th>Method</th><th>Result</th></tr></thead>
        <tbody>{scans.map((s, i) => (
          <tr key={i}><td>{ts(s.scanned_at)}</td>
            <td>{s.student_id ? <Link href={`/admin/students/${s.student_id}`}>{s.student}</Link> : <span className="muted">unknown</span>} <span className="muted">{s.roll_no}</span></td>
            <td>{s.staff}</td><td>{s.method === "backup" ? <span className="warn">backup</span> : "qr"}</td>
            <td className={s.result === "served" ? "ok" : "bad"}>{s.result}</td></tr>
        ))}{scans.length === 0 && <tr><td colSpan={5} className="muted">No scans match.</td></tr>}</tbody>
      </table></section>
      <section className="card scroll"><h2>Admin actions (latest 100)</h2><table>
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
        <tbody>{log.map((a, i) => (
          <tr key={i}><td>{ts(a.at)}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.entity_id}</td><td><code style={{ fontSize: 12 }}>{JSON.stringify(a.diff)}</code></td></tr>
        ))}{log.length === 0 && <tr><td colSpan={5} className="muted">No entries yet.</td></tr>}</tbody>
      </table></section>
    </>
  );
}
