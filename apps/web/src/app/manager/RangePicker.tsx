import Link from "next/link";
import { addDays } from "@saap/shared/time";
import type { Range } from "@/lib/reports";

/** GET form for ?view=&from= plus prev/next links. Shared by demand and payable pages. */
export function RangePicker({ path, range }: { path: string; range: Range }) {
  const step = range.view === "day" ? 1 : range.view === "week" ? 7 : 0;
  const prev = step ? addDays(range.from, -step) : addDays(range.from, -1).slice(0, 8) + "01";
  const next = step ? addDays(range.from, step) : addDays(range.to, 1);
  const href = (from: string) => `${path}?view=${range.view}&from=${from}`;
  return (
    <form method="get" action={path} className="row card">
      <label>View{" "}
        <select name="view" defaultValue={range.view}>
          <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
        </select>
      </label>
      <label>From <input type="date" name="from" defaultValue={range.from} /></label>
      <button>Show</button>
      <Link href={href(prev)}>← Previous</Link>
      <Link href={href(next)}>Next →</Link>
      <span className="muted">{range.from} to {range.to}</span>
    </form>
  );
}
