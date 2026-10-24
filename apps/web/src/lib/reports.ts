import "server-only";
import { sql, type Diet } from "./db";
import { addDays, todayIST } from "./time";

// Aggregate-only reports shared by manager and admin. BR-42: nothing here returns per-student rows.

export type View = "day" | "week" | "month";
export type Range = { view: View; from: string; to: string }; // inclusive YYYY-MM-DD

/** Parses ?view=&from= into an inclusive range. month = the calendar month containing `from`. */
export function rangeFor(view: string | undefined, from: string | undefined, now = Date.now()): Range {
  const v: View = view === "day" || view === "month" ? view : "week";
  let f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) && !Number.isNaN(Date.parse(from)) ? from : todayIST(now);
  if (v === "day") return { view: v, from: f, to: f };
  if (v === "week") return { view: v, from: f, to: addDays(f, 6) };
  f = f.slice(0, 8) + "01";
  const next = new Date(Date.parse(f + "T00:00:00Z"));
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { view: v, from: f, to: addDays(next.toISOString().slice(0, 10), -1) };
}

export type DemandRow = {
  date: string; slot_id: number; slot: string; diet: Diet; items: string; special: boolean;
  estimate: number; // status booked: still changeable
  locked: number;   // locked + served + no_show: exact
  served: number; no_show: number;
};
export async function demand(from: string, to: string): Promise<DemandRow[]> {
  return sql<DemandRow[]>`
    with b as (
      select served_on, slot_id, diet,
        count(*) filter (where status = 'booked')::int as estimate,
        count(*) filter (where status in ('locked','served','no_show'))::int as locked,
        count(*) filter (where status = 'served')::int as served,
        count(*) filter (where status = 'no_show')::int as no_show
      from bookings where served_on between ${from} and ${to} and status <> 'cancelled'
      group by served_on, slot_id, diet)
    select to_char(coalesce(b.served_on, m.served_on), 'YYYY-MM-DD') as date, s.id as slot_id, s.label as slot,
      coalesce(b.diet, m.diet) as diet, coalesce(m.items, '') as items, m.special_price is not null as special,
      coalesce(b.estimate, 0) as estimate, coalesce(b.locked, 0) as locked, coalesce(b.served, 0) as served, coalesce(b.no_show, 0) as no_show
    from b full join (select * from menu_entries where served_on between ${from} and ${to}) m
      on m.served_on = b.served_on and m.slot_id = b.slot_id and m.diet = b.diet
    join meal_slots s on s.id = coalesce(b.slot_id, m.slot_id)
    order by 1, s.sort, 4 desc`;
}

export type Payable = { meals: number; amount: number }; // amount in paise
/** Sum of posted meal charges for bookings served_on in range (charges are negative ledger rows). */
export async function payable(from: string, to: string): Promise<Payable> {
  const [r] = await sql<Payable[]>`
    select count(distinct l.booking_id)::int as meals, coalesce(-sum(l.amount), 0)::bigint as amount
    from ledger_entries l join bookings b on b.id = l.booking_id
    where l.kind = 'meal_charge' and b.served_on between ${from} and ${to}`;
  return r;
}

export type Wastage = { date: string; booked: number; served: number; pct: number | null };
/** Per past day (before today IST): served vs booked (non-cancelled). pct = served/booked*100. */
export async function wastage(from: string, to: string, now = Date.now()): Promise<Wastage[]> {
  const rows = await sql<Omit<Wastage, "pct">[]>`
    select to_char(served_on, 'YYYY-MM-DD') as date, count(*)::int as booked, count(*) filter (where status = 'served')::int as served
    from bookings where served_on between ${from} and ${to} and served_on < ${todayIST(now)} and status <> 'cancelled'
    group by served_on order by served_on`;
  return rows.map((r) => ({ ...r, pct: r.booked ? Math.round((r.served / r.booked) * 100) : null }));
}
