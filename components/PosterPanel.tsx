"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, Search, X, ArrowLeft } from "lucide-react";

type Manifest = {
  name?: string;
  description?: string;
  catalogs?: { type: string; id: string; name: string }[];
};
type Meta = {
  id: string; name?: string; poster?: string; background?: string; description?: string;
  releaseInfo?: string; year?: number; genres?: string[]; imdbRating?: string;
};
type Poster = { id: string; name: string; poster: string; year: string; description: string; genres: string[] };

async function request(body?: Record<string, unknown>) {
  const response = await fetch("/api/addon?source=posters", body ? {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, source: "posters" }),
  } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Poster source request failed.");
  return body ? result.data : result.manifest;
}

function safePoster(value?: string) {
  if (!value) return "";
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : ""; }
  catch { return ""; }
}

export default function PosterPanel({ onClose }: { onClose: () => void }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [catalogId, setCatalogId] = useState("");
  const [type, setType] = useState<"movie" | "series">("movie");
  const [items, setItems] = useState<Poster[]>([]);
  const [selected, setSelected] = useState<Poster | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const catalogs = useMemo(() => (manifest?.catalogs || []).filter(c => ["movie", "series"].includes(c.type)), [manifest]);
  const activeCatalogs = catalogs.filter(c => c.type === type);

  async function loadCatalog(id: string, mediaType: "movie" | "series", term = "") {
    setCatalogId(id); setType(mediaType); setBusy(true); setError(""); setSelected(null);
    try {
      const data = await request({ action: "catalog", type: mediaType, catalogId: id, extra: term ? { search: term } : {} });
      const metas = Array.isArray(data.metas) ? data.metas as Meta[] : [];
      setItems(metas.map(meta => ({
        id: meta.id, name: meta.name || meta.id, poster: safePoster(meta.poster),
        year: String(meta.year || meta.releaseInfo || ""), description: meta.description || "",
        genres: Array.isArray(meta.genres) ? meta.genres : [],
      })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load posters."); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setBusy(true); setError("");
      try {
        const data = await request() as Manifest;
        if (cancelled) return;
        setManifest(data);
        const first = data.catalogs?.find(c => ["movie", "series"].includes(c.type));
        if (first) await loadCatalog(first.id, first.type === "series" ? "series" : "movie");
        else setError("The manifest has no movie or series catalogues.");
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not connect to BetterPosters."); }
      finally { if (!cancelled) setBusy(false); }
    }
    void start();
    return () => { cancelled = true; };
  }, []);

  return <div className="modal-backdrop addon-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="addon-panel" role="dialog" aria-modal="true" aria-labelledby="poster-source-title">
      <header className="addon-heading"><div><div className="section-overline">POSTER & METADATA SOURCE</div><h2 id="poster-source-title">{manifest?.name || "Poster library"}</h2><p>{manifest?.description || "Browse artwork and catalogue metadata."}</p></div><button className="icon-button" onClick={onClose} aria-label="Close poster library"><X size={18}/></button></header>
      {manifest && <div className="addon-toolbar">
        <div className="filter-pills">{(["movie", "series"] as const).filter(t => catalogs.some(c => c.type === t)).map(t => <button key={t} className={type === t ? "category-chip selected" : "category-chip"} onClick={() => { const first = catalogs.find(c => c.type === t); if (first) void loadCatalog(first.id, t); }}>{t === "movie" ? "Movies" : "Series"}</button>)}</div>
        <select aria-label="Poster catalogue" value={catalogId} onChange={e => void loadCatalog(e.target.value, type)}>{activeCatalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <form className="addon-search" onSubmit={e => { e.preventDefault(); if (catalogId) void loadCatalog(catalogId, type, search.trim()); }}><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posters"/><button type="submit">Search</button></form>
        <button className="icon-button" onClick={() => catalogId && void loadCatalog(catalogId, type)} aria-label="Refresh posters"><RefreshCw size={15}/></button>
      </div>}
      {selected ? <div className="addon-stream-view"><button className="text-button" onClick={() => setSelected(null)}><ArrowLeft size={14}/> Back to posters</button><div className="addon-selected"><strong>{selected.name}</strong><span>{selected.year || "—"}</span><p>{selected.description}</p><small>{selected.genres.join(" · ")}</small></div><p className="addon-poster-note">Poster artwork and metadata only. No playback is provided by this source.</p></div> : <div className="addon-catalog-grid">{items.map(item => <button className="addon-card" key={item.id} onClick={() => setSelected(item)}><span>{item.poster ? <img src={item.poster} alt="" loading="lazy"/> : <span className="addon-poster-fallback">N</span>}</span><strong>{item.name}</strong><small>{item.year || "Title"}</small></button>)}{!busy && items.length === 0 && manifest && <div className="addon-empty">No poster entries returned for this catalogue.</div>}</div>}
      {busy && <div className="addon-loading"><LoaderCircle className="spin" size={17}/> Loading poster catalogue…</div>}
      {error && <div className="notice addon-error">{error}</div>}
      <footer className="addon-footnote">BetterPosters is used only for poster artwork and catalogue metadata. Playback is handled separately.</footer>
    </section>
  </div>;
}
