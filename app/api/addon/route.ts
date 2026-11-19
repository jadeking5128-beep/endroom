import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MANIFEST_URL = "https://btttr.cc/TYxBDoMwDAT_4nP6gXyg96q3qgcLrBQpxNR2VCHE36sEAtzGs-tdoEPDyEHBvyCikdptBNdQwYFxj3OVG50OwUHH45BCjXfUE0vBhFLfKsdRShNPOaLUoPE2PsHbwUiG4Je1hGok4JcaecBsXH6Eg5AqeJNM-_gTwyG-GeNg81Xph393SkJX8UAbUmgGA13Fuv4B/manifest.json";
const MANIFEST_URL = process.env.POSTER_MANIFEST_URL || DEFAULT_MANIFEST_URL;

function baseUrl() {
  const manifest = new URL(MANIFEST_URL);
  if (manifest.protocol !== "https:" || !manifest.pathname.endsWith("/manifest.json")) throw new Error("Invalid catalogue manifest configuration.");
  manifest.pathname = manifest.pathname.slice(0, -"manifest.json".length);
  manifest.search = "";
  manifest.hash = "";
  return manifest;
}
function segment(value: unknown, label: string, max = 180) {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("/") || value.includes("\\")) throw new Error(`Invalid ${label}.`);
  return encodeURIComponent(value.trim());
}
async function request(path: string) {
  const response = await fetch(new URL(path, baseUrl()), { headers: { Accept: "application/json" }, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(12000) });
  if (new URL(response.url).origin !== baseUrl().origin) throw new Error("Catalogue source redirected to an unexpected host.");\n  if (!response.ok) throw new Error(`Catalogue source returned HTTP ${response.status}.`);
  const body = await response.text();
  if (body.length > 5_000_000) throw new Error("Catalogue response is too large.");
  try { return JSON.parse(body); } catch { throw new Error("Catalogue source returned invalid JSON. Check that the configured URL points directly to manifest.json."); }
}
export async function GET() {
  try { return NextResponse.json({ ok: true, manifest: await request("manifest.json") }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load catalogue manifest." }, { status: 502 }); }
}
export async function POST(requestObject: NextRequest) {
  try {
    const body = await requestObject.json() as Record<string, unknown>;
    if (body.action !== "catalog" && body.action !== "meta") throw new Error("Only catalogue metadata requests are supported.");
    const type = segment(body.type, "media type", 12);
    if (body.type !== "movie" && body.type !== "series") throw new Error("Only movie and series catalogues are supported.");
    const id = segment(body.action === "catalog" ? body.catalogId : body.id, body.action === "catalog" ? "catalogue ID" : "media ID");
    let path = body.action === "catalog" ? `catalog/${type}/${id}.json` : `meta/${type}/${id}.json`;
    if (body.action === "catalog" && body.extra && typeof body.extra === "object") {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body.extra as Record<string, unknown>)) if (typeof value === "string" && value.length <= 200) params.set(key, value);
      const query = params.toString(); if (query) path += `?${query}`;
    }
    return NextResponse.json({ ok: true, data: await request(path) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Catalogue request failed." }, { status: 400 }); }
}
