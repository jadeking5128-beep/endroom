"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, Play, X } from "lucide-react";
import type { MediaItem } from "@/lib/catalog";

type Props = { item: MediaItem; onClose: () => void };

export default function MediaPlayer({ item, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [resumeAt, setResumeAt] = useState(0);
  const progressKey = `nuvio-progress:${item.id}`;

  useEffect(() => {
    const saved = Number(localStorage.getItem(progressKey) || 0);
    if (Number.isFinite(saved) && saved > 10) setResumeAt(saved);
  }, [progressKey]);

  const saveProgress = () => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.currentTime) && video.currentTime > 0) {
      localStorage.setItem(progressKey, String(Math.floor(video.currentTime)));
    }
  };

  const resume = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = resumeAt;
      void video.play().catch(() => setError("Playback was blocked. Press play in the player to continue."));
    }
    setResumeAt(0);
  };

  return <div className="player-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { saveProgress(); onClose(); } }}>
    <section className="player-panel" role="dialog" aria-modal="true" aria-label={`Player: ${item.title}`}>
      <header className="player-header">
        <div><span className="player-kicker">NOW PLAYING</span><strong>{item.title}</strong></div>
        <button className="icon-button" onClick={() => { saveProgress(); onClose(); }} aria-label="Close player"><X size={18}/></button>
      </header>
      <div className="video-stage">
        <video ref={videoRef} controls playsInline preload="metadata" crossOrigin="anonymous"
          onTimeUpdate={saveProgress} onEnded={() => localStorage.removeItem(progressKey)}
          onError={() => setError("This source could not be played. Check the URL, format, CORS settings, and provider permissions.")}>
          <source src={item.streamUrl} />
          {item.subtitles?.map((track, index) => <track key={`${track.src}-${index}`} kind="subtitles" src={track.src} srcLang={track.lang} label={track.label} default={index === 0}/>)}
        </video>
        {error && <div className="player-error" role="status">{error}</div>}
      </div>
      <div className="player-footer"><span><Captions size={15}/> {item.subtitles?.length ? `${item.subtitles.length} subtitle track(s)` : "No subtitles supplied"}</span><span>Progress saved on this device</span></div>
      {resumeAt > 10 && <div className="resume-prompt"><span>Resume from {Math.floor(resumeAt / 60)}:{String(Math.floor(resumeAt % 60)).padStart(2,"0")}?</span><button className="primary-button" onClick={resume}><Play size={14}/> Resume</button><button className="text-button" onClick={() => { localStorage.removeItem(progressKey); setResumeAt(0); }}>Start over</button></div>}
    </section>
  </div>;
}
