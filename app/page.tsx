"use client";

import { useMemo, useState } from "react";
import {
  Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Compass,
  Film, Grid2X2, Home, Library, ListFilter, MonitorPlay, MoreHorizontal,
  Play, Plus, Search, Settings2, SlidersHorizontal, Sparkles, Tv,
  UserRound, X
} from "lucide-react";

type Media = {
  title: string;
  meta: string;
  image: string;
  progress?: number;
  badge?: string;
};

const media: Media[] = [
  { title: "The Quiet Between", meta: "2025 · Drama · 1h 48m", image: "photo-1489599849927-2ee91cede3ba", progress: 68 },
  { title: "After the Signal", meta: "2024 · Sci-fi · 2h 06m", image: "photo-1517604931442-7e0c8ed2963c", progress: 34 },
  { title: "Blue Hour", meta: "2025 · Mystery · 1h 56m", image: "photo-1440404653325-ab127d49abc1", progress: 82 },
  { title: "Northbound", meta: "2023 · Adventure · 2h 11m", image: "photo-1478720568477-152d9b164e26", progress: 19 },
  { title: "The Last Frame", meta: "2025 · Thriller · 1h 51m", image: "photo-1485846234645-a62644f84728", progress: 52 }
];

const popular: Media[] = [
  { title: "Parallel", meta: "Series · 2 seasons", image: "photo-1518837695005-2083093ee35b", badge: "SERIES" },
  { title: "Low Orbit", meta: "Movie · 2025", image: "photo-1462331940025-496dfbfc7564", badge: "MOVIE" },
  { title: "Glasshouse", meta: "Series · 1 season", image: "photo-1519608487953-e999c86e7455", badge: "SERIES" },
  { title: "Wild Current", meta: "Movie · 2024", image: "photo-1500530855697-b586d89ba3ee", badge: "MOVIE" },
  { title: "Night Archive", meta: "Series · 3 seasons", image: "photo-1518709268805-4e9042af9f23", badge: "SERIES" }
];

const navItems = [
  { label: "Home", icon: Home },
  { label: "Discover", icon: Compass },
  { label: "Movies", icon: Film },
  { label: "Series", icon: Tv },
  { label: "Library", icon: Library }
];

function artwork(id: string) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=700&q=85`;
}

function PosterCard({ item, compact = false }: { item: Media; compact?: boolean }) {
  return (
    <button className={`poster-card ${compact ? "poster-card--compact" : ""}`} type="button" aria-label={`Open ${item.title}`}>
      <span className="poster-art" style={{ backgroundImage: `linear-gradient(180deg, transparent 42%, rgba(0,0,0,.84)), url("${artwork(item.image)}")` }}>
        {item.badge && <span className="poster-badge">{item.badge}</span>}
        <span className="poster-hover"><Play size={17} fill="currentColor" /></span>
      </span>
      <span className="poster-title">{item.title}</span>
      <span className="poster-meta">{item.meta}</span>
      {typeof item.progress === "number" && <span className="progress-track"><span style={{ width: `${item.progress}%` }} /></span>}
    </button>
  );
}

export default function HomePage() {
  const [active, setActive] = useState("Home");
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [notice, setNotice] = useState("");
  const [showProfile, setShowProfile] = useState(false);

  const filtered = useMemo(() => {
    const all = [...media, ...popular];
    if (!query.trim()) return all;
    return all.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
  }, [query]);

  const selectNav = (label: string) => {
    setActive(label);
    setNotice(label === "Home" ? "" : `${label} workspace is part of the Phase 2 build.`);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => selectNav("Home")}>
          <span className="brand-mark"><span /></span>
          <span>nuvio<span className="brand-web"> web</span></span>
        </a>
        <div className="side-label">YOUR SPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={active === label ? "nav-link active" : "nav-link"} onClick={() => selectNav(label)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {label === "Library" && <span className="nav-count">0</span>}
            </button>
          ))}
        </nav>
        <div className="side-divider" />
        <div className="side-label">COLLECTIONS</div>
        <button className="nav-link muted" onClick={() => setNotice("Your personal collections arrive in Phase 4.")}><Bookmark size={18} /><span>Watchlist</span></button>
        <button className="nav-link muted" onClick={() => setNotice("Custom collections arrive in Phase 4.")}><Grid2X2 size={18} /><span>Collections</span></button>
        <div className="sidebar-bottom">
          <button className="nav-link muted" onClick={() => setNotice("Settings will be added in Phase 4.")}><Settings2 size={18} /><span>Settings</span></button>
          <div className="profile-mini">
            <div className="avatar">N</div>
            <div><strong>Guest profile</strong><span>Local preview</span></div>
            <MoreHorizontal size={18} />
          </div>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><span /></span><strong>nuvio</strong></div>
          <div className="breadcrumb"><span>YOUR SPACE</span><ChevronRight size={13} /><strong>{active}</strong></div>
          <div className="top-actions">
            {showSearch ? (
              <div className="search-field"><Search size={16} /><input autoFocus placeholder="Search your library..." value={query} onChange={(e) => setQuery(e.target.value)} /><button onClick={() => { setShowSearch(false); setQuery(""); }} aria-label="Close search"><X size={16} /></button></div>
            ) : (
              <button className="icon-button" aria-label="Search" onClick={() => setShowSearch(true)}><Search size={19} /></button>
            )}
            <button className="icon-button filter-button" aria-label="Filters" onClick={() => setNotice("Catalogue filters arrive in Phase 2.")}><SlidersHorizontal size={18} /></button>
            <button className="top-avatar" onClick={() => setShowProfile(!showProfile)} aria-label="Profile menu">N</button>
            {showProfile && <div className="profile-popover"><strong>Guest profile</strong><span>Local preview</span><button onClick={() => setNotice("Account profiles arrive in Phase 4.")}>Manage profiles</button></div>}
          </div>
        </header>

        <div className="content">
          {notice && <div className="notice"><Sparkles size={15} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}

          {!query && active === "Home" && (
            <section className="hero">
              <div className="hero-image" />
              <div className="hero-shade" />
              <div className="hero-content">
                <div className="eyebrow"><span className="eyebrow-dot" /> YOUR MEDIA, IN ONE PLACE</div>
                <div className="hero-kicker">A LIBRARY THAT MOVES WITH YOU</div>
                <h1>Find your<br /><em>next favourite.</em></h1>
                <p>Bring your sources together. Pick up where you left off, explore something new, and keep your library yours.</p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={() => selectNav("Discover")}><Compass size={16} /> Explore library</button>
                  <button className="secondary-button" onClick={() => setNotice("Connect your media sources in Phase 2.")}><Plus size={16} /> Add a source</button>
                </div>
              </div>
              <div className="hero-index"><span>01</span><i /><span>04</span></div>
            </section>
          )}

          <div className="section-heading">
            <div><div className="section-overline">{query ? "SEARCH RESULTS" : active === "Home" ? "PICK UP WHERE YOU LEFT OFF" : "YOUR LIBRARY"}</div><h2>{query ? `Results for “${query}”` : active === "Home" ? "Continue watching" : active}</h2></div>
            {!query && <button className="text-button" onClick={() => selectNav("Library")}>View library <ChevronRight size={15} /></button>}
          </div>

          {query ? (
            <div className="poster-grid search-grid">
              {filtered.map((item) => <PosterCard key={item.title} item={item} />)}
              {filtered.length === 0 && <div className="empty-state"><Search size={24} /><strong>No matches yet</strong><span>Try another title or clear your search.</span></div>}
            </div>
          ) : (
            <div className="poster-row">
              {media.slice(0, 5).map((item) => <PosterCard key={item.title} item={item} />)}
            </div>
          )}

          {!query && (
            <>
              <div className="section-heading section-heading--second">
                <div><div className="section-overline">A LITTLE INSPIRATION</div><h2>Explore something new</h2></div>
                <button className="text-button" onClick={() => selectNav("Discover")}>Discover all <ChevronRight size={15} /></button>
              </div>
              <div className="category-strip">
                {["For you", "Movies", "Series", "Anime", "Recently added"].map((item, i) => <button key={item} className={i === 0 ? "category-chip selected" : "category-chip"} onClick={() => selectNav(item === "For you" ? "Discover" : item)}>{item}</button>)}
              </div>
              <div className="poster-row poster-row--popular">
                {popular.map((item) => <PosterCard key={item.title} item={item} compact />)}
              </div>
            </>
          )}

          <footer className="footer-note"><span className="footer-mark">N</span><span>Phase 1 preview</span><i /> <span>Local sample catalogue · No streaming sources connected</span></footer>
        </div>
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map(({ label, icon: Icon }) => (
          <button key={label} className={active === label ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => selectNav(label)}>
            <Icon size={19} strokeWidth={1.9} /><span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
