import Link from "next/link";
import { sql } from "@/lib/db";
import { rupees } from "@/lib/money";
import { todayIST } from "@/lib/time";

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
  const stats: [string, string | number, string?][] = [
    ["Students", `${r.active_students} / ${r.students}`, "active / total"],
    ["Verified deposits", rupees(r.deposits)],
    ["Charges posted", rupees(r.charges)],
    ["Refunds paid", rupees(r.refunds)],
    ["Pending deposits", r.pending, "/admin/finance"],
    ["Today served / booked", `${r.served_today} / ${r.booked_today}`],
    ["Failed scans today", r.failed_today, "/admin/audit"],
  ];
  return (
    <>
      <h1>Admin overview</h1>
      <div className="grid">
        {stats.map(([label, v, hint]) => (
          <div key={label} className="card stat">
            <b>{v}</b>
            <span>{hint?.startsWith("/") ? <Link href={hint}>{label}</Link> : label}{hint && !hint.startsWith("/") ? ` (${hint})` : ""}</span>
          </div>
        ))}
      </div>
      <p><Link href="/manager">Open the manager demand view</Link> · <Link href="/admin/reports">Reports</Link></p>
    </>
  );
}
