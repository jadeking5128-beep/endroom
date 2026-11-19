import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const imdbId = query.get("imdb_id") || "";
  const isMovie = query.get("is_movie") === "true";
  const season = Number(query.get("season"));
  const episode = Number(query.get("episode"));

  if (!/^tt[0-9]{7,8}$/.test(imdbId)) {
    return NextResponse.json({ ok: false, error: "A valid IMDb ID is required." }, { status: 400 });
  }
  if (!isMovie && (!Number.isInteger(season) || season < 1 || season > 100 || !Number.isInteger(episode) || episode < 1 || episode > 500)) {
    return NextResponse.json({ ok: false, error: "Series playback requires a valid season and episode." }, { status: 400 });
  }

  const url = new URL("https://api.introdb.app/segments");
  url.searchParams.set("imdb_id", imdbId);
  if (isMovie) url.searchParams.set("is_movie", "true");
  else {
    url.searchParams.set("season", String(season));
    url.searchParams.set("episode", String(episode));
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      return NextResponse.json({ ok: false, error: "IntroDB is temporarily unavailable." }, { status: 502 });
    }
    const data = await response.json();
    const validSegment = (value: unknown) => {
      if (!value || typeof value !== "object") return null;
      const segment = value as Record<string, unknown>;
      const start = Number(segment.start_sec);
      const end = Number(segment.end_sec);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return null;
      return { start, end, confidence: Number(segment.confidence) || 0 };
    };
    return NextResponse.json({
      ok: true,
      data: {
        intro: validSegment(data.intro),
        recap: validSegment(data.recap),
        outro: validSegment(data.outro),
        postCredits: validSegment(data.post_credits)
      }
    }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not reach IntroDB." }, { status: 502 });
  }
}
