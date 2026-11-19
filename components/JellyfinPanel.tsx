"use client";

import { useEffect, useMemo, useState } from "react";\nimport type { FormEvent } from "react";
import { ArrowLeft, Film, LoaderCircle, LogOut, Play, RefreshCw, Server, X } from "lucide-react";
import type { MediaItem } from "@/lib/catalog";

type Props = { onClose: () => void; onPlay: (item: MediaItem) => void };
type Session = { server: string; token: string; userId: string; username: string; deviceId: string };
type JellyItem = { Id: string; Name: string; Overview?: string; ProductionYear?: number; Type?: string; Genres?: string[]; RunTimeTicks?: number; ImageTags?: { Primary?: string }; ParentId?: string };
type ItemResponse = { Items?: JellyItem[]; TotalRecordCount?: number };
const STORAGE_KEY = "nuvio-jellyfin-session";

function authHeader(session: Session) {
  return `MediaBrowser Client="Nuvio Web", Device="Browser", DeviceId="${session.deviceId}", Version="1.0.0", Token="${session.token}"`;
}
function imageUrl(session: Session, id: string) {
  return `${session.server}/Items/${encodeURIComponent(id)}/Images/Primary?maxWidth=420&quality=85&api_key=${encodeURIComponent(session.token)}`;
}
function asMediaItem(row: JellyItem, session: Session): MediaItem {
  return {
    id: `jellyfin-${row.Id}`, title: row.Name, overview: row.Overview || "From your Jellyfin library.",
    year: row.ProductionYear || new Date().getFullYear(),
    type: row.Type === "Series" ? "series" : "movie", genres: row.Genres || [], rating: 0,
    runtime: row.RunTimeTicks ? `${Math.round(row.RunTimeTicks / 600000000)} min` : undefined,
    poster: imageUrl(session, row.Id), backdrop: imageUrl(session, row.Id), source: "Jellyfin",
  };
}

export default function JellyfinPanel({ onClose, onPlay }: Props) {
  const [server, setServer] = useState("http://localhost:8096");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<JellyItem[]>([]);
  const [views, setViews] = useState<{ Id: string; Name: string }[]>([]);
  const [activeView, setActiveView] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Session;
        setSession(parsed); setServer(parsed.server); void loadLibrary(parsed);
      }
    } catch { localStorage.removeItem(STORAGE_KEY); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLibrary(current: Session, parentId?: string) {
    setBusy(true); setError("");
    try {
      const headers = { "X-Emby-Authorization": authHeader(current), "Accept": "application/json" };
      if (!parentId) {
        const response = await fetch(`${current.server}/Users/${encodeURIComponent(current.userId)}/Views`, { headers });
        if (!response.ok) throw new Error(`Jellyfin libraries returned HTTP ${response.status}.`);
        const data = await response.json();
        const nextViews = (data.Items || []).map((v: { Id: string; Name: string }) => ({ Id: v.Id, Name: v.Name }));
        setViews(nextViews);
        parentId = nextViews[0]?.Id;
        setActiveView(parentId || "");
      }
      if (!parentId) { setItems([]); return; }
      const params = new URLSearchParams({ ParentId: parentId, Recursive: "true", IncludeItemTypes: "Movie,Series", Fields: "Overview,Genres,DateCreated,MediaSources", SortBy: "SortName", SortOrder: "Ascending", Limit: "300" });
      const response = await fetch(`${current.server}/Items?${params}`, { headers });
      if (!response.ok) throw new Error(`Could not load library items (HTTP ${response.status}).`);
      const data = await response.json() as ItemResponse;
      setItems(data.Items || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to Jellyfin.");
    } finally { setBusy(false); }
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const normalized = server.trim().replace(/\/+$/, "");
      const parsed = new URL(normalized);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Use an HTTP or HTTPS Jellyfin server URL.");
      const deviceId = crypto.randomUUID();
      const authorization = `MediaBrowser Client="Nuvio Web", Device="Browser", DeviceId="${deviceId}", Version="1.0.0"`;
      const response = await fetch(`${normalized}/Users/AuthenticateByName`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Emby-Authorization": authorization },
        body: JSON.stringify({ Username: username.trim(), Pw: password }),
      });
      if (!response.ok) throw new Error(response.status === 401 ? "Jellyfin rejected that username or password." : `Jellyfin sign-in failed (HTTP ${response.status}).`);
      const data = await response.json();
      const next: Session = { server: normalized, token: data.AccessToken, userId: data.User.Id, username: data.User.Name, deviceId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSession(next); setPassword(""); await loadLibrary(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to connect."); setBusy(false); }
  }

  async function play(row: JellyItem) {
    if (!session) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${session.server}/Items/${encodeURIComponent(row.Id)}/PlaybackInfo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Emby-Authorization": authHeader(session) },
        body: JSON.stringify({ UserId: session.userId, IsPlayback: true, AutoOpenLiveStream: true }),
      });
      if (!response.ok) throw new Error(`Jellyfin could not prepare playback (HTTP ${response.status}).`);
      const data = await response.json();
      const source = data.MediaSources?.[0];
      let url = source?.DirectStreamUrl || source?.TranscodingUrl;
      if (url && url.startsWith("/")) url = session.server + url;
      if (!url) url = `${session.server}/Videos/${encodeURIComponent(row.Id)}/master.m3u8?api_key=${encodeURIComponent(session.token)}`;
      else {
        const parsed = new URL(url, session.server);
        if (!parsed.searchParams.has("api_key")) parsed.searchParams.set("api_key", session.token);
        url = parsed.toString();
      }
      const item = asMediaItem(row, session);
      onPlay({ ...item, streamUrl: url });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Playback preparation failed."); }
    finally { setBusy(false); }
  }

  const filtered = useMemo(() => items.filter(item => item.Name.toLowerCase().includes(search.toLowerCase())), [items, search]);
  function disconnect() {
    localStorage.removeItem(STORAGE_KEY); setSession(null); setItems([]); setViews([]); setActiveView(""); setError("");
  }

  return <div className="modal-backdrop jellyfin-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="jellyfin-panel" role="dialog" aria-modal="true" aria-labelledby="jellyfin-title">
      <header className="jellyfin-heading"><div><div className="section-overline">PERSONAL MEDIA SERVER</div><h2 id="jellyfin-title"><span className="jellyfin-logo"><Server size={17}/></span> Jellyfin</h2></div><div className="jellyfin-heading-actions">{session && <button className="text-button" onClick={disconnect}><LogOut size={14}/> Disconnect</button>}<button className="icon-button" onClick={onClose} aria-label="Close Jellyfin"><X size={18}/></button></div></header>
      {!session ? <form className="jellyfin-connect-form" onSubmit={connect}>
        <p>Connect to your own Jellyfin server to browse and play media from your library.</p>
        <label>Server URL<input required type="url" value={server} onChange={e => setServer(e.target.value)} placeholder="https://jellyfin.example.com"/></label>
        <label>Username<input required value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="Jellyfin username"/></label>
        <label>Password<input required type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Jellyfin password"/></label>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15}/> : <Server size={15}/>} Connect server</button>
        <span className="jellyfin-security-note">Credentials are sent to the server you enter. The session token is stored in this browser. Use HTTPS on untrusted networks.</span>
      </form> : <>
        <div className="jellyfin-server-line"><span className="jellyfin-status-dot"/><span>Connected as <strong>{session.username}</strong></span><span className="jellyfin-server-url">{session.server}</span><button className="icon-button" onClick={() => void loadLibrary(session, activeView || undefined)} aria-label="Refresh library"><RefreshCw size={15}/></button></div>
        <div className="jellyfin-library-tools"><div className="filter-pills">{views.map(view => <button key={view.Id} className={activeView === view.Id ? "category-chip selected" : "category-chip"} onClick={() => { setActiveView(view.Id); void loadLibrary(session, view.Id); }}>{view.Name}</button>)}</div><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your Jellyfin library…"/></div>
        {busy && <div className="jellyfin-loading"><LoaderCircle className="spin" size={18}/> Loading your library…</div>}
        <div className="jellyfin-items">{filtered.map(row => <article className="jellyfin-item" key={row.Id}><img src={imageUrl(session, row.Id)} alt="" loading="lazy"/><div><strong>{row.Name}</strong><span>{row.ProductionYear || "—"} · {row.Type || "Media"}</span><p>{row.Overview || "Available in your Jellyfin library."}</p></div><button className="primary-button" onClick={() => void play(row)} disabled={busy}><Play size={14}/> Play</button></article>)}</div>
        {!busy && filtered.length === 0 && <div className="source-empty">No matching movies or series in this library.</div>}
      </>}
      {error && <div className="notice jellyfin-error">{error}</div>}
      <div className="jellyfin-footnote"><Film size={14}/> Playback uses Jellyfin's authorised API and server capabilities. DRM-protected third-party streams are not decrypted or bypassed.</div>
    </section>
  </div>;
}
