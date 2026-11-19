import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return NextResponse.json({
    ok: true,
    trakt: Boolean(request.cookies.get("trakt_access")?.value),
    simkl: Boolean(request.cookies.get("simkl_access")?.value)
  }, { headers: { "Cache-Control": "no-store" } });
}
