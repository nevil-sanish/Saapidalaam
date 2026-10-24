import Link from "next/link";
import { addDays } from "@/lib/time";
import type { Range } from "@/lib/reports";

/** GET form for ?view=&from= plus prev/next links. Shared by demand and payable pages. */
export function RangePicker({ path, range }: { path: string; range: Range }) {
  const step = range.view === "day" ? 1 : range.view === "week" ? 7 : 0;
  const prev = step ? addDays(range.from, -step) : addDays(range.from, -1).slice(0, 8) + "01";
  const next = step ? addDays(range.from, step) : addDays(range.to, 1);
  const href = (from: string) => `${path}?view=${range.view}&from=${from}`;
  return (
    <form method="get" action={path} className="toolbar">
      <div className="seg" role="group" aria-label="Range">
        <label className="sr-only" htmlFor="rp-view">View</label>
        <select id="rp-view" name="view" defaultValue={range.view}>
          <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
        </select>
        <label className="sr-only" htmlFor="rp-from">From</label>
        <input id="rp-from" type="date" name="from" defaultValue={range.from} />
        <button>Show</button>
      </div>
      <div className="seg">
        <Link className="btn secondary" href={href(prev)} aria-label="Previous range">Previous</Link>
        <Link className="btn secondary" href={href(next)} aria-label="Next range">Next</Link>
      </div>
      <span className="muted toolbar-range">{range.from} to {range.to}</span>
    </form>
  );
}
