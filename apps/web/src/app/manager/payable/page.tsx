import { rupees } from "@saap/shared/money";
import { payable, rangeFor } from "@/lib/reports";
import { RangePicker } from "../RangePicker";

export default async function Payable({ searchParams }: { searchParams: Promise<{ view?: string; from?: string }> }) {
  const sp = await searchParams;
  const range = rangeFor(sp.view ?? "month", sp.from);
  const p = await payable(range.from, range.to);
  return (
    <>
      <h1>Amount payable to the mess</h1>
      <RangePicker path="/manager/payable" range={range} />
      <div className="grid">
        <div className="card stat"><b>{rupees(p.amount)}</b><span>Payable for {range.from} to {range.to}</span></div>
        <div className="card stat"><b>{p.meals}</b><span>Charged meals</span></div>
      </div>
      <p className="muted">Sum of meal charges posted at cutoff for meals dated in this period (served and no-show both count). Aggregate only.</p>
    </>
  );
}
