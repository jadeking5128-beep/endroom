"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Captions, Play, RotateCcw, SkipForward, X } from "lucide-react";
import type { MediaItem } from "@/lib/catalog";

type Props = { item: MediaItem; onClose: () => void };
type ShakaPlayer = { load: (uri: string) => Promise<void>; destroy: () => Promise<void>; configure: (config: unknown) => void };
type SkipSegment = { type: "intro" | "recap" | "outro" | "postCredits"; start: number; end: number; confidence: number };
type SubtitleTrack = { src: string; lang: string; label: string };
const isAdaptive = (url: string) => /\.(m3u8|mpd)(?:$|[?#])/i.test(url);

export default function MediaPlayer({ item, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<ShakaPlayer | null>(null);
  const lastSavedRef = useRef(0);
  const [error, setError] = useState("");
  const [resumeAt, setResumeAt] = useState(0);
  const [engine, setEngine] = useState("Browser player");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [position, setPosition] = useState(0);
  const [segments, setSegments] = useState<SkipSegment[]>([]);
  const [segmentNotice, setSegmentNotice] = useState("");
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>(item.subtitles || []);
  const [subtitleBusy, setSubtitleBusy] = useState(false);
  const [subtitleError, setSubtitleError] = useState("");
  const [subtitleMenu, setSubtitleMenu] = useState(false);
  const [selectedSubtitle, setSelectedSubtitle] = useState(0);
  const progressKey = `nuvio-progress:${item.id}`;
  const streamUrl = item.streamUrl || "";
  const imdbId = item.imdbId || item.metaId || "";
  const activeSegment = useMemo(() => segments.find(segment => position >= segment.start && position < segment.end && segment.confidence >= 0.5), [segments, position]);

  const syncProgress = useCallback((action: "start" | "pause" | "stop") => {
    const video = videoRef.current;
    if (!video) return;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const progress = action === "stop" && video.ended ? 100 : duration ? Math.max(0, Math.min(100, video.currentTime / duration * 100)) : 0;
    const resolvedImdb = item.imdbId || (/^tt[0-9]{7,8}$/.test(item.metaId || "") ? item.metaId : "");
    void fetch("/api/sync/scrobble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, type: item.type === "movie" ? "movie" : "series", title: item.title, year: item.year, imdbId: resolvedImdb, season: item.season, episode: item.episode, progress })
    }).catch(() => undefined);
  }, [item.id, item.imdbId, item.metaId, item.type, item.title, item.year, item.season, item.episode]);

  const saveProgress = useCallback((force = false) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.currentTime) || video.currentTime <= 0) return;
    const now = Date.now();
    if (!force && now - lastSavedRef.current < 10000) return;
    try {
      localStorage.setItem(progressKey, JSON.stringify({ time: Math.floor(video.currentTime), duration: Number.isFinite(video.duration) ? Math.floor(video.duration) : 0, updatedAt: now }));
      lastSavedRef.current = now;
    } catch { /* Storage may be disabled or full. */ }
  }, [progressKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(progressKey);
      const parsed = raw ? JSON.parse(raw) as { time?: number } : null;
      const saved = typeof parsed?.time === "number" ? parsed.time : Number(raw || 0);
      if (Number.isFinite(saved) && saved > 10) setResumeAt(saved);
    } catch { setResumeAt(0); }
  }, [progressKey]);

  useEffect(() => {
    if (!/^tt[0-9]{7,8}$/.test(imdbId)) { setSegments([]); return; }
    if (item.type !== "movie" && (!item.season || !item.episode)) { setSegments([]); return; }
    const params = new URLSearchParams({ imdb_id: imdbId, is_movie: String(item.type === "movie") });
    if (item.type !== "movie") { params.set("season", String(item.season)); params.set("episode", String(item.episode)); }
    let cancelled = false;
    fetch(`/api/introdb?${params.toString()}`, { cache: "no-store" })
      .then(response => response.json())
      .then(payload => {
        if (cancelled || !payload?.ok || !payload.data) return;
        const next: SkipSegment[] = (["intro", "recap", "outro", "postCredits"] as const).flatMap(type => {
          const value = payload.data[type];
          return value && Number.isFinite(value.start) && Number.isFinite(value.end) && value.end > value.start
            ? [{ type, start: value.start, end: value.end, confidence: Number(value.confidence) || 0 }] : [];
        });
        setSegments(next);
      })
      .catch(() => { if (!cancelled) setSegments([]); });
    return () => { cancelled = true; };
  }, [imdbId, item.type, item.season, item.episode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    let cancelled = false;
    let activePlayer: ShakaPlayer | null = null;
    const setup = async () => {
      setLoading(true);
      setError("");
      try {
        if (isAdaptive(streamUrl) || item.drm) {
          const shakaModule = await import("shaka-player");
          const shaka = shakaModule.default;
          if (!shaka.Player.isBrowserSupported()) throw new Error("This browser does not support the media features required by this stream.");
          const player = new shaka.Player(video) as unknown as ShakaPlayer;
          activePlayer = player;
          playerRef.current = player;
          if (item.drm) player.configure({ drm: { servers: { [item.drm.keySystem]: item.drm.licenseServer } } });
          await player.load(streamUrl);
          if (cancelled) { await player.destroy(); return; }
          setEngine(item.drm ? "Shaka · licensed DRM" : "Shaka · HLS / DASH");
        } else {
          video.src = streamUrl;
          video.load();
          setEngine("Browser native");
        }
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : "Unknown playback error.";
          setError(`Unable to initialise playback. ${message}`);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(false);
    };
    void setup();
    return () => {
      cancelled = true;
      if (activePlayer) void activePlayer.destroy().catch(() => undefined);
      if (playerRef.current === activePlayer) playerRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [streamUrl, item.drm, retry]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    Array.from(video.textTracks).forEach((track, index) => { track.mode = selectedSubtitle === index + 1 ? "showing" : "disabled"; });
  }, [selectedSubtitle, subtitleTracks]);

  const findSubtitles = async () => {
    if (!item.metaId || !item.sourceId) {
      setSubtitleError("This title does not expose a subtitle-search ID from its catalogue.");
      return;
    }
    setSubtitleBusy(true);
    setSubtitleError("");
    try {
      const response = await fetch("/api/addon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subtitles", sourceId: item.sourceId, type: item.type === "anime" ? "series" : item.type, id: item.metaId }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Subtitle search failed.");
      const incoming: SubtitleTrack[] = Array.isArray(payload.data?.subtitles) ? payload.data.subtitles.flatMap((value: unknown) => { if (!value || typeof value !== "object") return []; const track = value as { url?: unknown; lang?: unknown; label?: unknown }; if (typeof track.url !== "string" || !/^https:\/\//.test(track.url)) return []; return [{ src: track.url, lang: typeof track.lang === "string" ? track.lang : "und", label: typeof track.label === "string" ? track.label : "Subtitle" }]; }) : [];
      setSubtitleTracks(current => Array.from(new Map([...current, ...incoming].map(track => [track.src, track])).values()));
      if (!incoming.length) setSubtitleError("No additional subtitles were returned by this catalogue.");
      else setSubtitleMenu(true);
    } catch (cause) {
      setSubtitleError(cause instanceof Error ? cause.message : "Subtitle search failed.");
    } finally { setSubtitleBusy(false); }
  };

  const resume = () => {
    const video = videoRef.current;
    if (video) { video.currentTime = resumeAt; void video.play().catch(() => setError("Playback was blocked. Press play in the player to continue.")); }
    setResumeAt(0);
  };
  const startOver = () => {
    try { localStorage.removeItem(progressKey); } catch { /* Ignore unavailable storage. */ }
    if (videoRef.current) videoRef.current.currentTime = 0;
    setResumeAt(0);
  };
  const skipSegment = () => {
    const video = videoRef.current;
    if (!video || !activeSegment) return;
    video.currentTime = activeSegment.end + 0.15;
    setPosition(activeSegment.end + 0.15);
    setSegmentNotice(`Skipped ${activeSegment.type === "postCredits" ? "post-credits" : activeSegment.type}.`);
    window.setTimeout(() => setSegmentNotice(""), 2200);
  };
  const close = () => { saveProgress(true); onClose(); };
  const segmentName = activeSegment?.type === "postCredits" ? "Post-credits" : activeSegment ? activeSegment.type[0].toUpperCase() + activeSegment.type.slice(1) : "";

  return <div className="player-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="player-panel" role="dialog" aria-modal="true" aria-label={`Player: ${item.title}`}>
      <header className="player-header">
        <div><span className="player-kicker">NOW PLAYING · {engine.toUpperCase()}</span><strong>{item.title}</strong></div>
        <button className="icon-button" onClick={close} aria-label="Close player"><X size={18}/></button>
      </header>
      <div className="video-stage">
        <video ref={videoRef} controls playsInline preload="metadata"
          onPlay={() => syncProgress("start")}
          onPause={() => { if (!videoRef.current?.ended) syncProgress("pause"); }}
          onTimeUpdate={() => { setPosition(videoRef.current?.currentTime || 0); saveProgress(); }}
          onLoadedMetadata={() => setLoading(false)}
          onEnded={() => { syncProgress("stop"); try { localStorage.removeItem(progressKey); } catch { /* Ignore unavailable storage. */ } }}
          onError={() => { if (!error) setError("The media server rejected playback. Check that the URL is a direct media manifest/file and permits browser CORS access."); }}>
          {subtitleTracks.map((track, index) => <track key={`${track.src}-${index}`} kind="subtitles" src={track.src} srcLang={track.lang} label={track.label} onLoad={() => { if (selectedSubtitle === index + 1 && videoRef.current?.textTracks[index]) videoRef.current.textTracks[index].mode = "showing"; }} />)}
        </video>
        {loading && <div className="player-loading">Preparing stream…</div>}
        {activeSegment && <button className="player-skip" onClick={skipSegment}><SkipForward size={16}/><span>Skip {segmentName}<small> {Math.round(activeSegment.end - position)}s</small></span></button>}
        {segmentNotice && <div className="player-loading">{segmentNotice}</div>}
        {error && <div className="player-error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { setError(""); setRetry(value => value + 1); }}><RotateCcw size={13}/> Retry</button></div>}
      </div>
      <div className="player-footer">
        <span><Captions size={15}/> {subtitleTracks.length ? `${subtitleTracks.length} subtitle track(s)` : "No subtitle tracks loaded"}</span>
        <button className="text-button" onClick={() => void findSubtitles()} disabled={subtitleBusy}>{subtitleBusy ? "Searching…" : "Find subtitles"}</button>
        <button className="text-button" onClick={() => setSubtitleMenu(value => !value)} disabled={!subtitleTracks.length}>Tracks</button>
        <span className="player-engine-status">{segments.length ? `IntroDB · ${segments.length} segment(s)` : "Progress saved on this device"}</span>
      </div>
      {subtitleError && <div className="player-error" role="status">{subtitleError}</div>}
      {subtitleMenu && <div className="resume-prompt"><button className="text-button" onClick={() => setSelectedSubtitle(0)}>Off</button>{subtitleTracks.map((track,index)=><button key={track.src} className="text-button" onClick={() => { setSelectedSubtitle(index+1); setSubtitleMenu(false); }}>{track.label} · {track.lang}</button>)}</div>}
      {resumeAt > 10 && <div className="resume-prompt"><span>Resume from {Math.floor(resumeAt / 60)}:{String(Math.floor(resumeAt % 60)).padStart(2,"0")}?</span><button className="primary-button" onClick={resume}><Play size={14}/> Resume</button><button className="text-button" onClick={startOver}>Start over</button></div>}
    </section>
  </div>;
}
