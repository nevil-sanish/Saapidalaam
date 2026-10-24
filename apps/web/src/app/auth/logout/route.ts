import { NextResponse, type NextRequest } from "next/server";
import { supa } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await (await supa()).auth.signOut();
  return NextResponse.redirect(`${process.env.APP_URL ?? req.nextUrl.origin}/login`, 303);
}
