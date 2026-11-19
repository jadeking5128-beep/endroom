import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Meta = { id: string; name?: string; description?: string; year?: number; releaseInfo?: string; genres?: string[]; imdbRating?: string; poster?: string; background?: string };

async function searchType(type: "movie" | "series", query: string): Promise<Meta[]> {
  const url = new URL(`catalog/${type}/top/search=${encodeURIComponent(query)}.json`, "https://v3-cinemeta.strem.io/");
  const response = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Metadata search returned HTTP ${response.status}.`);
  const data = await response.json();
  return Array.isArray(data?.metas) ? data.metas.filter((meta: Meta) => meta && typeof meta.id === "string" && /^tt[0-9]{7,8}$/.test(meta.id)) : [];
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (query.length < 2) return NextResponse.json({ ok: true, results: [] }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  const results = await Promise.allSettled([{ type: "movie" as const, promise: searchType("movie", query) }, { type: "series" as const, promise: searchType("series", query) }].map(async entry => ({ type: entry.type, metas: await entry.promise })));
  const mapped = results.flatMap(result => result.status === "fulfilled" ? result.value.metas.map(meta => ({
    id: `cinemeta-${result.value.type}-${meta.id}`,
    metaId: meta.id,
    imdbId: meta.id,
    title: meta.name || meta.id,
    overview: meta.description || "",
    year: Number(meta.year || meta.releaseInfo?.slice(0, 4)) || 0,
    type: result.value.type,
    genres: Array.isArray(meta.genres) ? meta.genres.filter((genre): genre is string => typeof genre === "string") : [],
    rating: Number(meta.imdbRating) || 0,
    poster: meta.poster || "",
    backdrop: meta.background || meta.poster || "",
    source: "Cinemeta metadata",
    sourceId: "cinemeta"
  })) : []);
  return NextResponse.json({ ok: true, results: mapped }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
