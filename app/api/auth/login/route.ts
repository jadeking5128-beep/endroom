import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie, sameOrigin, verifyMainPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = attempts.get(ip);
  if (current && current.resetAt > now && current.count >= 8) {
    return NextResponse.json({ error: "Too many password attempts. Wait a minute and try again." }, { status: 429 });
  }
  if (!current || current.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  else current.count += 1;

  let body: { password?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.password !== "string" || body.password.length < 10 || body.password.length > 256) {
    return NextResponse.json({ error: "Enter your main password." }, { status: 400 });
  }
  try {
    if (!(await verifyMainPassword(body.password))) {
      return NextResponse.json({ error: "Incorrect main password." }, { status: 401 });
    }
    attempts.delete(ip);
    const response = NextResponse.json({ authenticated: true });
    createSessionCookie(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Main password authentication is not configured yet. Set ALTBRAIN_PASSWORD_HASH and ALTBRAIN_SESSION_SECRET in Vercel." }, { status: 503 });
  }
}
