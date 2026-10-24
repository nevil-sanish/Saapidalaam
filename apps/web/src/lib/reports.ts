import "server-only";
import { z } from "zod";
import { diet, isoDate } from "@saap/shared/schemas";
import { addDays, todayIST } from "@saap/shared/time";
import { rpc } from "./rpc";

// Aggregate-only reports shared by manager and admin. BR-42: the RPCs return no per-student rows,
// and they check role (manager/admin) in the database.

export type Diet = z.infer<typeof diet>;
export const view = z.enum(["day", "week", "month"]);
export type View = z.infer<typeof view>;
export type Range = { view: View; from: string; to: string }; // inclusive YYYY-MM-DD

const realDate = isoDate.refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

/** Parses ?view=&from= into an inclusive range. month = the calendar month containing `from`. Bad input falls back to week / today. */
export function rangeFor(v: string | undefined, from: string | undefined, now = Date.now()): Range {
  const vw = view.catch("week").parse(v);
  let f = realDate.catch(todayIST(now)).parse(from);
  if (vw === "day") return { view: vw, from: f, to: f };
  if (vw === "week") return { view: vw, from: f, to: addDays(f, 6) };
  f = f.slice(0, 8) + "01";
  const next = new Date(Date.parse(f + "T00:00:00Z"));
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { view: vw, from: f, to: addDays(next.toISOString().slice(0, 10), -1) };
}

export type DemandRow = {
  date: string; slot_id: number; slot: string; diet: Diet; items: string; special: boolean;
  estimate: number; // status booked: still changeable
  locked: number;   // locked + served + no_show: exact
  served: number; no_show: number;
};
type DemandRpc = {
  served_on: string; slot_id: number; slot_label: string; diet: Diet; estimate: number; locked: number;
  served: number; no_show: number; items: string | null; is_special: boolean;
};
export async function demand(from: string, to: string): Promise<DemandRow[]> {
  const rows = await rpc<DemandRpc[]>("get_demand", { p_from: from, p_to: to });
  return (rows ?? []).map((r) => ({
    date: r.served_on, slot_id: r.slot_id, slot: r.slot_label, diet: r.diet, items: r.items ?? "", special: Boolean(r.is_special),
    estimate: Number(r.estimate), locked: Number(r.locked), served: Number(r.served), no_show: Number(r.no_show),
  }));
}

export type Payable = { meals: number; amount: number }; // amount in paise
/** Sum of posted meal charges for bookings served_on in range. */
export async function payable(from: string, to: string): Promise<Payable> {
  const rows = await rpc<Payable[] | Payable>("get_payable", { p_from: from, p_to: to });
  const r = Array.isArray(rows) ? rows[0] : rows;
  return { meals: Number(r?.meals ?? 0), amount: Number(r?.amount ?? 0) };
}

export type Wastage = { date: string; booked: number; served: number; pct: number | null };
/** Per past day (before today IST): served vs booked (non-cancelled). pct = served/booked*100. */
export async function wastage(from: string, to: string, now = Date.now()): Promise<Wastage[]> {
  const today = todayIST(now);
  const rows = await rpc<{ served_on: string; booked: number; served: number }[]>("get_wastage", { p_from: from, p_to: to });
  return (rows ?? [])
    .filter((r) => r.served_on < today)
    .map((r) => {
      const booked = Number(r.booked), served = Number(r.served);
      return { date: r.served_on, booked, served, pct: booked ? Math.round((served / booked) * 100) : null };
    });
}
