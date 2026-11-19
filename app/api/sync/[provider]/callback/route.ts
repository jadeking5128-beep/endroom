import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (provider !== "trakt" && provider !== "simkl") return NextResponse.json({ ok: false, error: "Unsupported sync provider." }, { status: 404 });
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const verifier = request.cookies.get(`${provider}_pkce_verifier`)?.value;
  const expectedState = request.cookies.get(`${provider}_oauth_state`)?.value;
  const redirectUri = request.cookies.get(`${provider}_redirect_uri`)?.value;
  const clientId = provider === "trakt" ? process.env.TRAKT_CLIENT_ID : process.env.SIMKL_CLIENT_ID;
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/?sync=${provider}-error&reason=${encodeURIComponent(reason)}`, base));
  if (!code || !state || !verifier || !expectedState || state !== expectedState || !redirectUri || !clientId) return fail("OAuth verification failed. Please reconnect.");
  try {
    const response = await fetch(provider === "trakt" ? "https://api.trakt.tv/oauth/token" : "https://api.simkl.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "EndRoom/1.0" },
      body: JSON.stringify({ code, client_id: clientId, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (!response.ok || typeof data.access_token !== "string") return fail("The provider rejected the sign-in. Please try again.");
    const secure = base.startsWith("https://");
    const cookie = { httpOnly: true, secure, sameSite: "lax" as const, path: "/api/sync", maxAge: provider === "trakt" ? 60 * 60 * 24 * 180 : 60 * 60 * 24 * 365 * 5 };
    const result = NextResponse.redirect(new URL(`/?sync=${provider}-connected`, base));
    result.cookies.set(`${provider}_access`, data.access_token, cookie);
    if (provider === "trakt" && typeof data.refresh_token === "string") result.cookies.set("trakt_refresh", data.refresh_token, cookie);
    if (provider === "trakt") result.cookies.set("trakt_expires", String(Date.now() + Math.max(60, Number(data.expires_in) || 604800) * 1000), cookie);
    for (const name of ["pkce_verifier", "oauth_state", "redirect_uri"]) result.cookies.set(`${provider}_${name}`, "", { ...cookie, path: `/api/sync/${provider}`, maxAge: 0 });
    return result;
  } catch { return fail("Could not complete provider sign-in."); }
}
