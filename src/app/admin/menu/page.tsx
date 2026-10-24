import { audit, publishMonth, slots, sql } from "@/lib/db";
import { adminAct, date } from "@/lib/admin";
import { addDays, todayIST } from "@/lib/time";
import { Flash } from "@/components/Shell";

const DIETS = ["veg", "nonveg"] as const;
const monthOf = (m?: string) => (m && /^\d{4}-\d{2}$/.test(m) ? m : todayIST().slice(0, 7));

async function saveDay(fd: FormData) {
  "use server";
  const d = date(fd, "date");
  await adminAct(`/admin/menu?month=${d.slice(0, 7)}`, async (admin) => {
    const ss = await slots();
    const changes: Record<string, string> = {};
    await sql.begin(async (t) => {
      for (const s of ss) for (const diet of DIETS) {
        const raw = fd.get(`items_${s.id}_${diet}`);
        if (raw == null) continue;
        const items = String(raw).trim();
        if (items.length > 300) throw new Error("Menu items: max 300 characters");
        // Upsert items only; special_price is left untouched (managed on /admin/specials).
        const r = items
          ? await t`insert into menu_entries (served_on, slot_id, diet, items) values (${d}, ${s.id}, ${diet}, ${items})
              on conflict (served_on, slot_id, diet) do update set items = excluded.items where menu_entries.items <> excluded.items returning 1`
          : await t`update menu_entries set items = '' where served_on = ${d} and slot_id = ${s.id} and diet = ${diet} and items <> '' returning 1`;
        if (r.length) changes[`${s.code}/${diet}`] = items;
      }
      if (Object.keys(changes).length) await audit(t, admin, "menu.edit", d, changes);
    });
    return Object.keys(changes).length ? `Saved ${d}` : "No changes";
  });
}
async function publish(fd: FormData) {
  "use server";
  const m = monthOf(String(fd.get("month") ?? ""));
  await adminAct(`/admin/menu?month=${m}`, async (admin) => {
    await publishMonth(admin, `${m}-01`); // BR-07; audits inside
    return `Published ${m}; students notified`;
  });
}

export default async function Menu({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const m = monthOf(sp.month);
  const first = `${m}-01`;
  const days: string[] = [];
  for (let d = first; d.startsWith(m); d = addDays(d, 1)) days.push(d);
  const ss = await slots();
  const entries = await sql<{ d: string; slot_id: number; diet: string; items: string; special_price: number | null }[]>`
    select to_char(served_on,'YYYY-MM-DD') as d, slot_id, diet, items, special_price from menu_entries
    where served_on >= ${first} and served_on < ${addDays(days[days.length - 1], 1)}`;
  const [pub] = await sql`select published_at from menu_months where month = ${first}`;
  const get = (d: string, s: number, diet: string) => entries.find((e) => e.d === d && e.slot_id === s && e.diet === diet);
  return (
    <>
      <h1>Monthly menu</h1>
      <Flash sp={sp} />
      <div className="card row">
        <form className="inline"><label>Month <input type="month" name="month" defaultValue={m} /></label><button className="secondary">Go</button></form>
        <span className={pub ? "ok" : "warn"}>{pub ? `Published ${new Date(pub.published_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "Not published"}</span>
        <form action={publish} className="inline"><input type="hidden" name="month" value={m} /><button>{pub ? "Re-publish" : "Publish"} {m}</button></form>
      </div>
      <div className="card scroll">
        <table>
          <thead><tr><th>Date</th>{ss.map((s) => <th key={s.id}>{s.label}</th>)}<th></th></tr></thead>
          <tbody>{days.map((d) => (
            <tr key={d}>
              <td>{d}</td>
              {ss.map((s) => (
                <td key={s.id}>{DIETS.map((diet) => { const e = get(d, s.id, diet); return (
                  <div key={diet}>
                    <input form={`f-${d}`} name={`items_${s.id}_${diet}`} defaultValue={e?.items ?? ""} placeholder={diet} maxLength={300} size={14} aria-label={`${d} ${s.label} ${diet}`} />
                    {e?.special_price != null && <span className="pill warn" title="special">★</span>}
                  </div>); })}</td>
              ))}
              <td><form id={`f-${d}`} action={saveDay}><input type="hidden" name="date" value={d} /><button className="secondary">Save</button></form></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
