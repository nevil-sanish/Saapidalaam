import { NextResponse, type NextRequest } from "next/server";
import { supa } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  const sb = await supa();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error?.message ?? "Google sign-in failed")}`);
  return NextResponse.redirect(data.url);
}
