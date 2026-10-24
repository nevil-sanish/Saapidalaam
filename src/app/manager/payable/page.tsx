import { tick } from "@/lib/db";
import { rupees } from "@/lib/money";
import { payable, rangeFor } from "@/lib/reports";
import { RangePicker } from "../RangePicker";

export default async function Payable({ searchParams }: { searchParams: Promise<{ view?: string; from?: string }> }) {
  await tick();
  const sp = await searchParams;
  const range = rangeFor(sp.view ?? "month", sp.from);
  const p = await payable(range.from, range.to);
  return (
    <>
      <h1>Amount payable to the mess</h1>
      <RangePicker path="/manager/payable" range={range} />
      <section className="card mint payable-hero">
        <span>Payable for {range.from} to {range.to}</span>
        <b>{rupees(p.amount)}</b>
        <span>{p.meals} charged meals</span>
      </section>
      <p className="muted">Sum of meal charges posted at cutoff for meals dated in this period (served and no-show both count). Aggregate only.</p>
    </>
  );
}
