import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (provider !== "trakt" && provider !== "simkl") return NextResponse.json({ ok: false, error: "Unsupported sync provider." }, { status: 404 });
  const clientId = provider === "trakt" ? process.env.TRAKT_CLIENT_ID : process.env.SIMKL_CLIENT_ID;
  if (!clientId) return NextResponse.json({ ok: false, error: `${provider} client ID is not configured on the server.` }, { status: 503 });
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const redirectUri = new URL(`/api/sync/${provider}/callback`, base).toString();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");
  const authorize = new URL(provider === "trakt" ? "https://trakt.tv/oauth/authorize" : "https://simkl.com/oauth/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("state", state);
  if (provider === "simkl") { authorize.searchParams.set("app-name", "EndRoom"); authorize.searchParams.set("app-version", "1.0"); }
  const response = NextResponse.redirect(authorize);
  const cookieOptions = { httpOnly: true, secure: base.startsWith("https://"), sameSite: "lax" as const, path: `/api/sync/${provider}`, maxAge: 600 };
  response.cookies.set(`${provider}_pkce_verifier`, verifier, cookieOptions);
  response.cookies.set(`${provider}_oauth_state`, state, cookieOptions);
  response.cookies.set(`${provider}_redirect_uri`, redirectUri, cookieOptions);
  return response;
}
