import { requireRole } from "@/lib/auth";
import { act } from "@/lib/act";
import { savePattern, slots, sql, type Diet, type PatternRules, type Slot } from "@/lib/db";
import { addDays } from "@/lib/time";
import { Flash } from "@/components/Shell";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ART: Record<string, string> = { B: "🥞", L: "🍛", S: "☕", D: "🍲" };

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
      <option value="none">Skip</option><option value="veg">Veg</option><option value="nonveg">Non-veg</option>
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

  const dayRow = (key: string, title: string, sub: string | null, rules: PatternRules | undefined, prefix: string) => (
    <div key={key} className="pattern-day">
      <div className="pd-name"><b>{title}</b>{sub && <small className="muted">{sub}</small>}</div>
      {ss.map((s) => (
        <label key={s.id} className="pd-slot">
          <span><span aria-hidden>{ART[s.code] ?? "🍽️"}</span> {s.label}</span>
          <DietSelect name={`${prefix}${key}_${s.id}`} value={pick(rules, key, s)} label={`${title}${sub ? ` ${sub}` : ""} ${s.label}`} />
        </label>
      ))}
    </div>
  );

  return (
    <>
      <h1>Meal pattern</h1>
      <Flash sp={sp} />
      <section className="card mint">
        <h2>Your current pattern</h2>
        {active ? <p>You have an active <b>{active.kind}</b> pattern{active.month && ` for ${active.month.slice(0, 7)}`}, saved on {active.created_at.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}.</p>
          : <p>No active pattern. Meals are not booked by default.</p>}
        <p style={{ margin: 0, color: "rgba(37,37,37,.72)" }}>Saving a new pattern replaces the old one and cancels its future pattern bookings that are still before cutoff. One-off bookings and cancellations are kept.</p>
      </section>

      <form action={saveWeekly} className="card">
        <div className="section-head"><h2>Weekly pattern</h2><span className="muted">Repeats every week</span></div>
        <div className="pattern">
          {DOW.map((d, i) => dayRow(String(i + 1), DOW_LONG[i], null, weekly, "w_"))}
        </div>
        <p style={{ marginTop: 16 }}><button>Save weekly pattern</button></p>
      </form>

      <section className="card">
        <div className="section-head"><h2>Monthly package</h2><span className="muted">Pick every meal for one month</span></div>
        {months.length === 0 ? <p className="muted">No monthly menu has been published yet.</p> : (
          <form method="get" className="inline" style={{ marginBottom: 16 }}>
            <label htmlFor="month">Month</label>
            <select id="month" name="month" defaultValue={month}>{months.map((m) => <option key={m} value={m}>{m.slice(0, 7)}</option>)}</select>
            <button className="secondary">Open month</button>
          </form>
        )}
        {month && (
          <form action={saveMonthly}>
            <input type="hidden" name="month" value={month} />
            <div className="pattern">
              {monthDates.map((d) => dayRow(d, `${Number(d.slice(8))}`, DOW[(new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7], monthly, "m_"))}
            </div>
            <p className="row" style={{ marginTop: 16 }}><button>Save monthly package</button> <span className="muted">Dates already past cutoff are skipped.</span></p>
          </form>
        )}
      </section>
    </>
  );
}
