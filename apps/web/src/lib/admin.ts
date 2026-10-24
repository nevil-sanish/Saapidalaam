import "server-only";
import { requireRole } from "./auth";
import { act } from "./act";
import { toPaise } from "./money";
import { sql } from "./db";
import { todayIST } from "./time";

// Admin server-action helpers. Every admin write goes through `adminAct` so the role check is server-side (not UI hiding).

/** Re-checks role inside the action, then runs it via act() (?ok / ?error flash). */
export async function adminAct(path: string, fn: (adminId: string) => Promise<string | void>) {
  const u = await requireRole("admin");
  return act(path, () => fn(u.id));
}

export function str(fd: FormData, name: string, max = 200, min = 1) {
  const v = String(fd.get(name) ?? "").trim();
  if (v.length < min || v.length > max) throw new Error(`${name}: must be ${min}–${max} characters`);
  return v;
}
export function oneOf<T extends string>(fd: FormData, name: string, allowed: readonly T[]): T {
  const v = String(fd.get(name) ?? "") as T;
  if (!allowed.includes(v)) throw new Error(`${name}: invalid value`);
  return v;
}
export function date(fd: FormData, name: string) {
  const v = String(fd.get(name) ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Error(`${name}: invalid date`);
  return v;
}
export function time(fd: FormData, name: string) {
  const v = String(fd.get(name) ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error(`${name}: invalid time`);
  return v;
}
export function int(fd: FormData, name: string) {
  const v = Number(fd.get(name));
  if (!Number.isInteger(v) || v <= 0) throw new Error(`${name}: invalid id`);
  return v;
}
export const uuid = (v: unknown) => {
  const s = String(v ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Error("Invalid id");
  return s;
};
/** Rupees string → paise. `signed` allows negatives (adjustments); otherwise must be > 0 (or ≥ 0 with allowZero). */
export function money(fd: FormData, name: string, opts: { signed?: boolean; allowZero?: boolean } = {}) {
  const p = toPaise(String(fd.get(name) ?? ""));
  if (opts.signed ? p === 0 : opts.allowZero ? p < 0 : p <= 0) throw new Error(`${name}: amount must be ${opts.signed ? "non-zero" : "positive"}`);
  if (Math.abs(p) > 10_000_000_00) throw new Error(`${name}: amount too large`);
  return p;
}
export const email = (fd: FormData, name = "email") => {
  const v = str(fd, name, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error("Invalid email");
  return v;
};

// ---------- reports (story 7): bookings vs served, no-shows, revenue per day × slot ----------
export type ReportRow = { date: string; slot: string; booked: number; served: number; no_show: number; cancelled: number; revenue: number };
export const reportRows = (from: string, to: string) => sql<ReportRow[]>`
  select to_char(b.served_on,'YYYY-MM-DD') as date, s.label as slot,
    count(*) filter (where b.status <> 'cancelled')::int as booked,
    count(*) filter (where b.status = 'served')::int as served,
    count(*) filter (where b.status = 'no_show')::int as no_show,
    count(*) filter (where b.status = 'cancelled')::int as cancelled,
    coalesce((select -sum(l.amount) from ledger_entries l join bookings b2 on b2.id = l.booking_id
      where l.kind = 'meal_charge' and b2.served_on = b.served_on and b2.slot_id = b.slot_id), 0)::bigint as revenue
  from bookings b join meal_slots s on s.id = b.slot_id
  where b.served_on between ${from} and ${to}
  group by b.served_on, b.slot_id, s.label, s.sort order by b.served_on, s.sort`;
export function reportRange(from?: string, to?: string) {
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
  const t = ok(to) ? to! : todayIST();
  const f = ok(from) ? from! : t.slice(0, 8) + "01";
  return f <= t ? { from: f, to: t } : { from: t, to: f };
}
