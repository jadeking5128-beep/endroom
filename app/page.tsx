"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Check, ChevronRight, Compass, Film, Grid2X2, Home, Library, ListFilter, Plus, Search, Settings2, Sparkles, Tv, Upload, X, Star, SlidersHorizontal, Play, UserRound, Trash2 } from "lucide-react";
import { MediaItem, normalizeImportedItem, starterCatalog } from "@/lib/catalog";
import MediaPlayer from "@/components/MediaPlayer";
import AddonPanel from "@/components/AddonPanel";
import PosterPanel from "@/components/PosterPanel";

type Source = { id: string; name: string; count: number; addedAt: number };
type Profile = { id: string; name: string; color: string; createdAt: number };
const PROFILE_KEY = "nuvio-profiles-v1";
const ACTIVE_PROFILE_KEY = "nuvio-active-profile-v1";
const WATCHLIST_KEY = "nuvio-watchlists-v1";
const defaultProfile: Profile = { id: "default", name: "Guest", color: "#6d9de8", createdAt: 0 };
const navItems = [{ label:"Home", icon:Home },{ label:"Discover", icon:Compass },{ label:"Movies", icon:Film },{ label:"Series", icon:Tv },{ label:"Anime", icon:Sparkles },{ label:"Library", icon:Library },{ label:"My List", icon:Bookmark }];
const image = (id:string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=760&q=85`;

function PosterCard({ item, onSelect }: { item:MediaItem; onSelect:(item:MediaItem)=>void }) {
  return <button className="poster-card" type="button" onClick={()=>onSelect(item)} aria-label={`View ${item.title} details`}>
    <span className="poster-art" style={{backgroundImage:`linear-gradient(180deg,transparent 35%,rgba(0,0,0,.82)),url("${image(item.poster)}")`}}>
      <span className="poster-badge">{item.type.toUpperCase()}</span><span className="poster-hover"><Plus size={18}/></span>
    </span>
    <span className="poster-title">{item.title}</span><span className="poster-meta">{item.year} · {item.genres.slice(0,2).join(" / ") || item.type}</span>
  </button>;
}

export default function HomePage() {
  const [active,setActive]=useState("Home");
  const [query,setQuery]=useState("");
  const [showSearch,setShowSearch]=useState(false);
  const [type,setType]=useState("all");
  const [genre,setGenre]=useState("all");
  const [sort,setSort]=useState("popular");
  const [catalog,setCatalog]=useState<MediaItem[]>(starterCatalog);
  const [sources,setSources]=useState<Source[]>([]);
  const [sourceOpen,setSourceOpen]=useState(false);
  const [addonOpen,setAddonOpen]=useState(false);
  const [posterOpen,setPosterOpen]=useState(false);
  const [selected,setSelected]=useState<MediaItem|null>(null);
  const [playerItem,setPlayerItem]=useState<MediaItem|null>(null);
  const [notice,setNotice]=useState("");
  const [profiles,setProfiles]=useState<Profile[]>([defaultProfile]);
  const [profileId,setProfileId]=useState("default");
  const [profileOpen,setProfileOpen]=useState(false);
  const [newProfileName,setNewProfileName]=useState("");
  const [watchlists,setWatchlists]=useState<Record<string,string[]>>({});
  const fileRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    try {
      const saved=localStorage.getItem("nuvio-imported-catalog");
      const savedSources=localStorage.getItem("nuvio-sources");
      if(saved) setCatalog([...starterCatalog,...JSON.parse(saved)]);
      if(savedSources) setSources(JSON.parse(savedSources));
      const storedProfiles=JSON.parse(localStorage.getItem(PROFILE_KEY)||"[]") as Profile[];
      const nextProfiles=storedProfiles.length?storedProfiles:[defaultProfile];
      const activeProfile=localStorage.getItem(ACTIVE_PROFILE_KEY)||nextProfiles[0].id;
      setProfiles(nextProfiles);setProfileId(nextProfiles.some(p=>p.id===activeProfile)?activeProfile:nextProfiles[0].id);
      setWatchlists(JSON.parse(localStorage.getItem(WATCHLIST_KEY)||"{}"));
    } catch { setNotice("Saved local catalogue could not be read. Starter catalogue remains available."); }
  },[]);

  const currentProfile=profiles.find(p=>p.id===profileId)||defaultProfile;
  const savedIds=watchlists[profileId]||[];
  const visibleCatalog=active==="My List"?catalog.filter(item=>savedIds.includes(item.id)):catalog;
  const toggleWatchlist=(item:MediaItem)=>{const nextIds=savedIds.includes(item.id)?savedIds.filter(id=>id!==item.id):[...savedIds,item.id];const next={...watchlists,[profileId]:nextIds};setWatchlists(next);localStorage.setItem(WATCHLIST_KEY,JSON.stringify(next));setNotice(nextIds.includes(item.id)?`Added ${item.title} to ${currentProfile.name}’s list.`:`Removed ${item.title} from your list.`);};
  const createProfile=()=>{const name=newProfileName.trim().slice(0,24);if(!name)return;const next:Profile={id:crypto.randomUUID(),name,color:["#6d9de8","#d19b63","#8e78c9","#65a995"][profiles.length%4],createdAt:Date.now()};const all=[...profiles,next];setProfiles(all);setProfileId(next.id);setActive("Home");setNewProfileName("");localStorage.setItem(PROFILE_KEY,JSON.stringify(all));localStorage.setItem(ACTIVE_PROFILE_KEY,next.id);};
  const switchProfile=(id:string)=>{setProfileId(id);setActive("Home");localStorage.setItem(ACTIVE_PROFILE_KEY,id);setProfileOpen(false);};
  const deleteProfile=(id:string)=>{if(profiles.length===1){setNotice("Keep at least one profile in this browser.");return;}const all=profiles.filter(p=>p.id!==id);const nextLists={...watchlists};delete nextLists[id];setProfiles(all);setWatchlists(nextLists);localStorage.setItem(PROFILE_KEY,JSON.stringify(all));localStorage.setItem(WATCHLIST_KEY,JSON.stringify(nextLists));if(profileId===id){setProfileId(all[0].id);localStorage.setItem(ACTIVE_PROFILE_KEY,all[0].id);}};
  const genres=useMemo(()=>Array.from(new Set(catalog.flatMap(item=>item.genres))).sort(),[catalog]);
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return visibleCatalog.filter(item=>(type==="all"||item.type===type)&&(genre==="all"||item.genres.includes(genre))&&(!q||[item.title,item.overview,...item.genres].join(" ").toLowerCase().includes(q))).sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):sort==="newest"?b.year-a.year:b.rating-a.rating);
  },[catalog,query,type,genre,sort]);
  const selectNav=(label:string)=>{setActive(label);setType(label==="Movies"?"movie":label==="Series"?"series":label==="Anime"?"anime":"all");setGenre("all");};
  const importFile=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0]; if(!file)return;
    try {
      const parsed=JSON.parse(await file.text());
      const rows=Array.isArray(parsed)?parsed:Array.isArray(parsed.items)?parsed.items:null;
      if(!rows) throw new Error("Expected an array or an object with an items array.");
      const name=file.name.replace(/\.json$/i,"").slice(0,60)||"Local catalogue";
      const imported=rows.map((row:unknown)=>normalizeImportedItem(row,name)).filter((row:MediaItem|null):row is MediaItem=>row!==null);
      if(!imported.length) throw new Error("No valid entries found. Each item needs a title.");
      const existing=JSON.parse(localStorage.getItem("nuvio-imported-catalog")||"[]") as MediaItem[];
      const merged=[...existing,...imported];
      localStorage.setItem("nuvio-imported-catalog",JSON.stringify(merged));
      const nextSources=[...sources,{id:crypto.randomUUID(),name,count:imported.length,addedAt:Date.now()}];
      localStorage.setItem("nuvio-sources",JSON.stringify(nextSources));
      setCatalog([...starterCatalog,...merged]);setSources(nextSources);setNotice(`Imported ${imported.length} titles from ${name}.`);setSourceOpen(false);
    } catch(error) { setNotice(error instanceof Error?error.message:"Could not import this catalogue."); }
    event.target.value="";
  };
  const removeSource=(source:Source)=>{
    const imported=(JSON.parse(localStorage.getItem("nuvio-imported-catalog")||"[]") as MediaItem[]).filter(item=>item.source!==source.name);
    const next=sources.filter(item=>item.id!==source.id);
    localStorage.setItem("nuvio-imported-catalog",JSON.stringify(imported));localStorage.setItem("nuvio-sources",JSON.stringify(next));
    setCatalog([...starterCatalog,...imported]);setSources(next);setNotice(`Removed ${source.name} and its imported catalogue entries.`);
  };

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e=>{e.preventDefault();selectNav("Home");}}><span className="brand-mark"><span/></span><span>nuvio<span className="brand-web"> web</span></span></a>
      <div className="side-label">YOUR SPACE</div><nav className="side-nav" aria-label="Main navigation">{navItems.map(({label,icon:Icon})=><button key={label} className={active===label?"nav-link active":"nav-link"} onClick={()=>selectNav(label)}><Icon size={18}/><span>{label}</span>{label==="Library"&&<span className="nav-count">{catalog.length}</span>}</button>)}</nav>
      <div className="side-divider"/><div className="side-label">SOURCES</div>
      <button className="nav-link muted" onClick={()=>setSourceOpen(true)}><Plus size={18}/><span>Manage sources</span></button>
      <div className="sidebar-bottom"><button className="nav-link muted" onClick={()=>setSourceOpen(true)}><Settings2 size={18}/><span>Catalogue settings</span></button><div className="profile-mini"><div className="avatar" style={{background:currentProfile.color}}>{currentProfile.name.slice(0,1).toUpperCase()}</div><div><strong>{currentProfile.name}</strong><span>Local profile</span></div></div></div>
    </aside>
    <section className="main-column">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><span/></span><strong>nuvio</strong></div><div className="breadcrumb"><span>YOUR SPACE</span><ChevronRight size={13}/><strong>{active}</strong></div>
        <div className="top-actions"><button className="secondary-button addon-top-button" onClick={()=>setAddonOpen(true)}><Play size={15}/> Add-on library</button><button className="secondary-button addon-top-button" onClick={()=>setPosterOpen(true)}><Film size={15}/> Poster library</button>{showSearch?<div className="search-field"><Search size={16}/><input autoFocus placeholder="Search titles, genres..." value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={()=>{setShowSearch(false);setQuery("");}} aria-label="Close search"><X size={16}/></button></div>:<button className="icon-button" aria-label="Search" onClick={()=>setShowSearch(true)}><Search size={19}/></button>}<button className="icon-button filter-button" aria-label="Manage sources" onClick={()=>setSourceOpen(true)}><SlidersHorizontal size={18}/></button><button className="top-avatar profile-trigger" aria-label="Manage profiles" onClick={()=>setProfileOpen(true)} style={{background:currentProfile.color}}>{currentProfile.name.slice(0,1).toUpperCase()}</button></div>
      </header>
      <div className="content">
        {notice&&<div className="notice"><Sparkles size={15}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss"><X size={15}/></button></div>}
        {active==="Home"&&!query&&<section className="hero"><div className="hero-image"/><div className="hero-shade"/><div className="hero-content"><div className="eyebrow"><span className="eyebrow-dot"/> YOUR MEDIA, IN ONE PLACE</div><div className="hero-kicker">DISCOVER WITHOUT THE CLUTTER</div><h1>Your next<br/><em>story starts here.</em></h1><p>Search across your catalogue, filter by genre, and bring your own metadata lists into one organised library.</p><div className="hero-actions"><button className="primary-button" onClick={()=>selectNav("Discover")}><Compass size={16}/> Explore catalogue</button><button className="secondary-button" onClick={()=>setSourceOpen(true)}><Plus size={16}/> Import a source</button></div></div><div className="hero-index"><span>02</span><i/><span>05</span></div></section>}
        <div className="section-heading"><div><div className="section-overline">{query?"CATALOGUE SEARCH":active==="Home"?"CURATED PREVIEW": "BROWSE CATALOGUE"}</div><h2>{query?`Results for “${query}”`:active==="Home"?"Discover something new":active==="My List"?`${currentProfile.name}’s watchlist`:active}</h2></div><span className="result-count">{filtered.length} TITLES</span></div>
        <div className="catalog-controls"><div className="filter-pills">{["all","movie","series","anime"].map(v=><button key={v} className={type===v?"category-chip selected":"category-chip"} onClick={()=>{setType(v);setActive(v==="all"?"Discover":v==="movie"?"Movies":v==="series"?"Series":"Anime");}}>{v==="all"?"Everything":v==="movie"?"Movies":v==="series"?"Series":"Anime"}</button>)}</div><div className="select-controls"><label><ListFilter size={14}/><select aria-label="Filter by genre" value={genre} onChange={e=>setGenre(e.target.value)}><option value="all">All genres</option>{genres.map(g=><option key={g} value={g}>{g}</option>)}</select></label><label><SlidersHorizontal size={14}/><select aria-label="Sort catalogue" value={sort} onChange={e=>setSort(e.target.value)}><option value="popular">Top rated</option><option value="newest">Newest</option><option value="title">Title A–Z</option></select></label></div></div>
        <div className="catalog-grid">{filtered.map(item=><PosterCard key={item.id} item={item} onSelect={setSelected}/>)}{filtered.length===0&&<div className="empty-state"><Search size={24}/><strong>No titles found</strong><span>Try another search or clear a filter.</span><button className="text-button" onClick={()=>{setQuery("");setType("all");setGenre("all");}}>Clear filters</button></div>}</div>
        <div className="source-summary"><div><strong>Catalogue sources</strong><span>{sources.length} local imports · {catalog.length} available titles</span></div><button className="secondary-button" onClick={()=>setSourceOpen(true)}><Plus size={15}/> Manage sources</button></div>
        <footer className="footer-note"><span className="footer-mark">N</span><span>Phase 4 · Profiles & personal library</span><i/><span>Preview entries are illustrative. Imported lists stay in this browser.</span></footer>
      </div>
    </section>
    <nav className="mobile-nav" aria-label="Mobile navigation">{[navItems[0],navItems[1],navItems[2],navItems[6],navItems[5]].map(({label,icon:Icon})=><button key={label} className={active===label?"mobile-nav-item active":"mobile-nav-item"} onClick={()=>selectNav(label)}><Icon size={19}/><span>{label}</span></button>)}</nav>
    {profileOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setProfileOpen(false);}}><section className="modal-panel profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-heading"><div><div className="section-overline">PERSONAL SPACE</div><h2 id="profile-title">Profiles</h2></div><button className="icon-button" onClick={()=>setProfileOpen(false)} aria-label="Close profiles"><X size={18}/></button></div><p className="modal-copy">Each profile has its own watchlist on this browser. Profiles are local and are not protected by separate passwords.</p><div className="profile-list">{profiles.map(profile=><div className={profile.id===profileId?"profile-row active":"profile-row"} key={profile.id}><button className="profile-select" onClick={()=>switchProfile(profile.id)}><span className="profile-avatar-large" style={{background:profile.color}}>{profile.name.slice(0,1).toUpperCase()}</span><span><strong>{profile.name}</strong><small>{profile.id===profileId?"Currently active":"Switch to profile"} · {(watchlists[profile.id]||[]).length} saved</small></span></button>{profiles.length>1&&<button className="remove-source" onClick={()=>deleteProfile(profile.id)} aria-label={"Delete "+profile.name}><Trash2 size={15}/></button>}</div>)}</div><form className="profile-create" onSubmit={e=>{e.preventDefault();createProfile();}}><input value={newProfileName} onChange={e=>setNewProfileName(e.target.value)} maxLength={24} placeholder="New profile name" aria-label="New profile name"/><button className="primary-button" type="submit" disabled={!newProfileName.trim()}><Plus size={15}/> Create profile</button></form><div className="modal-footnote"><UserRound size={14}/> Local-only profiles · No cloud account or sync configured</div></section></div>}
    {sourceOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSourceOpen(false);}}><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="source-title"><div className="modal-heading"><div><div className="section-overline">PERSONAL CATALOGUE</div><h2 id="source-title">Manage sources</h2></div><button className="icon-button" onClick={()=>setSourceOpen(false)} aria-label="Close"><X size={18}/></button></div><p className="modal-copy">Import a JSON catalogue you own or have permission to use. Entries are stored locally in this browser; no remote source is contacted.</p><div className="import-drop"><Upload size={22}/><strong>Import catalogue JSON</strong><span>Choose a .json file containing an array of titles or an object with an items array.</span><button className="primary-button" onClick={()=>fileRef.current?.click()}><Plus size={15}/> Choose file</button><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importFile}/></div><div className="source-list-heading">CONNECTED LOCAL SOURCES <span>{sources.length}</span></div>{sources.length?sources.map(source=><div className="source-row" key={source.id}><div className="source-icon"><Library size={17}/></div><div className="source-info"><strong>{source.name}</strong><span>{source.count} titles · This device only</span></div><button className="remove-source" onClick={()=>removeSource(source)} aria-label={`Remove ${source.name}`}><X size={16}/></button></div>):<div className="source-empty">No imported sources yet. Your starter catalogue is ready to browse.</div>}<div className="modal-footnote"><Check size={14}/> Local-first import · No account or external service required</div></section></div>}
    {selected&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="detail-art" style={{backgroundImage:`linear-gradient(0deg,#101216,transparent 75%),url("${image(selected.poster)}")`}}/><button className="detail-close icon-button" onClick={()=>setSelected(null)} aria-label="Close details"><X size={18}/></button><div className="detail-content"><div className="section-overline">{selected.type.toUpperCase()} · {selected.year}</div><h2 id="detail-title">{selected.title}</h2><div className="detail-meta"><span><Star size={14} fill="currentColor"/> {selected.rating?selected.rating.toFixed(1):"Not rated"}</span><span>{selected.genres.join(" · ")}</span><span>{selected.runtime|| (selected.seasons?`${selected.seasons} seasons`:"")}</span></div><p>{selected.overview}</p><div className="detail-source">Metadata source: {selected.source}</div><div className="detail-actions"><button className="secondary-button" onClick={()=>toggleWatchlist(selected)}><Bookmark size={15} fill={savedIds.includes(selected.id)?"currentColor":"none"}/>{savedIds.includes(selected.id)?"In My List":"Add to My List"}</button>{selected.streamUrl ? <button className="primary-button detail-play" onClick={()=>{setPlayerItem(selected);setSelected(null);}}><Play size={15} fill="currentColor"/> Play with your authorised source</button> : <div className="detail-placeholder">No playback source attached. Add an HTTPS streamUrl to a catalogue entry you own or are licensed to access.</div>}</div>
        {selected.subtitles?.length ? <div className="detail-source">{selected.subtitles.length} subtitle track(s) available</div> : null}</div></section></div>}
    {playerItem&&<MediaPlayer item={playerItem} onClose={()=>setPlayerItem(null)}/>}
    {addonOpen&&<AddonPanel onClose={()=>setAddonOpen(false)} onPlay={item=>{setAddonOpen(false);setPlayerItem(item);}}/>}
    {posterOpen&&<PosterPanel onClose={()=>setPosterOpen(false)}/>}
  </main>;
}
