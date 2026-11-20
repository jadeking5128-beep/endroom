"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";

type Thought = { id: string; title: string; body: string; createdAt: number; x: number; y: number; links: string[] };
type Vault = { version: 1; thoughts: Thought[] };
type StoredVault = { salt: string; iv: string; data: string; version: 1 };

const STORAGE_KEY = "altbrain.private.vault.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const initialThoughts: Thought[] = [
  { id: "origin", title: "The beginning", body: "This is the centre of Tyler's Brain. New thoughts will grow outward from here.", createdAt: Date.now(), x: 0, y: 0, links: [] },
  { id: "curiosity", title: "Curiosity", body: "Questions worth keeping. Ideas that might become something later.", createdAt: Date.now(), x: -178, y: -92, links: ["origin"] },
  { id: "patterns", title: "Patterns", body: "Connections between things that seem unrelated at first.", createdAt: Date.now(), x: 166, y: -105, links: ["origin"] },
  { id: "ideas", title: "Ideas", body: "A place for unfinished thoughts and possibilities.", createdAt: Date.now(), x: -198, y: 104, links: ["origin"] },
  { id: "reflection", title: "Reflection", body: "What changed, what mattered, and what to remember.", createdAt: Date.now(), x: 188, y: 104, links: ["origin"] },
  { id: "learning", title: "Learning", body: "Knowledge gathered over time, connected to its original context.", createdAt: Date.now(), x: 0, y: 188, links: ["origin", "ideas"] }
];

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function seal(vault: Vault, password: string, salt?: Uint8Array): Promise<StoredVault> {
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, actualSalt);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(vault)));
  return { version: 1, salt: toB64(actualSalt), iv: toB64(iv), data: toB64(new Uint8Array(data)) };
}

async function openVault(stored: StoredVault, password: string): Promise<Vault> {
  const key = await deriveKey(password, fromB64(stored.salt));
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(stored.iv) }, key, fromB64(stored.data));
  const parsed = JSON.parse(decoder.decode(clear)) as Vault;
  if (parsed.version !== 1 || !Array.isArray(parsed.thoughts)) throw new Error("Invalid vault");
  return parsed;
}

function makeId() { return crypto.randomUUID(); }

export default function Home() {
  const [stored, setStored] = useState<StoredVault | null>(null);
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [vault, setVault] = useState<Vault | null>(null);
  const [lockPassword, setLockPassword] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const graphRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredVault;
        if (parsed.version === 1 && parsed.salt && parsed.iv && parsed.data) setStored(parsed);
      } else setIsNew(true);
    } catch { setError("This browser could not read the local vault."); }
    setReady(true);
  }, []);

  const thoughts = vault?.thoughts ?? [];
  const selectedThought = thoughts.find(t => t.id === selected) ?? null;

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 10) { setError("Use at least 10 characters for your passphrase."); return; }
    try {
      if (stored) {
        const decoded = await openVault(stored, password);
        setVault(decoded);
      } else {
        const fresh: Vault = { version: 1, thoughts: initialThoughts };
        const encrypted = await seal(fresh, password);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
        setStored(encrypted);
        setVault(fresh);
      }
      setLockPassword(password);
      setPassword("");
      setUnlocked(true);
    } catch {
      setError("That passphrase did not unlock this vault. Nothing was changed.");
    }
  }

  async function persist(next: Vault) {
    if (!lockPassword) return;
    const encrypted = await seal(next, lockPassword, stored ? fromB64(stored.salt) : undefined);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
    setStored(encrypted);
    setVault(next);
  }

  function lock() {
    setUnlocked(false);
    setVault(null);
    setLockPassword("");
    setSelected(null);
    setEditing(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  async function addThought(e?: FormEvent) {
    e?.preventDefault();
    const value = draft.trim();
    if (!value || !vault) return;
    const title = value.length > 52 ? value.slice(0, 49).trimEnd() + "…" : value;
    const angle = (thoughts.length * 2.399) - Math.PI / 2;
    const radius = 135 + (Math.floor(thoughts.length / 7) * 48);
    const thought: Thought = { id: makeId(), title, body: value, createdAt: Date.now(), x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, links: ["origin"] };
    await persist({ ...vault, thoughts: [...thoughts, thought] });
    setDraft("");
    setSelected(thought.id);
  }

  async function saveEdit() {
    if (!vault || !selectedThought) return;
    const next = { ...vault, thoughts: thoughts.map(t => t.id === selectedThought.id ? { ...t, title: editTitle.trim() || "Untitled thought", body: editBody } : t) };
    await persist(next);
    setEditing(false);
  }

  async function deleteSelected() {
    if (!vault || !selectedThought || selectedThought.id === "origin") return;
    const nextThoughts = thoughts.filter(t => t.id !== selectedThought.id).map(t => ({ ...t, links: t.links.filter(id => id !== selectedThought.id) }));
    await persist({ ...vault, thoughts: nextThoughts });
    setSelected(null);
  }

  function beginEdit() {
    if (!selectedThought) return;
    setEditTitle(selectedThought.title);
    setEditBody(selectedThought.body);
    setEditing(true);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(".node")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    setOffset({ x: dragRef.current.ox + (e.clientX - dragRef.current.x), y: dragRef.current.oy + (e.clientY - dragRef.current.y) });
  }
  function onPointerUp() { dragRef.current = null; setDragging(false); }
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setScale(s => Math.max(.55, Math.min(2.3, s * (e.deltaY < 0 ? 1.08 : .92))));
  }

  const graphThoughts = useMemo(() => thoughts.filter(t => t.id !== "origin"), [thoughts]);
  const nodeRadius = (id: string) => id === "origin" ? 21 : 7.5;
  const svgTransform = `translate(450 270) translate(${offset.x} ${offset.y}) scale(${scale})`;

  if (!ready) return <main className="shell" />;
  if (!unlocked) return (
    <main className="shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">✳</span> ALTBRAIN</div><div className="top-meta"><span><i className="secure-dot"/>ENCRYPTED VAULT</span></div></header>
      <div className="overlay">
        <form className="lock-card" onSubmit={unlock}>
          <div className="lock-icon">✳</div>
          <div className="eyebrow">PRIVATE KNOWLEDGE SPACE</div>
          <h2>Tyler&apos;s Brain</h2>
          <p>{stored ? "Your encrypted vault is waiting. Enter your passphrase to open it." : "Create your private vault. Your passphrase encrypts everything before it is saved on this device."}</p>
          <input type="password" autoComplete="current-password" placeholder="Passphrase · no username" value={password} onChange={e => setPassword(e.target.value)} minLength={10} required autoFocus />
          <button className="gold-button" type="submit">{stored ? "UNLOCK YOUR BRAIN" : "CREATE PRIVATE VAULT"}</button>
          {error && <p className="error">{error}</p>}
          <p className="lock-note">AES-256-GCM · PBKDF2 · THIS DEVICE ONLY FOR NOW</p>
        </form>
      </div>
    </main>
  );

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✳</span> ALTBRAIN <span style={{ color: "#666" }}>/ TYLER</span></div>
        <div className="top-meta"><span><i className="secure-dot"/>VAULT UNLOCKED</span><button className="ghost-button" onClick={lock}>LOCK</button></div>
      </header>
      <section className="workspace">
        <div className="intro"><div className="eyebrow">A PRIVATE EXTENSION OF YOUR MIND</div><h1>What&apos;s on your mind?</h1><div className="subtitle">Every thought has a place. Every connection has a reason.</div></div>
        <div ref={graphRef} className={`graph-wrap ${dragging ? "dragging" : ""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
          <svg className="graph-svg" viewBox="0 0 900 540" role="img" aria-label="Interactive map of Tyler's thoughts">
            <g transform={svgTransform}>
              <circle className="center-halo" r="65"/><circle className="center-halo" r="90" strokeDasharray="2 8"/><circle className="center-glow" r="35"/>
              {thoughts.map(t => t.links.map(linkId => { const parent = thoughts.find(p => p.id === linkId); return parent ? <line key={t.id + linkId} className="edge" x1={parent.x} y1={parent.y} x2={t.x} y2={t.y}/> : null; }))}
              {thoughts.map((t, i) => (
                <g key={t.id} className={`node ${selected === t.id ? "selected" : ""}`} transform={`translate(${t.x} ${t.y})`} onClick={() => { setSelected(t.id); setEditing(false); }} tabIndex={0} role="button" aria-label={t.title} onKeyDown={e => { if (e.key === "Enter") setSelected(t.id); }}>
                  <circle r={nodeRadius(t.id) + 13} fill="transparent"/>
                  {t.id === "origin" ? <><circle className="center-core" r="22"/><text textAnchor="middle" dominantBaseline="central" fill="#d9c49e" fontSize="17">✳</text></> : <><circle className="node-ring" r={nodeRadius(t.id)}/><circle className="node-core" r="2.2"/></>}
                  <text className="node-label" x={t.x < -100 ? -12 : t.x > 100 ? 12 : 0} y={t.y < 0 ? -19 : 23} textAnchor={t.x < -100 ? "end" : t.x > 100 ? "start" : "middle"}>{t.title.slice(0, 23)}</text>
                </g>
              ))}
            </g>
          </svg>
          <div className="graph-hint">DRAG TO EXPLORE · SCROLL TO ZOOM · SELECT A THOUGHT</div>
        </div>
        <div className="capture">
          <form className="capture-box" onSubmit={addThought}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Catch a thought before it disappears…" aria-label="New thought" /><button className="capture-button" disabled={!draft.trim()} type="submit">CAPTURE ↗</button></form>
          <div className="quick-row"><button className="quick" onClick={() => setSelected("origin")}>⌘ THE CORE</button><button className="quick" onClick={() => { setDraft("An idea: "); document.querySelector<HTMLInputElement>(".capture-box input")?.focus(); }}>＋ NEW IDEA</button><button className="quick" onClick={() => setSelected(graphThoughts[0]?.id ?? "origin")}>◉ EXPLORE</button></div>
        </div>
      </section>
      <div className="bottomline"><span>{thoughts.length} THOUGHTS STORED</span><span>LOCAL ENCRYPTED VAULT · NO ACCOUNT</span></div>
      {selectedThought && <aside className="detail">
        <div className="detail-top"><span className="detail-type">{selectedThought.id === "origin" ? "THE CORE" : "THOUGHT NODE"}</span><button className="icon-button" onClick={() => { setSelected(null); setEditing(false); }} aria-label="Close thought">×</button></div>
        {editing ? <><input value={editTitle} onChange={e => setEditTitle(e.target.value)} aria-label="Thought title" style={{ background: "#090909", color: "#eee", border: "1px solid var(--line)", padding: 11, borderRadius: 8, marginTop: 25 }}/><textarea value={editBody} onChange={e => setEditBody(e.target.value)} aria-label="Thought content" style={{ flex: 1, resize: "none", background: "#090909", color: "#ddd", border: "1px solid var(--line)", padding: 12, borderRadius: 8, marginTop: 10 }}/><div className="detail-actions"><button className="gold-button" onClick={saveEdit}>SAVE CHANGES</button><button className="ghost-button" onClick={() => setEditing(false)}>CANCEL</button></div></> : <>
          <h2>{selectedThought.title}</h2><div className="detail-body">{selectedThought.body}</div><div className="detail-meta">SAVED {new Date(selectedThought.createdAt).toLocaleString()} · {selectedThought.links.length} CONNECTIONS</div>
          <div className="detail-actions"><button className="ghost-button" onClick={beginEdit}>EDIT THOUGHT</button>{selectedThought.id !== "origin" && <button className="ghost-button" onClick={deleteSelected}>DELETE</button>}</div>
        </>}
      </aside>}
    </main>
  );
}