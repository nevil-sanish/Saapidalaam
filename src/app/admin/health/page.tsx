import { sql } from "@/lib/db";
import { fmtIST, todayIST } from "@/lib/time";

export default async function Health() {
  const today = todayIST();
  const jobs = await sql`select name, last_run, now() - last_run > interval '1 hour' as stale from job_runs order by name`;
  const failed = await sql`select result, method, count(*)::int as n from scans
    where (scanned_at at time zone 'Asia/Kolkata')::date = ${today} and result <> 'served' group by result, method order by n desc`;
  const [pending] = await sql`select count(*)::int as n from deposits where status = 'pending'`;
  return (
    <>
      <h1>System health</h1>
      <section className="card scroll"><h2>Job runs</h2><table>
        <thead><tr><th>Job</th><th>Last run</th><th>Status</th></tr></thead>
        <tbody>{jobs.map((j) => (
          <tr key={j.name}><td>{j.name}</td><td>{fmtIST(new Date(j.last_run).getTime())}</td><td className={j.stale ? "warn" : "ok"}>{j.stale ? "stale (>1h)" : "ok"}</td></tr>
        ))}{jobs.length === 0 && <tr><td colSpan={3} className="muted">No runs recorded.</td></tr>}</tbody>
      </table></section>
      <section className="card scroll"><h2>Failed scans today ({failed.reduce((a, f) => a + f.n, 0)})</h2><table>
        <thead><tr><th>Result</th><th>Method</th><th>Count</th></tr></thead>
        <tbody>{failed.map((f, i) => <tr key={i}><td className="bad">{f.result}</td><td>{f.method}</td><td>{f.n}</td></tr>)}
          {failed.length === 0 && <tr><td colSpan={3} className="muted">None today.</td></tr>}</tbody>
      </table></section>
      <p className="muted">Pending deposits: {pending.n}. Jobs run lazily on page load (tick, ≤1/min).</p>
    </>
  );
}
