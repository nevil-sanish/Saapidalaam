import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { qrToken } from "@/lib/db";

// BR-30: ready-made 30s token; the secret never leaves the server.
export async function GET() {
  const u = await currentUser();
  if (!u || u.role !== "student") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await qrToken(u.id), { headers: { "cache-control": "no-store" } });
}
