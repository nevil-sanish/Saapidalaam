import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, queryParams: { prompt: "select_account", hd: "iiitkottayam.ac.in" } },
  });
  if (error || !data.url) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error?.message ?? "Google sign-in failed")}`);
  return NextResponse.redirect(data.url);
}
