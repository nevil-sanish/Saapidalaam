import Link from "next/link";
import { audit, balance, notify, sql } from "@/lib/db";
import { adminAct, money, str, uuid } from "@/lib/admin";
import { rupees } from "@/lib/money";
import { fmtIST } from "@/lib/time";
import { Flash } from "@/components/Shell";

const P = "/admin/finance";

async function findStudent(who: string) {
  const w = who.trim().toLowerCase();
  const [s] = await sql`select id, full_name from profiles where role = 'student' and (lower(email) = ${w} or lower(roll_no) = ${w})`;
  if (!s) throw new Error("No student with that email / roll no");
  return s as { id: string; full_name: string };
}

async function verify(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const id = uuid(fd.get("id"));
    await sql.begin(async (t) => {
      // BR-11: deposit counts only once verified; ledger row + status flip in one transaction.
      const [d] = await t`update deposits set status = 'verified', verified_by = ${admin}, verified_at = now()
        where id = ${id} and status = 'pending' returning student_id, amount, txn_ref`;
      if (!d) throw new Error("Deposit not pending");
      await t`insert into ledger_entries (student_id, kind, amount, ref, note, created_by) values (${d.student_id}, 'deposit', ${d.amount}, ${d.txn_ref}, 'deposit verified', ${admin})`;
      await notify(t, d.student_id, "Deposit verified", `Your deposit of ${rupees(d.amount)} (ref ${d.txn_ref}) is verified.`);
      await audit(t, admin, "deposit.verify", id, { amount: d.amount, txn_ref: d.txn_ref });
    });
    return "Deposit verified";
  });
}
async function reject(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const id = uuid(fd.get("id"));
    await sql.begin(async (t) => {
      const [d] = await t`update deposits set status = 'rejected', verified_by = ${admin}, verified_at = now()
        where id = ${id} and status = 'pending' returning student_id, amount, txn_ref`;
      if (!d) throw new Error("Deposit not pending");
      await notify(t, d.student_id, "Deposit rejected", `Your deposit of ${rupees(d.amount)} (ref ${d.txn_ref}) could not be verified. Contact the admin.`);
      await audit(t, admin, "deposit.reject", id, { amount: d.amount, txn_ref: d.txn_ref });
    });
    return "Deposit rejected";
  });
}
async function refund(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const s = await findStudent(str(fd, "student", 254));
    const amount = money(fd, "amount"), ref = str(fd, "ref", 100);
    await sql.begin(async (t) => {
      await t`select pg_advisory_xact_lock(hashtext(${s.id}))`;
      const b = await balance(s.id, t);
      if (amount > b.available && fd.get("override") !== "on")
        throw new Error(`Refund ${rupees(amount)} exceeds available balance ${rupees(b.available)}. Tick "allow over balance" to proceed.`);
      await t`insert into ledger_entries (student_id, kind, amount, ref, note, created_by) values (${s.id}, 'refund', ${-amount}, ${ref}, 'refund payout', ${admin})`; // BR-17
      await notify(t, s.id, "Refund recorded", `${rupees(amount)} refunded (payout ref ${ref}).`);
      await audit(t, admin, "ledger.refund", s.id, { amount, ref, available: b.available });
    });
    return `Refund of ${rupees(amount)} recorded for ${s.full_name}`;
  });
}
async function adjust(fd: FormData) {
  "use server";
  await adminAct(P, async (admin) => {
    const s = await findStudent(str(fd, "student", 254));
    const amount = money(fd, "amount", { signed: true }), note = str(fd, "note", 300, 3); // BR-15: note mandatory
    await sql.begin(async (t) => {
      await t`insert into ledger_entries (student_id, kind, amount, note, created_by) values (${s.id}, 'adjustment', ${amount}, ${note}, ${admin})`;
      await notify(t, s.id, "Balance adjusted", `${amount > 0 ? "+" : "−"}${rupees(Math.abs(amount))}: ${note}`);
      await audit(t, admin, "ledger.adjustment", s.id, { amount, note });
    });
    return `Adjustment ${rupees(amount)} recorded for ${s.full_name}`;
  });
}

export default async function Finance({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const pending = await sql`select d.id, d.amount, d.txn_ref, d.created_at, p.id as sid, p.full_name, p.roll_no, p.email
    from deposits d join profiles p on p.id = d.student_id where d.status = 'pending' order by d.created_at`;
  const recent = await sql`select l.kind, l.amount, l.ref, l.note, l.created_at, p.id as sid, p.full_name from ledger_entries l
    join profiles p on p.id = l.student_id where l.kind in ('deposit','refund','adjustment') order by l.created_at desc limit 30`;
  return (
    <>
      <h1>Finance</h1>
      <Flash sp={sp} />
      <section className="card scroll">
        <h2>Pending deposits ({pending.length})</h2>
        <table>
          <thead><tr><th>Student</th><th>Amount</th><th>Txn ref</th><th>Submitted</th><th></th></tr></thead>
          <tbody>{pending.map((d) => (
            <tr key={d.id}><td><Link href={`/admin/students/${d.sid}`}>{d.full_name}</Link> <span className="muted">{d.roll_no ?? d.email}</span></td>
              <td>{rupees(d.amount)}</td><td>{d.txn_ref}</td><td>{fmtIST(new Date(d.created_at).getTime())}</td>
              <td className="row">
                <form action={verify}><input type="hidden" name="id" value={d.id} /><button>Verify</button></form>
                <form action={reject}><input type="hidden" name="id" value={d.id} /><button className="secondary">Reject</button></form>
              </td></tr>
          ))}{pending.length === 0 && <tr><td colSpan={5} className="muted">Nothing pending.</td></tr>}</tbody>
        </table>
      </section>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <form action={refund} className="card" style={{ display: "grid", gap: 8 }}>
          <h2>Record refund</h2>
          <input name="student" placeholder="Student email or roll no" required maxLength={254} aria-label="Student" />
          <label>Amount ₹ <input name="amount" inputMode="decimal" required size={10} /></label>
          <input name="ref" placeholder="Payout reference" required maxLength={100} aria-label="Payout reference" />
          <label className="muted"><input type="checkbox" name="override" /> allow over available balance</label>
          <button>Record refund</button>
        </form>
        <form action={adjust} className="card" style={{ display: "grid", gap: 8 }}>
          <h2>Adjustment</h2>
          <p className="muted">Ledger is append-only (BR-15). Use + to credit, − to debit.</p>
          <input name="student" placeholder="Student email or roll no" required maxLength={254} aria-label="Student" />
          <label>Amount ₹ <input name="amount" inputMode="decimal" placeholder="-50.00" required size={10} /></label>
          <textarea name="note" placeholder="Reason (required)" required minLength={3} maxLength={300} aria-label="Note" />
          <button>Post adjustment</button>
        </form>
      </div>
      <section className="card scroll">
        <h2>Recent money movements</h2>
        <table>
          <thead><tr><th>When</th><th>Student</th><th>Kind</th><th>Amount</th><th>Ref / note</th></tr></thead>
          <tbody>{recent.map((l, i) => (
            <tr key={i}><td>{fmtIST(new Date(l.created_at).getTime())}</td><td><Link href={`/admin/students/${l.sid}`}>{l.full_name}</Link></td>
              <td>{l.kind}</td><td className={l.amount < 0 ? "bad" : "ok"}>{rupees(l.amount)}</td><td>{[l.ref, l.note].filter(Boolean).join(" · ")}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </>
  );
}
