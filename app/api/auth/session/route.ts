import { NextRequest, NextResponse } from "next/server";
import { hasValidSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authenticated = hasValidSession(request);
  return NextResponse.json({ authenticated }, { headers: { "Cache-Control": "no-store" } });
}
