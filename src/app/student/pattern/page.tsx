import { requireRole } from "@/lib/auth";
import { act } from "@/lib/act";
import { savePattern, slots, sql, type Diet, type PatternRules, type Slot } from "@/lib/db";
import { addDays } from "@/lib/time";
import { Flash } from "@/components/Shell";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Collect `<prefix><key>_<slotId>` selects into PatternRules, ignoring "none". */
function rulesFrom(fd: FormData, prefix: string): PatternRules {
  const rules: PatternRules = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith(prefix) || (v !== "veg" && v !== "nonveg")) continue;
    const [key, slot] = k.slice(prefix.length).split("_");
    if (!key || !Number.isInteger(Number(slot))) continue;
    (rules[key] ??= []).push({ slot: Number(slot), diet: v as Diet });
  }
  return rules;
}

async function saveWeekly(fd: FormData) {
  "use server";
  const user = await requireRole("student");
  await act("/student/pattern", async () => {
    const rules = rulesFrom(fd, "w_");
    if (Object.keys(rules).some((d) => !/^[1-7]$/.test(d))) throw new Error("Bad weekday");
    const r = await savePattern(user.id, "weekly", rules, null);
    return `Weekly pattern saved: ${r.created} booked, ${r.skipped} skipped`;
  });
}

async function saveMonthly(fd: FormData) {
  "use server";
  const user = await requireRole("student");
  const month = String(fd.get("month") ?? "");
  await act(`/student/pattern?month=${encodeURIComponent(month)}`, async () => {
    const rules = rulesFrom(fd, "m_");
    if (Object.keys(rules).some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error("Bad date");
    const r = await savePattern(user.id, "monthly", rules, month);
    return `Monthly package saved: ${r.created} booked, ${r.skipped} skipped`;
  });
}

function DietSelect({ name, value, label }: { name: string; value?: Diet; label: string }) {
  return (
    <select name={name} defaultValue={value ?? "none"} aria-label={label}>
      <option value="none">—</option><option value="veg">Veg</option><option value="nonveg">Non-veg</option>
    </select>
  );
}
const pick = (rules: PatternRules | undefined, key: string, s: Slot) => rules?.[key]?.find((r) => Number(r.slot) === s.id)?.diet;

// Story 3 / BR-05..07: one active pattern, weekly or monthly.
export default async function PatternPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; month?: string }> }) {
  const user = await requireRole("student");
  const sp = await searchParams;
  const ss = await slots();
  const [active] = await sql<{ kind: "weekly" | "monthly"; month: string | null; rules: PatternRules; created_at: Date }[]>`
    select kind, to_char(month,'YYYY-MM-DD') as month, rules, created_at from patterns where student_id = ${user.id} and is_active`;
  const months = (await sql<{ month: string }[]>`select to_char(month,'YYYY-MM-DD') as month from menu_months order by month desc limit 6`).map((m) => m.month);
  const month = sp.month && months.includes(sp.month) ? sp.month : undefined;
  const monthDates: string[] = [];
  if (month) for (let d = month; d.slice(0, 7) === month.slice(0, 7); d = addDays(d, 1)) monthDates.push(d);
  const weekly = active?.kind === "weekly" ? active.rules : undefined;
  const monthly = active?.kind === "monthly" && active.month === month ? active.rules : undefined;

  return (
    <>
      <h1>Meal pattern</h1>
      <Flash sp={sp} />
      <div className="card">
        <h2>Current</h2>
        {active ? <p>Active <b>{active.kind}</b> pattern{active.month && ` for ${active.month.slice(0, 7)}`}, saved {active.created_at.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}.</p>
          : <p className="muted">No active pattern. Meals are not booked by default (BR-01).</p>}
        <p className="muted">Saving a new pattern replaces the old one and cancels its future pattern bookings that are still before cutoff (BR-05). One-off bookings and cancellations are kept.</p>
      </div>

      <form action={saveWeekly} className="card">
        <h2>Weekly pattern</h2>
        <div className="scroll"><table>
          <thead><tr><th>Day</th>{ss.map((s) => <th key={s.id}>{s.label}</th>)}</tr></thead>
          <tbody>{DOW.map((d, i) => (
            <tr key={d}><th>{d}</th>{ss.map((s) => <td key={s.id}><DietSelect name={`w_${i + 1}_${s.id}`} value={pick(weekly, String(i + 1), s)} label={`${d} ${s.label}`} /></td>)}</tr>
          ))}</tbody>
        </table></div>
        <p><button>Save weekly pattern</button></p>
      </form>

      <div className="card">
        <h2>Monthly package</h2>
        {months.length === 0 ? <p className="muted">No monthly menu published yet (BR-07).</p> : (
          <form method="get" className="inline">
            <label htmlFor="month">Month</label>
            <select id="month" name="month" defaultValue={month}>{months.map((m) => <option key={m} value={m}>{m.slice(0, 7)}</option>)}</select>
            <button className="secondary">Open</button>
          </form>
        )}
        {month && (
          <form action={saveMonthly}>
            <input type="hidden" name="month" value={month} />
            <div className="scroll"><table>
              <thead><tr><th>Date</th>{ss.map((s) => <th key={s.id}>{s.label}</th>)}</tr></thead>
              <tbody>{monthDates.map((d) => (
                <tr key={d}><th>{d.slice(8)} {DOW[(new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7]}</th>
                  {ss.map((s) => <td key={s.id}><DietSelect name={`m_${d}_${s.id}`} value={pick(monthly, d, s)} label={`${d} ${s.label}`} /></td>)}</tr>
              ))}</tbody>
            </table></div>
            <p><button>Save monthly package</button> <span className="muted">Dates already past cutoff are skipped.</span></p>
          </form>
        )}
      </div>
    </>
  );
}
