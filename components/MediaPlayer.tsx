"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, Play, RotateCcw, X } from "lucide-react";
import type { MediaItem } from "@/lib/catalog";

type Props = { item: MediaItem; onClose: () => void };
type ShakaPlayer = { load: (uri: string) => Promise<void>; destroy: () => Promise<void>; configure: (config: unknown) => void };

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
  const progressKey = `nuvio-progress:${item.id}`;
  const streamUrl = item.streamUrl || "";

  const saveProgress = useCallback((force = false) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.currentTime) || video.currentTime <= 0) return;
    const now = Date.now();
    if (!force && now - lastSavedRef.current < 10000) return;
    try {
      localStorage.setItem(progressKey, JSON.stringify({ time: Math.floor(video.currentTime), duration: Number.isFinite(video.duration) ? Math.floor(video.duration) : 0, updatedAt: now }));
      lastSavedRef.current = now;
    } catch { /* Storage may be disabled or full. Playback should continue. */ }
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
          setEngine(item.drm ? "Shaka · licensed DRM" : "Shaka · adaptive streaming");
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

  const close = () => { saveProgress(true); onClose(); };

  return <div className="player-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="player-panel" role="dialog" aria-modal="true" aria-label={`Player: ${item.title}`}>
      <header className="player-header">
        <div><span className="player-kicker">NOW PLAYING · {engine.toUpperCase()}</span><strong>{item.title}</strong></div>
        <button className="icon-button" onClick={close} aria-label="Close player"><X size={18}/></button>
      </header>
      <div className="video-stage">
        <video ref={videoRef} controls playsInline preload="metadata"
          onTimeUpdate={() => saveProgress()} onLoadedMetadata={() => setLoading(false)}
          onEnded={() => { try { localStorage.removeItem(progressKey); } catch { /* Ignore unavailable storage. */ } }}
          onError={() => { if (!error) setError("The media server rejected playback. Check that the URL is a direct media manifest/file and permits browser CORS access."); } }>
          {item.subtitles?.map((track, index) => <track key={`${track.src}-${index}`} kind="subtitles" src={track.src} srcLang={track.lang} label={track.label} default={index === 0}/>)}
        </video>
        {loading && <div className="player-loading">Preparing stream…</div>}
        {error && <div className="player-error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { setError(""); setRetry(value => value + 1); }}><RotateCcw size={13}/> Retry</button></div>}
      </div>
      <div className="player-footer"><span><Captions size={15}/> {item.subtitles?.length ? `${item.subtitles.length} subtitle track(s)` : "No external subtitles supplied"}</span><span>Progress saved on this device</span></div>
      {resumeAt > 10 && <div className="resume-prompt"><span>Resume from {Math.floor(resumeAt / 60)}:{String(Math.floor(resumeAt % 60)).padStart(2,"0")}?</span><button className="primary-button" onClick={resume}><Play size={14}/> Resume</button><button className="text-button" onClick={startOver}>Start over</button></div>}
    </section>
  </div>;
}
