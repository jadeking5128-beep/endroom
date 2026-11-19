import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MANIFEST_URL = "https://btttr.cc/VYxBDoIwEEXv8td4gV7AuHCj7oyLCUwqCbQ4ncYQwt1NCwXcvf_-n5lQk1LnbYB5oiPloKceVcGACuobGrNcaHeECrXvW2dzvWLYMQ1U2DVlsoU0GvwQO5JcFF6eD3hV6FkJZppTGZQFZsqVAUX16Ua8FQ4BRiXy-vxBdhOfSF2r41GFt_-e2QkfxY20dbYYsvwvJKe7j1IzDC5XzPMP/manifest.json";

type Source = { id: string; url: string };
function configuredSources(): Source[] {
  const entries: Source[] = [
    { id: "poster", url: process.env.POSTER_MANIFEST_URL || DEFAULT_MANIFEST_URL },
    ...(process.env.NUVIO_ADDON_MANIFEST_URL ? [{ id: "addon", url: process.env.NUVIO_ADDON_MANIFEST_URL }] : [])
  ];
  return entries.filter((entry, index, all) => {
    try {
      const url = new URL(entry.url);
      return url.protocol === "https:" && url.pathname.toLowerCase().endsWith("/manifest.json") && all.findIndex(other => other.id === entry.id) === index;
    } catch { return false; }
  });
}
function baseUrl(sourceId = "poster") {
  if (sourceId === "cinemeta") return new URL("https://v3-cinemeta.strem.io/");
  const source = configuredSources().find(item => item.id === sourceId);
  if (!source) throw new Error("Unknown or unconfigured catalogue source.");
  const manifest = new URL(source.url);
  manifest.pathname = manifest.pathname.slice(0, -"manifest.json".length);
  manifest.search = "";
  manifest.hash = "";
  return manifest;
}
function segment(value: unknown, label: string, max = 180) {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("/") || value.includes("\\")) throw new Error(`Invalid ${label}.`);
  return encodeURIComponent(value.trim());
}
async function request(sourceId: string, path: string) {
  const base = baseUrl(sourceId);
  const response = await fetch(new URL(path, base), { headers: { Accept: "application/json" }, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(12000) });
  if (new URL(response.url).origin !== base.origin) throw new Error("Catalogue source redirected to an unexpected host.");
  if (!response.ok) throw new Error(`Catalogue source returned HTTP ${response.status}.`);
  const body = await response.text();
  if (body.length > 5_000_000) throw new Error("Catalogue response is too large.");
  try { return JSON.parse(body); } catch { throw new Error("Catalogue source returned invalid JSON. Check that the configured URL points directly to manifest.json."); }
}
function safeHttps(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}
export async function GET() {
  const sources = configuredSources();
  const results = await Promise.allSettled(sources.map(async source => ({ sourceId: source.id, manifest: await request(source.id, "manifest.json") })));
  const manifests = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  if (!manifests.length) {
    const failure = results.find(result => result.status === "rejected");
    return NextResponse.json({ ok: false, error: failure?.status === "rejected" && failure.reason instanceof Error ? failure.reason.message : "No catalogue manifests are configured." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, manifest: manifests[0].manifest, manifests, failedSources: results.filter(result => result.status === "rejected").length }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(requestObject: NextRequest) {
  try {
    const body = await requestObject.json() as Record<string, unknown>;
    const action = body.action;
    if (!["catalog", "meta", "streams", "subtitles"].includes(String(action))) throw new Error("Unsupported add-on request.");
    const sourceId = body.sourceId === undefined ? "poster" : segment(body.sourceId, "source ID", 32);
    const type = segment(body.type, "media type", 12);
    if (body.type !== "movie" && body.type !== "series" && body.type !== "anime") throw new Error("Unsupported catalogue media type.");
    const id = segment(action === "catalog" ? body.catalogId : body.id, action === "catalog" ? "catalogue ID" : "media ID");
    let path = action === "catalog" ? `catalog/${type}/${id}.json`
      : action === "meta" ? `meta/${type}/${id}.json`
      : action === "streams" ? `stream/${type}/${id}.json`
      : `subtitles/${type}/${id}.json`;
    if (action === "catalog" && body.extra && typeof body.extra === "object") {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body.extra as Record<string, unknown>)) {
        if (/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(key) && typeof value === "string" && value.length <= 200) params.set(key, value);
      }
      const query = params.toString(); if (query) path += `?${query}`;
    }
    const data = await request(sourceId, path);
    if (action === "streams") {
      const streams = Array.isArray(data?.streams) ? data.streams.filter((stream: Record<string, unknown>) => safeHttps(stream?.url) && (stream?.behaviorHints as Record<string, unknown> | undefined)?.notWebReady !== true).map((stream: Record<string, unknown>) => ({ name: typeof stream.name === "string" ? stream.name : undefined, title: typeof stream.title === "string" ? stream.title : undefined, description: typeof stream.description === "string" ? stream.description : undefined, url: safeHttps(stream.url), subtitles: Array.isArray(stream.subtitles) ? stream.subtitles.flatMap((track: Record<string, unknown>) => { const url = safeHttps(track?.url); return url ? [{ url, lang: typeof track.lang === "string" ? track.lang : "und", label: typeof track.label === "string" ? track.label : "Subtitle" }] : []; }) : [] })) : [];
      return NextResponse.json({ ok: true, data: { streams } }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "subtitles") {
      const subtitles = Array.isArray(data?.subtitles) ? data.subtitles.flatMap((track: Record<string, unknown>) => { const url = safeHttps(track?.url); return url ? [{ url, lang: typeof track.lang === "string" ? track.lang : typeof track.language === "string" ? track.language : "und", label: typeof track.label === "string" ? track.label : "Subtitle" }] : []; }) : [];
      return NextResponse.json({ ok: true, data: { subtitles } }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Add-on request failed." }, { status: 400 });
  }
}
