import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { resolveLogin, startSession, homeFor } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  const fail = (m: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(m)}`);
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail("Missing code");
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return fail(error?.message ?? "Google sign-in failed");
  await supabase.auth.signOut(); // identity verified; app session below
  try {
    // BR-40/41 enforced here, server-side.
    const id = await resolveLogin(data.user.email, String(data.user.user_metadata?.full_name ?? ""));
    await startSession(id);
    const [p] = await sql`select role from profiles where id = ${id}`;
    return NextResponse.redirect(`${origin}${homeFor(p.role)}`);
  } catch (e) {
    return fail((e as Error).message);
  }
}
