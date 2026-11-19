import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "manifest" | "catalog" | "meta" | "stream";
const allowedTypes = new Set(["movie", "series"]);

function addonBase() {
  const raw = process.env.NUVIO_ADDON_MANIFEST_URL;
  if (!raw) throw new Error("NUVIO_ADDON_MANIFEST_URL is not configured in Vercel.");
  const manifest = new URL(raw);
  if (manifest.protocol !== "https:") throw new Error("The add-on manifest must use HTTPS.");
  if (!manifest.pathname.endsWith("/manifest.json")) throw new Error("The add-on URL must point to a /manifest.json endpoint.");
  manifest.pathname = manifest.pathname.slice(0, -"manifest.json".length);
  manifest.search = "";
  manifest.hash = "";
  return manifest;
}

function safeSegment(value: unknown, label: string, max = 180): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("/") || value.includes("\\\\")) {
    throw new Error(`Invalid ${label}.`);
  }
  return encodeURIComponent(value.trim());
}

async function requestAddon(path: string) {
  const url = new URL(path, addonBase());
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Add-on returned HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error("Add-on response is too large.");
  try { return JSON.parse(text); } catch { throw new Error("Add-on returned invalid JSON."); }
}

export async function GET() {
  try {
    const manifest = await requestAddon("manifest.json");
    return NextResponse.json({ ok: true, manifest }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load add-on." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action as Action;
    const type = safeSegment(body.type, "media type", 12);
    if (!allowedTypes.has(String(body.type))) throw new Error("Only movie and series catalogues are supported.");
    let path = "";
    if (action === "catalog") {
      const catalogId = safeSegment(body.catalogId, "catalogue ID");
      path = `catalog/${type}/${catalogId}.json`;
      if (body.extra && typeof body.extra === "object") {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(body.extra as Record<string, unknown>)) {
          if (typeof value === "string" && value.length <= 200) params.set(key, value);
        }
        const query = params.toString();
        if (query) path += `?${query}`;
      }
    } else if (action === "meta") {
      const id = safeSegment(body.id, "media ID");
      path = `meta/${type}/${id}.json`;
    } else if (action === "stream") {
      const id = safeSegment(body.id, "media ID");
      path = `stream/${type}/${id}.json`;
    } else {
      throw new Error("Unsupported add-on action.");
    }
    const data = await requestAddon(path);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Add-on request failed." }, { status: 502 });
  }
}
