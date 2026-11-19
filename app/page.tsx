"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, ChevronRight, Compass, Film, Home, Library, ListFilter, Plus, Search, Sparkles, Tv, X, Star, SlidersHorizontal, Play, UserRound, Trash2 } from "lucide-react";
import { MediaItem } from "@/lib/catalog";
import MediaPlayer from "@/components/MediaPlayer";

type Profile = { id: string; name: string; color: string; createdAt: number };
const PROFILE_KEY = "nuvio-profiles-v1";
const ACTIVE_PROFILE_KEY = "nuvio-active-profile-v1";
const WATCHLIST_KEY = "nuvio-watchlists-v1";
const defaultProfile: Profile = { id: "default", name: "Guest", color: "#6d9de8", createdAt: 0 };
const navItems = [{ label:"Home", icon:Home },{ label:"Search", icon:Compass },{ label:"Library", icon:Library },{ label:"Settings", icon:UserRound }];
const image = (id:string) => id.startsWith("https://") || id.startsWith("http://") ? id : `https://images.unsplash.com/${id || "photo-1489599849927-2ee91cede3ba"}?auto=format&fit=crop&w=760&q=85`;

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
  const [catalog,setCatalog]=useState<MediaItem[]>([]);
  const [catalogSources,setCatalogSources]=useState<{id:string;type:"movie"|"series"|"anime";name?:string;sourceId?:string;addonName?:string;extraSupported?:string[];extra?:(string|{name?:string})[]}[]>([]);
  const [remoteSearchResults,setRemoteSearchResults]=useState<MediaItem[]|null>(null);
  const [remoteSearchBusy,setRemoteSearchBusy]=useState(false);
  const [catalogBusy,setCatalogBusy]=useState(true);
  const [selected,setSelected]=useState<MediaItem|null>(null);
  const [detailBusy,setDetailBusy]=useState(false);
  const [playerItem,setPlayerItem]=useState<MediaItem|null>(null);
  const [notice,setNotice]=useState("");
  const [profiles,setProfiles]=useState<Profile[]>([defaultProfile]);
  const [profileId,setProfileId]=useState("default");
  const [profileOpen,setProfileOpen]=useState(false);
  const [newProfileName,setNewProfileName]=useState("");
  const [watchlists,setWatchlists]=useState<Record<string,string[]>>({});

  useEffect(()=>{
    try {
      const storedProfiles=JSON.parse(localStorage.getItem(PROFILE_KEY)||"[]") as Profile[];
      const nextProfiles=storedProfiles.length?storedProfiles:[defaultProfile];
      const activeProfile=localStorage.getItem(ACTIVE_PROFILE_KEY)||nextProfiles[0].id;
      setProfiles(nextProfiles);setProfileId(nextProfiles.some(p=>p.id===activeProfile)?activeProfile:nextProfiles[0].id);
      setWatchlists(JSON.parse(localStorage.getItem(WATCHLIST_KEY)||"{}"));
    } catch { setNotice("Saved profile data could not be read."); }
  },[]);

  useEffect(()=>{let cancelled=false;(async()=>{try{
    const manifestResponse=await fetch("/api/addon",{cache:"no-store"});
    const manifestPayload=await manifestResponse.json();
    if(!manifestResponse.ok||!manifestPayload.ok)throw new Error(manifestPayload.error||"Manifest could not be loaded.");
    const manifests=Array.isArray(manifestPayload.manifests)?manifestPayload.manifests:[{sourceId:"poster",manifest:manifestPayload.manifest}];
    const sources=manifests.flatMap((entry:{sourceId?:string;manifest?:{name?:string;catalogs?:unknown[]}})=>Array.isArray(entry.manifest?.catalogs)?entry.manifest.catalogs.filter((catalog):catalog is {id:string;type:"movie"|"series"|"anime";name?:string;extraSupported?:string[];extra?:(string|{name?:string})[]}=>!!catalog&&typeof catalog==="object"&&typeof (catalog as {id?:unknown}).id==="string"&&["movie","series","anime"].includes(String((catalog as {type?:unknown}).type))).map(catalog=>({...catalog,sourceId:entry.sourceId||"poster",addonName:entry.manifest?.name||"Catalogue"})):[]);
    if(!sources.length)throw new Error("No supported movie, series or anime catalogues were found in the configured manifests.");
    if(!cancelled)setCatalogSources(sources);
    const outcomes=await Promise.allSettled(sources.map(async(source:{id:string;type:"movie"|"series"|"anime";name?:string;sourceId?:string;addonName?:string})=>{
      const response=await fetch("/api/addon",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"catalog",sourceId:source.sourceId||"poster",type:source.type,catalogId:source.id})});
      const payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error(payload.error||`Could not load ${source.name||source.id}.`);
      const metas=Array.isArray(payload.data?.metas)?payload.data.metas:[];
      return metas.flatMap((meta:{id?:string;name?:string;description?:string;year?:number;releaseInfo?:string;genres?:string[];imdbRating?:string;poster?:string})=>{
        if(typeof meta.id!=="string"||!meta.id)return [];
        return [{id:`${source.sourceId||"poster"}-${source.type}-${meta.id}`,metaId:meta.id,title:meta.name||meta.id,overview:meta.description||"",year:Number(meta.year||meta.releaseInfo?.slice(0,4))||0,type:source.type,genres:Array.isArray(meta.genres)?meta.genres.filter((g):g is string=>typeof g==="string"):[],rating:Number(meta.imdbRating)||0,poster:meta.poster||"",backdrop:meta.poster||"",source:source.addonName||"Configured catalogue",sourceId:source.sourceId||"poster"} as MediaItem];
      });
    }));
    const loaded=outcomes.flatMap(result=>result.status==="fulfilled"?result.value:[]);
    const failed=outcomes.filter(result=>result.status==="rejected").length+(Number(manifestPayload.failedSources)||0);
    if(!cancelled){setCatalog(Array.from(new Map(loaded.map(item=>[item.id,item])).values()));if(!loaded.length)setNotice(failed?`Manifest loaded, but all ${failed} catalog request(s) failed.`:"Manifest loaded, but its catalogs returned no titles.");else if(failed)setNotice(`Loaded ${loaded.length} titles. ${failed} catalog request(s) failed and were skipped.`);}
  }catch(error){if(!cancelled)setNotice(error instanceof Error?error.message:"Could not load the configured catalogue.");}finally{if(!cancelled)setCatalogBusy(false);}})();return()=>{cancelled=true;}},[]);

  useEffect(()=>{if(!selected?.metaId)return;let cancelled=false;(async()=>{setDetailBusy(true);try{const response=await fetch("/api/addon",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"meta",sourceId:selected.sourceId||"poster",type:selected.type==="anime"?"series":selected.type,id:selected.metaId})});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||"Could not load title details.");const meta=payload.data?.meta;if(!meta||cancelled)return;setSelected(current=>current?.id===selected.id?({...current,title:meta.name||current.title,overview:meta.description||current.overview,year:Number(meta.year||meta.releaseInfo?.slice(0,4))||current.year,genres:Array.isArray(meta.genres)?meta.genres:current.genres,rating:Number(meta.imdbRating)||current.rating,poster:meta.poster||current.poster,backdrop:meta.background||meta.poster||current.backdrop,runtime:meta.runtime||current.runtime,seasons:Array.isArray(meta.videos)?new Set(meta.videos.map((v:{season?:number})=>v.season).filter((v:number|undefined)=>typeof v==="number")).size||current.seasons:current.seasons}):current);}catch(error){if(!cancelled)setNotice(error instanceof Error?error.message:"Could not load title details.");}finally{if(!cancelled)setDetailBusy(false);}})();return()=>{cancelled=true;}},[selected?.id]);

  useEffect(()=>{
    const q=query.trim();
    if(active!=="Search"||q.length<2){setRemoteSearchResults(null);setRemoteSearchBusy(false);return;}
    const supported=catalogSources.filter(source=>source.extraSupported?.includes("search")||source.extra?.some(item=>typeof item==="string"?item==="search":item.name==="search"));
    if(!supported.length){setRemoteSearchResults(null);return;}
    let cancelled=false;
    const timer=setTimeout(async()=>{setRemoteSearchBusy(true);try{
      const results=await Promise.allSettled(supported.map(async source=>{
        const response=await fetch("/api/addon",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"catalog",sourceId:source.sourceId||"poster",type:source.type,catalogId:source.id,extra:{search:q}})});
        const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||"Search request failed.");
        return (Array.isArray(payload.data?.metas)?payload.data.metas:[]).flatMap((meta:{id?:string;name?:string;description?:string;year?:number;releaseInfo?:string;genres?:string[];imdbRating?:string;poster?:string;background?:string})=>typeof meta.id==="string"&&meta.id?[{id:(source.sourceId||"poster")+"-"+source.type+"-"+meta.id,metaId:meta.id,title:meta.name||meta.id,overview:meta.description||"",year:Number(meta.year||meta.releaseInfo?.slice(0,4))||0,type:source.type,genres:Array.isArray(meta.genres)?meta.genres:[],rating:Number(meta.imdbRating)||0,poster:meta.poster||"",backdrop:meta.background||meta.poster||"",source:source.addonName||source.name||"Configured catalogue",sourceId:source.sourceId||"poster"} as MediaItem]:[]);
      }));
      if(!cancelled)setRemoteSearchResults(Array.from(new Map(results.flatMap(result=>result.status==="fulfilled"?result.value:[]).map(item=>[item.id,item])).values()));
    }catch{if(!cancelled)setRemoteSearchResults([]);}finally{if(!cancelled)setRemoteSearchBusy(false);}},350);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[query,active,catalogSources]);

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
    const source= q.length>=2&&remoteSearchResults!==null?remoteSearchResults:visibleCatalog;
    return source.filter(item=>(type==="all"||item.type===type)&&(genre==="all"||item.genres.includes(genre))&&(!q||[item.title,item.overview,...item.genres].join(" ").toLowerCase().includes(q))).sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):sort==="newest"?b.year-a.year:b.rating-a.rating);
  },[catalog,query,type,genre,sort,remoteSearchResults]);
  const selectNav=(label:string)=>{setActive(label);setShowSearch(label==="Search");setType("all");setGenre("all");if(label!=="Search")setQuery("");};


  const featured = catalog[0] || null;
  const movieItems = catalog.filter(item=>item.type==="movie");
  const seriesItems = catalog.filter(item=>item.type==="series");
  const animeItems = catalog.filter(item=>item.type==="anime");
  const shelf = (title:string, items:MediaItem[]) => <section className="nuvio-shelf" key={title}><div className="nuvio-shelf-heading"><h2>{title}</h2><span>{items.length} titles</span></div><div className="nuvio-shelf-track">{items.slice(0,18).map(item=><PosterCard key={item.id} item={item} onSelect={setSelected}/>)}</div></section>;
  const catalogueGrid = <div className="nuvio-grid">{filtered.map(item=><PosterCard key={item.id} item={item} onSelect={setSelected}/>) }{!catalogBusy&&filtered.length===0&&<div className="empty-state"><Search size={24}/><strong>No titles found</strong><span>Try another search or clear a filter.</span><button className="text-button" onClick={()=>{setQuery("");setType("all");setGenre("all");}}>Clear filters</button></div>}</div>;

  const modal = <>
    {profileOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setProfileOpen(false);}}><section className="modal-panel profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-heading"><div><div className="section-overline">PERSONAL SPACE</div><h2 id="profile-title">Profiles</h2></div><button className="icon-button" onClick={()=>setProfileOpen(false)} aria-label="Close profiles"><X size={18}/></button></div><p className="modal-copy">Each profile has its own watchlist on this browser. Profiles are stored locally on this device.</p><div className="profile-list">{profiles.map(profile=><div className={profile.id===profileId?"profile-row active":"profile-row"} key={profile.id}><button className="profile-select" onClick={()=>switchProfile(profile.id)}><span className="profile-avatar-large" style={{background:profile.color}}>{profile.name.slice(0,1).toUpperCase()}</span><span><strong>{profile.name}</strong><small>{profile.id===profileId?"Currently active":"Switch to profile"} · {(watchlists[profile.id]||[]).length} saved</small></span></button>{profiles.length>1&&<button className="remove-source" onClick={()=>deleteProfile(profile.id)} aria-label={"Delete "+profile.name}><Trash2 size={15}/></button>}</div>)}</div><form className="profile-create" onSubmit={e=>{e.preventDefault();createProfile();}}><input value={newProfileName} onChange={e=>setNewProfileName(e.target.value)} maxLength={24} placeholder="New profile name" aria-label="New profile name"/><button className="primary-button" type="submit" disabled={!newProfileName.trim()}><Plus size={15}/> Create profile</button></form><div className="modal-footnote"><UserRound size={14}/> Local-only profiles · Data stays in this browser</div></section></div>}
    {selected&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null);}}><section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="detail-art" style={{backgroundImage:`linear-gradient(0deg,#101216,transparent 75%),url("${image(selected.backdrop||selected.poster)}")`}}/><button className="detail-close icon-button" onClick={()=>setSelected(null)} aria-label="Close details"><X size={18}/></button><div className="detail-content">{detailBusy&&<div className="detail-loading">Updating title details…</div>}<div className="section-overline">{selected.type.toUpperCase()} · {selected.year}</div><h2 id="detail-title">{selected.title}</h2><div className="detail-meta"><span><Star size={14} fill="currentColor"/> {selected.rating?selected.rating.toFixed(1):"Not rated"}</span><span>{selected.genres.join(" · ")}</span><span>{selected.runtime||(selected.seasons?`${selected.seasons} seasons`:"")}</span></div><p>{selected.overview}</p><div className="detail-source">Metadata source: {selected.source}</div><div className="detail-actions"><button className="secondary-button" onClick={()=>toggleWatchlist(selected)}><Bookmark size={15} fill={savedIds.includes(selected.id)?"currentColor":"none"}/>{savedIds.includes(selected.id)?"In My List":"Add to My List"}</button>{selected.streamUrl?<button className="primary-button detail-play" onClick={()=>{setPlayerItem(selected);setSelected(null);}}><Play size={15} fill="currentColor"/> Play with your authorised source</button>:<div className="detail-placeholder">No playback source attached. Add an HTTPS streamUrl to a catalogue entry you own or are licensed to access.</div>}</div>{selected.subtitles?.length?<div className="detail-source">{selected.subtitles.length} subtitle track(s) available</div>:null}</div></section></div>}
    {playerItem&&<MediaPlayer item={playerItem} onClose={()=>setPlayerItem(null)}/>}
  </>;

  return <main className="nuvio-app">
    <header className="nuvio-header">
      <button className="nuvio-wordmark" onClick={()=>selectNav("Home")} aria-label="Nuvio home"><span className="nuvio-symbol"><i/><i/><i/></span><span>nuvio</span></button>
      <div className="nuvio-header-actions">
        <button className="nuvio-header-icon" aria-label="Search" onClick={()=>selectNav("Search")}><Search size={20}/></button>
        <button className="nuvio-profile-button" aria-label="Profiles" onClick={()=>setProfileOpen(true)} style={{background:currentProfile.color}}>{currentProfile.name.slice(0,1).toUpperCase()}</button>
      </div>
    </header>

    <div className="nuvio-screen" key={active}>
      {notice&&<div className="notice nuvio-notice"><Sparkles size={15}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss"><X size={15}/></button></div>}

      {active==="Home"&&<>
        {featured?<section className="nuvio-featured" style={{backgroundImage:`linear-gradient(0deg,#090b10 0%,rgba(9,11,16,.78) 24%,rgba(9,11,16,.05) 75%),linear-gradient(90deg,rgba(9,11,16,.46),transparent 80%),url("${image(featured.backdrop||featured.poster)}")`}}>
          <div className="nuvio-featured-content"><span className="nuvio-eyebrow"><i/> FEATURED FOR YOU</span><div className="nuvio-featured-type">{featured.type.toUpperCase()} · {featured.year||"NEW"}</div><h1>{featured.title}</h1><p>{featured.overview||"Explore your catalogue and discover your next favourite."}</p><div className="nuvio-featured-actions"><button className="nuvio-primary-action" onClick={()=>setSelected(featured)}><Play size={17} fill="currentColor"/> View details</button><button className="nuvio-round-action" aria-label="Add to My List" onClick={()=>toggleWatchlist(featured)}><Plus size={19}/></button></div></div>
          <div className="nuvio-hero-pagination"><i className="active"/><i/><i/><i/></div>
        </section>:<section className="nuvio-featured nuvio-featured-empty"><div className="nuvio-featured-content"><span className="nuvio-eyebrow"><i/> YOUR LIBRARY</span><h1>Your next story starts here.</h1><p>{catalogBusy?"Loading your catalogue…":"Connect a catalogue manifest to start exploring."}</p></div></section>}
        <div className="nuvio-home-content">
          {catalogBusy&&<div className="nuvio-loading"><span/> Loading your library</div>}
          {movieItems.length>0&&shelf("Popular movies",movieItems)}
          {seriesItems.length>0&&shelf("Popular series",seriesItems)}
          {animeItems.length>0&&shelf("Anime",animeItems)}
          {catalog.length>0&&shelf("Recently added",catalog.slice().reverse())}
          {!catalogBusy&&!catalog.length&&<div className="nuvio-empty-library"><Film size={25}/><strong>Your catalogue is empty</strong><span>{notice||"Titles from your configured manifest will appear here."}</span></div>}
        </div>
      </>}

      {active==="Search"&&<section className="nuvio-browse-screen"><div className="nuvio-page-title"><span>DISCOVER</span><h1>Search</h1><p>Find something worth watching.</p></div><div className="nuvio-search-box"><Search size={19}/><input autoFocus placeholder="Movies, series, genres…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery("")} aria-label="Clear search"><X size={17}/></button>}</div><div className="nuvio-filter-row"><div className="filter-pills">{["all","movie","series","anime"].map(v=><button key={v} className={type===v?"category-chip selected":"category-chip"} onClick={()=>setType(v)}>{v==="all"?"All":v==="movie"?"Movies":v==="series"?"Series":"Anime"}</button>)}</div><label className="nuvio-genre-select"><ListFilter size={14}/><select aria-label="Filter by genre" value={genre} onChange={e=>setGenre(e.target.value)}><option value="all">All genres</option>{genres.map(g=><option key={g} value={g}>{g}</option>)}</select></label></div>{catalogBusy||remoteSearchBusy?<div className="nuvio-loading"><span/> {remoteSearchBusy?"Searching your catalogues":"Loading catalogue"}</div>:catalogueGrid}</section>}

      {active==="Library"&&<section className="nuvio-browse-screen"><div className="nuvio-page-title"><span>YOUR SPACE</span><h1>Library</h1><p>Saved titles, ready when you are.</p></div><div className="nuvio-library-tabs"><button className="selected">My List <b>{savedIds.length}</b></button><button onClick={()=>setProfileOpen(true)}>{currentProfile.name}</button></div>{catalogBusy?<div className="nuvio-loading"><span/> Loading library</div>:<div className="nuvio-grid">{visibleCatalog.filter(item=>savedIds.includes(item.id)).map(item=><PosterCard key={item.id} item={item} onSelect={setSelected}/>) }{!savedIds.length&&<div className="nuvio-empty-library"><Bookmark size={25}/><strong>Your list is waiting</strong><span>Save titles from their detail page and they will show up here.</span></div>}</div>}</section>}

      {active==="Settings"&&<section className="nuvio-browse-screen nuvio-settings-screen"><div className="nuvio-page-title"><span>PERSONALISE</span><h1>Settings</h1><p>Your Nuvio experience.</p></div><button className="nuvio-setting-row" onClick={()=>setProfileOpen(true)}><span className="nuvio-setting-avatar" style={{background:currentProfile.color}}>{currentProfile.name.slice(0,1).toUpperCase()}</span><span><strong>Profiles</strong><small>Manage profiles and personal lists</small></span><ChevronRight size={18}/></button><div className="nuvio-setting-row static"><span className="nuvio-setting-icon"><Library size={19}/></span><span><strong>Catalogue</strong><small>{catalog.length} titles loaded from your manifest</small></span><span className="nuvio-setting-status">{catalogBusy?"Loading":"Synced"}</span></div><div className="nuvio-setting-row static"><span className="nuvio-setting-icon"><Film size={19}/></span><span><strong>Playback</strong><small>Uses only playback URLs supplied by your source</small></span></div><div className="nuvio-about"><span className="nuvio-about-mark">n</span><strong>Nuvio</strong><small>Web experience · Built around the Nuvio mobile interface</small></div></section>}
    </div>

    <nav className="nuvio-bottom-nav" aria-label="Main navigation">{navItems.map(({label,icon:Icon})=><button key={label} className={active===label?"nuvio-nav-item active":"nuvio-nav-item"} onClick={()=>selectNav(label)}><span className="nuvio-nav-icon"><Icon size={20} strokeWidth={active===label?2.35:1.8}/></span><span>{label}</span></button>)}</nav>
    {modal}
  </main>;
}
