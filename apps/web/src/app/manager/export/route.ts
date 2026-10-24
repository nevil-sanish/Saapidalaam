import { currentUser } from "@/lib/auth";
import { demand, rangeFor } from "@/lib/reports";

const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || (u.role !== "manager" && u.role !== "admin")) return new Response("Forbidden", { status: 403 });
  const p = new URL(req.url).searchParams;
  const range = rangeFor(p.get("view") ?? undefined, p.get("from") ?? undefined);
  const rows = await demand(range.from, range.to); // aggregate only (BR-42)
  const lines = [["date", "slot", "diet", "menu", "special", "locked", "estimate", "served", "no_show"].join(",")]
    .concat(rows.map((r) => [r.date, r.slot, r.diet, r.items, r.special ? "yes" : "no", r.locked, r.estimate, r.served, r.no_show].map(cell).join(",")));
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="demand-${range.from}-to-${range.to}.csv"` },
  });
}
