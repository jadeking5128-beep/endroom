import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  for (const name of ["trakt_access", "trakt_refresh", "trakt_expires", "simkl_access"]) response.cookies.set(name, "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/sync", maxAge: 0 });
  return response;
}
