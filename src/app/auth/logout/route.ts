import { NextResponse, type NextRequest } from "next/server";
import { endSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  await endSession();
  return NextResponse.redirect(`${process.env.APP_URL ?? req.nextUrl.origin}/login`, 303);
}
