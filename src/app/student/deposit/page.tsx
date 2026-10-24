import { requireRole } from "@/lib/auth";
import { act } from "@/lib/act";
import { sql } from "@/lib/db";
import { rupees, toPaise } from "@/lib/money";
import { fmtIST } from "@/lib/time";
import { Flash } from "@/components/Shell";

const MAX_PAISE = 10_000_000; // ₹1,00,000 sanity cap on a single claim

async function submit(fd: FormData) {
  "use server";
  const user = await requireRole("student");
  await act("/student/deposit", async () => {
    const amount = toPaise(String(fd.get("amount") ?? ""));
    const ref = String(fd.get("txn_ref") ?? "").trim();
    if (amount <= 0 || amount > MAX_PAISE) throw new Error("Amount must be between ₹0.01 and ₹1,00,000");
    if (!ref || ref.length > 64) throw new Error("Transaction reference is required (max 64 characters)");
    await sql`insert into deposits (student_id, amount, txn_ref, status) values (${user.id}, ${amount}, ${ref}, 'pending')`;
    return "Deposit submitted; it counts once the admin verifies it (BR-11)";
  });
}

// D-11 / T-27: student records the bank transaction; admin verifies.
export default async function DepositPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const rows = await sql<{ id: string; amount: number; txn_ref: string; status: string; created_at: Date }[]>`
    select id, amount, txn_ref, status, created_at from deposits where student_id = ${user.id} order by created_at desc`;
  return (
    <>
      <h1>Deposit</h1>
      <Flash sp={sp} />
      <form action={submit} className="card">
        <p className="muted">Pay the mess deposit to the college account, then enter the amount and transaction reference here.</p>
        <div className="row">
          <label htmlFor="amount">Amount (₹)</label>
          <input id="amount" name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required placeholder="30000" />
          <label htmlFor="txn_ref">Transaction ref</label>
          <input id="txn_ref" name="txn_ref" maxLength={64} required placeholder="UTR / UPI ref" />
          <button>Submit</button>
        </div>
      </form>
      <div className="card">
        <h2>My deposits</h2>
        {rows.length === 0 ? <p className="muted">None yet.</p> : (
          <div className="scroll"><table>
            <thead><tr><th>Submitted</th><th>Amount</th><th>Ref</th><th>Status</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td>{fmtIST(r.created_at.getTime())}</td><td>{rupees(r.amount)}</td><td>{r.txn_ref}</td>
                <td><span className={`pill ${r.status === "verified" ? "ok" : r.status === "rejected" ? "bad" : "warn"}`}>{r.status}</span></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
