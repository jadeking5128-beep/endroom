"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, LoaderCircle, Play, RefreshCw, Search, X } from "lucide-react";
import type { MediaItem } from "@/lib/catalog";

type Manifest = {
  id: string; name: string; description?: string; version?: string;
  catalogs?: { type: string; id: string; name: string; extra?: { name: string; options?: string[] }[] }[];
  types?: string[];
  resources?: (string | { name: string })[];
};
type Meta = { id: string; type?: string; name?: string; poster?: string; background?: string; description?: string; releaseInfo?: string; year?: number; genres?: string[]; imdbRating?: string; runtime?: string };
type Stream = { name?: string; title?: string; url?: string; description?: string; subtitles?: { url: string; lang?: string; label?: string }[]; behaviorHints?: { notWebReady?: boolean } };
type Props = { onClose: () => void; onPlay: (item: MediaItem) => void };
type CatalogRow = { id: string; type: "movie" | "series"; name: string; poster?: string; description?: string; year: number; genres: string[]; rating: number };

async function api(body?: Record<string, unknown>) {
  const response = await fetch("/api/addon", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Add-on request failed.");
  return body ? data.data : data.manifest;
}
function mediaType(value: string): "movie" | "series" { return value === "series" ? "series" : "movie"; }
function posterUrl(value?: string) { if (!value) return ""; try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; } }

export default function AddonPanel({ onClose, onPlay }: Props) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [catalogId, setCatalogId] = useState("");
  const [type, setType] = useState<"movie" | "series">("movie");
  const [items, setItems] = useState<CatalogRow[]>([]);
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const catalogs = useMemo(() => (manifest?.catalogs || []).filter(c => ["movie", "series"].includes(c.type)), [manifest]);
  const availableTypes = useMemo(() => Array.from(new Set(catalogs.map(c => mediaType(c.type)))), [catalogs]);

  async function loadManifest() {
    setBusy(true); setError("");
    try {
      const data = await api() as Manifest;
      setManifest(data);
      const first = data.catalogs?.find(c => ["movie", "series"].includes(c.type));
      if (first) { setCatalogId(first.id); setType(mediaType(first.type)); }
      else setError("The add-on manifest has no movie or series catalogues.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect to the configured add-on."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void loadManifest(); }, []);

  async function loadCatalog(nextId = catalogId, nextType = type, searchTerm = "") {
    if (!nextId) return;
    setBusy(true); setError(""); setSelected(null); setStreams([]);
    try {
      const result = await api({ action: "catalog", type: nextType, catalogId: nextId, extra: searchTerm ? { search: searchTerm } : {} });
      const metas = Array.isArray(result.metas) ? result.metas as Meta[] : [];
      setItems(metas.map(meta => ({
        id: meta.id, type: nextType, name: meta.name || meta.id, poster: posterUrl(meta.poster),
        description: meta.description || "", year: Number(meta.year || meta.releaseInfo?.slice(0,4)) || 0,
        genres: Array.isArray(meta.genres) ? meta.genres : [], rating: Number(meta.imdbRating) || 0,
      })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load catalogue."); }
    finally { setBusy(false); }
  }
  async function chooseItem(row: CatalogRow) {
    setSelected(row); setStreams([]); setBusy(true); setError("");
    try {
      const result = await api({ action: "stream", type: row.type, id: row.id });
      setStreams(Array.isArray(result.streams) ? result.streams as Stream[] : []);
      if (!Array.isArray(result.streams) || result.streams.length === 0) setError("This add-on returned no playable streams for this title.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not retrieve streams."); }
    finally { setBusy(false); }
  }
  function playStream(row: CatalogRow, stream: Stream) {
    const url = posterUrl(stream.url);
    if (!url || stream.behaviorHints?.notWebReady) { setError("This stream is not a direct HTTPS browser-playable source."); return; }
    const subtitles = (stream.subtitles || []).flatMap((track, index) => {
      const src = posterUrl(track.url);
      return src ? [{ src, lang: track.lang || "en", label: track.label || `Subtitle ${index + 1}` }] : [];
    });
    onPlay({
      id: `addon-${row.type}-${row.id}`, title: row.name, overview: row.description || "Provided by your configured add-on.",
      year: row.year || new Date().getFullYear(), type: row.type, genres: row.genres, rating: row.rating,
      poster: "photo-1489599849927-2ee91cede3ba", backdrop: "photo-1489599849927-2ee91cede3ba",
      source: manifest?.name || "Configured add-on", streamUrl: url, ...(subtitles.length ? { subtitles } : {}),
    });
  }
  const activeCatalogs = catalogs.filter(c => c.type === type);
  const currentCatalog = activeCatalogs.find(c => c.id === catalogId) || activeCatalogs[0];

  return <div className="modal-backdrop addon-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="addon-panel" role="dialog" aria-modal="true" aria-labelledby="addon-title">
      <header className="addon-heading"><div><div className="section-overline">NUVIO LOCAL PLAYBACK</div><h2 id="addon-title">{manifest?.name || "Add-on library"}</h2><p>{manifest?.description || "Connects through your server-side configured add-on manifest."}</p></div><button className="icon-button" onClick={onClose} aria-label="Close add-on"><X size={18}/></button></header>
      {manifest && <div className="addon-toolbar">
        <div className="filter-pills">{availableTypes.map(v => <button key={v} className={type === v ? "category-chip selected" : "category-chip"} onClick={() => { const first = catalogs.find(c => c.type === v); setType(v); if (first) { setCatalogId(first.id); void loadCatalog(first.id, v); } }}>{v === "movie" ? "Movies" : "Series"}</button>)}</div>
        <select aria-label="Add-on catalogue" value={currentCatalog?.id || ""} onChange={e => { setCatalogId(e.target.value); void loadCatalog(e.target.value); }}>{activeCatalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <form className="addon-search" onSubmit={e => { e.preventDefault(); void loadCatalog(catalogId, type, search.trim()); }}><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search add-on catalogue"/><button type="submit">Search</button></form>
        <button className="icon-button" onClick={() => void loadCatalog()} aria-label="Refresh catalogue"><RefreshCw size={15}/></button>
      </div>}
      {selected ? <div className="addon-stream-view"><button className="text-button" onClick={() => { setSelected(null); setStreams([]); }}><ArrowLeft size={14}/> Back to catalogue</button><div className="addon-selected"><strong>{selected.name}</strong><span>{selected.year || "—"} · {selected.type}</span><p>{selected.description}</p></div><div className="addon-stream-list">{streams.map((stream, index) => <div className="addon-stream" key={stream.url || index}><div><strong>{stream.name || stream.title || `Source ${index + 1}`}</strong><span>{stream.description || "Direct stream"}</span></div><button className="primary-button" onClick={() => playStream(selected, stream)}><Play size={14}/> Play</button></div>)}</div></div> : <div className="addon-catalog-grid">{items.map(row => <button className="addon-card" key={row.id} onClick={() => void chooseItem(row)}><span>{row.poster ? <img src={row.poster} alt="" loading="lazy"/> : <span className="addon-poster-fallback">N</span>}</span><strong>{row.name}</strong><small>{row.year || row.type}</small></button>)}{!busy && items.length === 0 && manifest && <div className="addon-empty">Choose a catalogue or refresh to load titles.</div>}</div>}
      {busy && <div className="addon-loading"><LoaderCircle className="spin" size={17}/> Contacting your add-on…</div>}
      {error && <div className="notice addon-error">{error}</div>}
      <footer className="addon-footnote">Manifest URL and add-on credentials stay on the server. Only returned HTTPS stream URLs are sent to the local player. Add-ons must permit your site's origin and provide authorised playback.</footer>
    </section>
  </div>;
}
