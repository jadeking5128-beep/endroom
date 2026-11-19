import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = { action?: string; type?: string; title?: string; year?: number; imdbId?: string; season?: number; episode?: number; progress?: number };
const cleanText = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validImdb = (value: string) => /^tt[0-9]{7,8}$/.test(value) ? value : undefined;

export async function POST(request: NextRequest) {
  let body: Payload;
  try { body = await request.json() as Payload; } catch { return NextResponse.json({ ok: false, error: "Invalid playback event." }, { status: 400 }); }
  const action = body.action;
  if (!["start", "pause", "stop"].includes(String(action))) return NextResponse.json({ ok: false, error: "Unsupported playback event." }, { status: 400 });
  const title = cleanText(body.title);
  if (!title) return NextResponse.json({ ok: false, error: "A title is required." }, { status: 400 });
  const type = body.type === "movie" ? "movie" : "series";
  const imdb = validImdb(cleanText(body.imdbId));
  const progress = Math.max(0, Math.min(100, Number(body.progress) || 0));
  const year = Number.isInteger(body.year) && Number(body.year) >= 1888 && Number(body.year) <= 2100 ? Number(body.year) : undefined;
  const season = Number.isInteger(body.season) && Number(body.season) > 0 ? Number(body.season) : undefined;
  const episode = Number.isInteger(body.episode) && Number(body.episode) > 0 ? Number(body.episode) : undefined;
  if (type === "series" && (!season || !episode)) return NextResponse.json({ ok: false, error: "Episode playback requires season and episode numbers." }, { status: 400 });
  const results: Record<string, unknown> = {};
  const traktToken = request.cookies.get("trakt_access")?.value;
  const simklToken = request.cookies.get("simkl_access")?.value;
  const clientTrakt = process.env.TRAKT_CLIENT_ID;
  const clientSimkl = process.env.SIMKL_CLIENT_ID;
  const base = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const traktRedirect = new URL("/api/sync/trakt/callback", base).toString();
  const secure = base.startsWith("https://");
  const cookieUpdates: { name: string; value: string; maxAge: number }[] = [];

  if (traktToken && clientTrakt) {
    let access = traktToken;
    const expires = Number(request.cookies.get("trakt_expires")?.value || 0);
    if (expires && Date.now() > expires - 60000) {
      const refresh = request.cookies.get("trakt_refresh")?.value;
      if (refresh) {
        try {
          const refreshed = await fetch("https://api.trakt.tv/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refresh, client_id: clientTrakt, redirect_uri: traktRedirect, grant_type: "refresh_token" }), signal: AbortSignal.timeout(10000) });
          const tokenData = await refreshed.json();
          if (refreshed.ok && typeof tokenData.access_token === "string") {
            access = tokenData.access_token;
            const cookie = { httpOnly: true, secure, sameSite: "lax" as const, path: "/api/sync", maxAge: 60 * 60 * 24 * 180 };
            cookieUpdates.push({ name: "trakt_access", value: access, maxAge: cookie.maxAge });
            if (typeof tokenData.refresh_token === "string") cookieUpdates.push({ name: "trakt_refresh", value: tokenData.refresh_token, maxAge: cookie.maxAge });
            cookieUpdates.push({ name: "trakt_expires", value: String(Date.now() + Math.max(60, Number(tokenData.expires_in) || 604800) * 1000), maxAge: cookie.maxAge });
          }
        } catch { /* The provider result below reports a failed sync without interrupting playback. */ }
      }
    }
    const media = type === "movie"
      ? { movie: { title, year, ids: imdb ? { imdb } : undefined }, progress }
      : { show: { title, year, ids: imdb ? { imdb } : undefined }, episode: { season, number: episode }, progress };
    try {
      const sync = await fetch(`https://api.trakt.tv/scrobble/${action}`, { method: "POST", headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientTrakt, Authorization: `Bearer ${access}` }, body: JSON.stringify(media), signal: AbortSignal.timeout(10000) });
      results.trakt = { ok: sync.ok, status: sync.status };
    } catch { results.trakt = { ok: false, error: "Network error" }; }
  }

  if (simklToken && clientSimkl) {
    const media = type === "movie"
      ? { movie: { title, year, ids: imdb ? { imdb } : undefined }, progress }
      : { show: { title, year, ids: imdb ? { imdb } : undefined }, episode: { season, episode }, progress };
    try {
      const sync = await fetch(`https://api.simkl.com/scrobble/${action}`, { method: "POST", headers: { "Content-Type": "application/json", "simkl-api-key": clientSimkl, Authorization: `Bearer ${simklToken}`, "User-Agent": "EndRoom/1.0" }, body: JSON.stringify(media), signal: AbortSignal.timeout(10000) });
      results.simkl = { ok: sync.ok, status: sync.status };
    } catch { results.simkl = { ok: false, error: "Network error" }; }
  }
  const response = NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
  for (const update of cookieUpdates) response.cookies.set(update.name, update.value, { httpOnly: true, secure, sameSite: "lax", path: "/api/sync", maxAge: update.maxAge });
  return response;
}
