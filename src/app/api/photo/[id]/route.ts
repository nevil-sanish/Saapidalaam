import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Student photos are private: only the student, staff and admin may view (NFR §8).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  if (!u || !(u.id === id || u.role === "staff" || u.role === "admin")) return new NextResponse("forbidden", { status: 403 });
  const [p] = await sql`select photo, photo_type from profiles where id = ${id}`;
  if (!p?.photo) return new NextResponse("not found", { status: 404 });
  return new NextResponse(p.photo, { headers: { "content-type": p.photo_type ?? "image/jpeg", "cache-control": "private, max-age=60" } });
}
