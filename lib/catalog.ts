export type MediaItem = {
  id: string;
  metaId?: string;
  title: string;
  overview: string;
  year: number;
  type: "movie" | "series" | "anime";
  genres: string[];
  rating: number;
  runtime?: string;
  seasons?: number;
  poster: string;
  backdrop: string;
  source: string;
  streamUrl?: string;
  subtitles?: { src: string; lang: string; label: string }[];
  drm?: { keySystem: "com.widevine.alpha" | "com.microsoft.playready"; licenseServer: string };
};

export const starterCatalog: MediaItem[] = [
  { id:"sample-quiet-between", title:"The Quiet Between", overview:"A small coastal town becomes the centre of an unexpected mystery.", year:2025, type:"movie", genres:["Drama","Mystery"], rating:7.8, runtime:"1h 48m", poster:"photo-1489599849927-2ee91cede3ba", backdrop:"photo-1478720568477-152d9b164e26", source:"Nuvio preview" },
  { id:"sample-after-signal", title:"After the Signal", overview:"A distant transmission changes the course of a routine space mission.", year:2024, type:"movie", genres:["Science Fiction","Thriller"], rating:8.1, runtime:"2h 06m", poster:"photo-1517604931442-7e0c8ed2963c", backdrop:"photo-1462331940025-496dfbfc7564", source:"Nuvio preview" },
  { id:"sample-blue-hour", title:"Blue Hour", overview:"Two investigators revisit a case that refuses to stay in the past.", year:2025, type:"series", genres:["Mystery","Crime"], rating:8.4, seasons:2, poster:"photo-1440404653325-ab127d49abc1", backdrop:"photo-1519608487953-e999c86e7455", source:"Nuvio preview" },
  { id:"sample-northbound", title:"Northbound", overview:"An unlikely group takes the long way home across a changing landscape.", year:2023, type:"movie", genres:["Adventure","Drama"], rating:7.5, runtime:"2h 11m", poster:"photo-1478720568477-152d9b164e26", backdrop:"photo-1500530855697-b586d89ba3ee", source:"Nuvio preview" },
  { id:"sample-last-frame", title:"The Last Frame", overview:"A photographer discovers a clue hidden in a collection of old negatives.", year:2025, type:"movie", genres:["Thriller","Mystery"], rating:7.9, runtime:"1h 51m", poster:"photo-1485846234645-a62644f84728", backdrop:"photo-1518837695005-2083093ee35b", source:"Nuvio preview" },
  { id:"sample-parallel", title:"Parallel", overview:"A family finds that every choice leaves a different kind of echo.", year:2025, type:"series", genres:["Science Fiction","Drama"], rating:8.6, seasons:2, poster:"photo-1518837695005-2083093ee35b", backdrop:"photo-1462331940025-496dfbfc7564", source:"Nuvio preview" },
  { id:"sample-low-orbit", title:"Low Orbit", overview:"A quiet observatory receives an impossible signal from beyond the solar system.", year:2025, type:"movie", genres:["Science Fiction"], rating:8.0, runtime:"1h 57m", poster:"photo-1462331940025-496dfbfc7564", backdrop:"photo-1519608487953-e999c86e7455", source:"Nuvio preview" },
  { id:"sample-glasshouse", title:"Glasshouse", overview:"A new arrival unsettles the carefully controlled residents of a remote estate.", year:2024, type:"series", genres:["Drama","Thriller"], rating:7.7, seasons:1, poster:"photo-1519608487953-e999c86e7455", backdrop:"photo-1440404653325-ab127d49abc1", source:"Nuvio preview" },
  { id:"sample-wild-current", title:"Wild Current", overview:"A field team documents a wilderness that is rapidly changing.", year:2024, type:"movie", genres:["Documentary","Adventure"], rating:7.6, runtime:"1h 42m", poster:"photo-1500530855697-b586d89ba3ee", backdrop:"photo-1518837695005-2083093ee35b", source:"Nuvio preview" },
  { id:"sample-night-archive", title:"Night Archive", overview:"An archivist uncovers a connected series of stories in an abandoned collection.", year:2025, type:"series", genres:["Mystery","Drama"], rating:8.2, seasons:3, poster:"photo-1518709268805-4e9042af9f23", backdrop:"photo-1485846234645-a62644f84728", source:"Nuvio preview" },
  { id:"sample-skyline", title:"Skyline Protocol", overview:"A citywide systems failure forces strangers to work together.", year:2026, type:"anime", genres:["Anime","Action","Science Fiction"], rating:8.3, seasons:1, poster:"photo-1519608487953-e999c86e7455", backdrop:"photo-1462331940025-496dfbfc7564", source:"Nuvio preview" },
  { id:"sample-moonlit", title:"Moonlit Letters", overview:"A gentle story told through messages that arrive years late.", year:2024, type:"anime", genres:["Anime","Romance","Drama"], rating:8.7, seasons:1, poster:"photo-1440404653325-ab127d49abc1", backdrop:"photo-1485846234645-a62644f84728", source:"Nuvio preview" }
];

export function normalizeImportedItem(value: unknown, sourceName: string): MediaItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== "string" || !item.title.trim()) return null;
  const title = item.title.trim().slice(0, 120);
  const type = item.type === "series" || item.type === "anime" ? item.type : "movie";
  const genres = Array.isArray(item.genres) ? item.genres.filter((g): g is string => typeof g === "string").slice(0, 8) : [];
  const poster = typeof item.poster === "string" && /^photo-[\w-]+$/.test(item.poster) ? item.poster : "photo-1489599849927-2ee91cede3ba";
  const year = typeof item.year === "number" && item.year >= 1888 && item.year <= 2100 ? item.year : new Date().getFullYear();
  const rating = typeof item.rating === "number" ? Math.max(0, Math.min(10, item.rating)) : 0;
  const safeHttps = (value: unknown): string | undefined => { if (typeof value !== "string") return undefined; try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; } };
  const streamUrl = safeHttps(item.streamUrl);
  const subtitles = Array.isArray(item.subtitles) ? item.subtitles.slice(0, 8).flatMap((track) => { if (!track || typeof track !== "object") return []; const row = track as Record<string, unknown>; const src = safeHttps(row.src); if (!src) return []; return [{ src, lang: typeof row.lang === "string" ? row.lang.slice(0, 12) : "en", label: typeof row.label === "string" ? row.label.slice(0, 40) : "Subtitle" }]; }) : undefined;
  const drmInput = item.drm && typeof item.drm === "object" ? item.drm as Record<string, unknown> : null;
  const licenseServer = safeHttps(drmInput?.licenseServer);
  const keySystem = drmInput?.keySystem;
  const drm: MediaItem["drm"] = licenseServer && (keySystem === "com.widevine.alpha" || keySystem === "com.microsoft.playready") ? { keySystem: keySystem as "com.widevine.alpha" | "com.microsoft.playready", licenseServer } : undefined;
  return { id: "import-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.random().toString(36).slice(2,7), title, overview: typeof item.overview === "string" ? item.overview.slice(0, 500) : "Imported from your local catalogue.", year, type, genres, rating, poster, backdrop: poster, source: sourceName, ...(streamUrl ? { streamUrl } : {}), ...(subtitles?.length ? { subtitles } : {}), ...(drm ? { drm } : {}) };
}
