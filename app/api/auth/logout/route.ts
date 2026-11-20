import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, sameOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  const response = NextResponse.json({ authenticated: false });
  clearSessionCookie(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
