import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { scan } from "@/lib/db";

// zod isn't a dependency yet; hand-check the two fields.
function parse(b: unknown): { input: string; method: "qr" | "backup" } | null {
  if (!b || typeof b !== "object") return null;
  const { input, method } = b as Record<string, unknown>;
  if (typeof input !== "string" || !input.trim() || input.length > 200) return null;
  if (method !== "qr" && method !== "backup") return null;
  return { input: input.trim(), method };
}

// ponytail: in-memory per-staff limiter, per server instance; move to the DB if we run multiple instances.
const hits = new Map<string, number[]>();
const LIMIT = 60, WINDOW = 60_000;
function limited(id: string) {
  const now = Date.now();
  const recent = (hits.get(id) ?? []).filter((t) => now - t < WINDOW);
  recent.push(now);
  hits.set(id, recent);
  return recent.length > LIMIT;
}

// BR-32/33/34: every attempt is logged inside scan().
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u || !(u.role === "staff" || u.role === "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (limited(u.id)) return NextResponse.json({ error: "Too many scans, wait a moment" }, { status: 429 });
  const body = parse(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const r = await scan(u.id, body.input, body.method);
  return NextResponse.json({ ...r, photoUrl: r.student ? `/api/photo/${r.student.id}` : undefined }, { headers: { "cache-control": "no-store" } });
}
