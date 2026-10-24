import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { reportRange, reportRows } from "@/lib/admin";

export async function GET(req: Request) {
  const u = await currentUser();
  if (u?.role !== "admin") return new NextResponse("forbidden", { status: 403 });
  const p = new URL(req.url).searchParams;
  const { from, to } = reportRange(p.get("from") ?? undefined, p.get("to") ?? undefined);
  const rows = await reportRows(from, to);
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = ["date,slot,booked,served,no_show,cancelled,revenue_inr",
    ...rows.map((r) => [r.date, r.slot, r.booked, r.served, r.no_show, r.cancelled, (r.revenue / 100).toFixed(2)].map(cell).join(","))].join("\n");
  return new NextResponse(csv + "\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="saapidalaam-${from}-to-${to}.csv"` },
  });
}
