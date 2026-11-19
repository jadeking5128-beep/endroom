"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Captions, Play, RotateCcw, SkipForward, X } from "lucide-react";
import type { MediaItem } from "@/lib/catalog";

type Props = { item: MediaItem; onClose: () => void };
type ShakaPlayer = { load: (uri: string) => Promise<void>; destroy: () => Promise<void>; configure: (config: unknown) => void };
type SkipSegment = { type: "intro" | "recap" | "outro" | "postCredits"; start: number; end: number; confidence: number };
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
  const progressKey = `nuvio-progress:${item.id}`;
  const streamUrl = item.streamUrl || "";
  const imdbId = item.imdbId || item.metaId || "";
  const activeSegment = useMemo(() => segments.find(segment => position >= segment.start && position < segment.end && segment.confidence >= 0.5), [segments, position]);

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

  const resume = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = resumeAt;
      void video.play().catch(() => setError("Playback was blocked. Press play in the player to continue."));
    }
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
          onTimeUpdate={() => { setPosition(videoRef.current?.currentTime || 0); saveProgress(); }}
          onLoadedMetadata={() => setLoading(false)}
          onEnded={() => { try { localStorage.removeItem(progressKey); } catch { /* Ignore unavailable storage. */ } }}
          onError={() => { if (!error) setError("The media server rejected playback. Check that the URL is a direct media manifest/file and permits browser CORS access."); }}>
          {item.subtitles?.map((track, index) => <track key={`${track.src}-${index}`} kind="subtitles" src={track.src} srcLang={track.lang} label={track.label} default={index === 0}/>)}
        </video>
        {loading && <div className="player-loading">Preparing stream…</div>}
        {activeSegment && <button className="player-skip" onClick={skipSegment}><SkipForward size={16}/><span>Skip {segmentName}<small> {Math.round(activeSegment.end - position)}s</small></span></button>}
        {segmentNotice && <div className="player-loading">{segmentNotice}</div>}
        {error && <div className="player-error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { setError(""); setRetry(value => value + 1); }}><RotateCcw size={13}/> Retry</button></div>}
      </div>
      <div className="player-footer"><span><Captions size={15}/> {item.subtitles?.length ? `${item.subtitles.length} subtitle track(s)` : "No external subtitles supplied"}</span><span className="player-engine-status">{segments.length ? `IntroDB · ${segments.length} segment(s)` : "Progress saved on this device"}</span></div>
      {resumeAt > 10 && <div className="resume-prompt"><span>Resume from {Math.floor(resumeAt / 60)}:{String(Math.floor(resumeAt % 60)).padStart(2,"0")}?</span><button className="primary-button" onClick={resume}><Play size={14}/> Resume</button><button className="text-button" onClick={startOver}>Start over</button></div>}
    </section>
  </div>;
}
