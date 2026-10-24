import { NextResponse, type NextRequest } from "next/server";
import { supa } from "@/lib/auth";

// Domain/allowlist (BR-40/41) is enforced by the Supabase before-user-created hook; a rejected
// sign-up comes back here as ?error_description=.
export async function GET(req: NextRequest) {
  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  const p = req.nextUrl.searchParams;
  const fail = (m: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(m)}`);
  if (p.get("error_description")) return fail(p.get("error_description")!);
  const code = p.get("code");
  if (!code) return fail("Missing code");
  const { error } = await (await supa()).auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);
  return NextResponse.redirect(`${origin}/`);
}
