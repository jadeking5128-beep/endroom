"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import BrainScene from "./brain-scene";

type Thought = { id: string; title: string; body: string; createdAt: number; x: number; y: number; links: string[]; sourceText?: string; parentId?: string; role?: "memory" | "detail"; connectionReasons?: Record<string, string> };
type AiResult = { parent: { title: string; content: string }; points: { title: string; content: string; source_excerpt?: string }[]; parentConnections: { existing_thought_id: string; reason: string }[]; connections: { from_point_index: number; to_point_index: number; existing_thought_id: string; reason: string }[] };
type Vault = { version: 1; thoughts: Thought[] };
type StoredVault = { salt: string; iv: string; data: string; version: 1 };
type RecallState = { query: string; ids: string[]; links: string[]; matches: { id: string; title: string; excerpt: string }[] };

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

async function seal(vault: Vault, key: CryptoKey, salt: Uint8Array): Promise<StoredVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(vault)));
  return { version: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(data)) };
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
  const [serverAuthenticated, setServerAuthenticated] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [vault, setVault] = useState<Vault | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [aiError, setAiError] = useState("");
  const [recallQuery, setRecallQuery] = useState("");
  const [recall, setRecall] = useState<RecallState | null>(null);


  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredVault;
        if (parsed.version === 1 && parsed.salt && parsed.iv && parsed.data) setStored(parsed);
      }
    } catch { setError("This browser could not read the local vault."); }
    fetch("/api/auth/session", { cache: "no-store" })
      .then(response => response.ok ? response.json() : { authenticated: false })
      .then(result => setServerAuthenticated(result.authenticated === true))
      .catch(() => setServerAuthenticated(false))
      .finally(() => setReady(true));
  }, []);

  const thoughts = vault?.thoughts ?? [];
  const selectedThought = thoughts.find(t => t.id === selected) ?? null;

  useEffect(() => { setRecall(null); }, [thoughts]);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 10) { setError("Use at least 10 characters for your main password."); return; }
    try {
      if (!serverAuthenticated) {
        const authResponse = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
        const authPayload = await authResponse.json();
        if (!authResponse.ok) throw new Error(authPayload.error || "Main password authentication failed.");
        setServerAuthenticated(true);
      }
      let salt: Uint8Array;
      let key: CryptoKey;
      if (stored) {
        salt = fromB64(stored.salt);
        const decoded = await openVault(stored, password);
        key = await deriveKey(password, salt);
        setVault(decoded);
      } else {
        salt = crypto.getRandomValues(new Uint8Array(16));
        key = await deriveKey(password, salt);
        const fresh: Vault = { version: 1, thoughts: initialThoughts };
        const encrypted = await seal(fresh, key, salt);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
        setStored(encrypted);
        setVault(fresh);
      }
      setVaultKey(key);
      setPassword("");
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That password did not unlock this vault. Nothing was changed.");
    }
  }

  async function persist(next: Vault) {
    if (!vaultKey || !stored) return;
    const encrypted = await seal(next, vaultKey, fromB64(stored.salt));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
    setStored(encrypted);
    setVault(next);
  }

  function lock() {
    fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setServerAuthenticated(false);
    setUnlocked(false);
    setVault(null);
    setVaultKey(null);
    setSelected(null);
    setEditing(false);
    setRecall(null);
    setRecallQuery("");
  }

  async function addThought(e?: FormEvent) {
    e?.preventDefault();
    const value = draft.trim();
    if (!value || !vault || isAnalysing) return;
    setIsAnalysing(true);
    setAiError("");
    setRecall(null);
    setRecallQuery("");
    setSelected(null);
    try {
      const response = await fetch("/api/groq/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: value,
          existingThoughts: thoughts.slice(0, 80).map(({ id, title, body }) => ({ id, title, body: body.slice(0, 500) }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Groq analysis failed.");
      const result = payload as AiResult;
      if (!result.parent?.title || !result.parent?.content || !Array.isArray(result.points) || result.points.length === 0) {
        throw new Error("The paragraph could not be structured into one memory and its details.");
      }

      const now = Date.now();
      const parentId = makeId();
      const groupAngle = (thoughts.length * 2.399) - Math.PI / 2;
      const groupRadius = 190 + (Math.floor(thoughts.length / 6) * 72);
      const groupX = Math.cos(groupAngle) * groupRadius;
      const groupY = Math.sin(groupAngle) * groupRadius;
      const parentTitle = value.split(/\s+/).slice(0, 9).join(" ").slice(0, 90);
      const parent: Thought = {
        id: parentId,
        title: parentTitle || "Captured paragraph",
        body: value,
        createdAt: now,
        x: groupX,
        y: groupY,
        links: [],
        sourceText: value,
        role: "memory",
        connectionReasons: {}
      };

      const points: Thought[] = result.points.slice(0, 40).map((point, index) => {
        const angle = (index * 2.399) - Math.PI / 2;
        const radius = 76 + (Math.floor(index / 8) * 34);
        return {
          id: makeId(),
          title: (point.source_excerpt || point.content).split(/\s+/).slice(0, 8).join(" ").slice(0, 100),
          body: (point.source_excerpt || point.content).slice(0, 4000),
          sourceText: (point.source_excerpt || point.content).slice(0, 4000),
          createdAt: now + index + 1,
          x: groupX + Math.cos(angle) * radius,
          y: groupY + Math.sin(angle) * radius,
          links: [parentId],
          parentId,
          role: "detail",
          connectionReasons: { [parentId]: "Detail extracted from this unified paragraph memory." }
        };
      });

      for (const point of points) {
        parent.links.push(point.id);
        parent.connectionReasons![point.id] = "This point preserves a specific detail from the original paragraph.";
      }

      const existingIds = new Set(thoughts.map(item => item.id));
      for (const connection of result.parentConnections || []) {
        if (!existingIds.has(connection.existing_thought_id)) continue;
        const targetId = connection.existing_thought_id;
        if (!parent.links.includes(targetId)) parent.links.push(targetId);
        parent.connectionReasons![targetId] = "AI-SUGGESTED LINK — " + connection.reason.slice(0, 250);
      }

      for (const connection of result.connections || []) {
        const from = points[connection.from_point_index];
        if (!from) continue;
        let targetId = "";
        if (Number.isInteger(connection.to_point_index) && connection.to_point_index >= 0 && connection.to_point_index < points.length) {
          targetId = points[connection.to_point_index].id;
        } else if (existingIds.has(connection.existing_thought_id)) {
          targetId = connection.existing_thought_id;
        }
        if (!targetId || targetId === from.id || targetId === parentId) continue;
        if (!from.links.includes(targetId)) from.links.push(targetId);
        from.connectionReasons![targetId] = "AI-SUGGESTED LINK — " + connection.reason.slice(0, 250);
        const target = points.find(item => item.id === targetId);
        if (target && !target.links.includes(from.id)) target.links.push(from.id);
        if (target) target.connectionReasons![from.id] = "AI-SUGGESTED LINK — " + connection.reason.slice(0, 250);
      }

      await persist({ ...vault, thoughts: [...thoughts, parent, ...points] });
      setDraft("");
      setSelected(parentId);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Could not analyse this paragraph.");
    } finally {
      setIsAnalysing(false);
    }
  }

  function findMemory(e?: FormEvent) {
    e?.preventDefault();
    const query = recallQuery.trim();
    if (!query) { setRecall(null); return; }
    const terms = query.toLocaleLowerCase().split(/[^\\p{L}\\p{N}]+/u).filter(term => term.length > 1);
    if (!terms.length) { setRecall(null); return; }
    const scored = thoughts.map(thought => {
      const title = thought.title.toLocaleLowerCase();
      const body = thought.body.toLocaleLowerCase();
      const source = (thought.sourceText || "").toLocaleLowerCase();
      const all = `${title} ${body} ${source}`;
      const matched = terms.filter(term => all.includes(term));
      const titleMatches = terms.filter(term => title.includes(term)).length;
      const score = matched.length + titleMatches * 1.5 + (all.includes(query.toLocaleLowerCase()) ? 3 : 0);
      return { thought, score, matched };
    }).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || b.thought.createdAt - a.thought.createdAt)
      .slice(0, 8);
    if (!scored.length) {
      setRecall({ query, ids: [], links: [], matches: [] });
      return;
    }
    const matchedIds = new Set(scored.map(item => item.thought.id));
    const directIds = new Set(matchedIds);
    const linkKeys = new Set<string>();
    for (const item of scored) {
      if (item.thought.parentId) {
        directIds.add(item.thought.parentId);
        linkKeys.add([item.thought.id, item.thought.parentId].sort().join(":"));
      }
      for (const linkId of item.thought.links) {
        if (directIds.has(linkId)) linkKeys.add([item.thought.id, linkId].sort().join(":"));
      }
    }
    const matches = scored.map(({ thought, matched }) => ({
      id: thought.id,
      title: thought.title,
      excerpt: thought.body.length > 190 ? `${thought.body.slice(0, 187)}…` : thought.body || `Matched in original source: ${matched.join(", ")}`
    }));
    setRecall({ query, ids: [...directIds], links: [...linkKeys], matches });
    setSelected(null);
    setEditing(false);
  }

  async function saveEdit() {
    if (!vault || !selectedThought) return;
    setRecall(null);
    const next = { ...vault, thoughts: thoughts.map(t => t.id === selectedThought.id ? { ...t, title: editTitle.trim() || "Untitled thought", body: editBody } : t) };
    await persist(next);
    setEditing(false);
  }

  async function deleteSelected() {
    if (!vault || !selectedThought || selectedThought.id === "origin") return;
    setRecall(null);
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

  const graphThoughts = useMemo(() => thoughts.filter(t => t.id !== "origin"), [thoughts]);

  if (!ready) return <main className="shell" />;
  if (!unlocked) return (
    <main className="shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">✳</span> ALTBRAIN</div><div className="top-meta"><span><i className="secure-dot"/>ENCRYPTED VAULT</span></div></header>
      <div className="overlay">
        <form className="lock-card" onSubmit={unlock}>
          <div className="lock-icon">✳</div>
          <div className="eyebrow">PRIVATE KNOWLEDGE SPACE</div>
          <h2>Tyler&apos;s Brain</h2>
          <p>{stored ? "Enter your main password to unlock your private vault." : "Set your main password in Vercel first. This same password unlocks your encrypted vault."}</p>
          <input type="password" autoComplete="current-password" placeholder="Main password · no username" value={password} onChange={e => setPassword(e.target.value)} minLength={10} required autoFocus />
          <button className="gold-button" type="submit">{stored ? "UNLOCK YOUR BRAIN" : "CREATE PRIVATE VAULT"}</button>
          {error && <p className="error">{error}</p>}
          <p className="lock-note">OWNER-ONLY SESSION · AES-256-GCM VAULT ENCRYPTION</p>
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
        <div className="graph-wrap">
          <BrainScene thoughts={thoughts} selected={selected} highlightedIds={recall?.ids ?? []} highlightedLinks={recall?.links ?? []} onSelect={(id) => { setRecall(null); setSelected(id); setEditing(false); }} />
          <div className="graph-hint">CONNECTED THOUGHTS · DRAG TO ROTATE · PINCH TO ZOOM</div>
        </div>
        <div className="recall">
          <form className="recall-box" onSubmit={findMemory}>
            <span className="recall-mark">⌕</span>
            <input value={recallQuery} onChange={e => { setRecallQuery(e.target.value); setRecall(null); }} placeholder="Ask your memories · find a detail, person, or idea…" aria-label="Search your memories" />
            <button type="submit" disabled={!recallQuery.trim()}>FIND MEMORY</button>
            {recall && <button type="button" className="recall-clear" onClick={() => { setRecall(null); setRecallQuery(""); }} aria-label="Clear memory recall">×</button>}
          </form>
          {recall && <div className="recall-results">
            <div className="recall-heading"><span>DIRECT TEXT MATCHES · NO AI GUESSES</span><span>{recall.matches.length} FOUND · TEMPORARY</span></div>
            {recall.matches.length ? recall.matches.map(match => <button key={match.id} className="recall-result" onClick={() => { setRecall(null); setSelected(match.id); setEditing(false); }}>
              <strong>{match.title}</strong><span>{match.excerpt}</span>
            </button>) : <p className="recall-empty">No matching stored memories were found. Nothing was generated or added.</p>}
          </div>}
        </div>
        <div className="capture">
          <form className="capture-box" onSubmit={addThought}><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Drop a paragraph, idea, or collection of thoughts…" aria-label="Paragraph to structure" rows={2} disabled={isAnalysing} /><button className="capture-button" disabled={!draft.trim() || isAnalysing} type="submit">{isAnalysing ? "ANALYSING…" : "BUILD ONE MEMORY ↗"}</button></form>{aiError && <div className="error ai-error">{aiError}</div>}
          <div className="quick-row"><button className="quick" onClick={() => { setRecall(null); setSelected("origin"); }}>⌘ CENTRE NODE</button><button className="quick" onClick={() => { setRecall(null); setDraft("An idea: "); document.querySelector<HTMLTextAreaElement>(".capture-box textarea")?.focus(); }}>＋ NEW IDEA</button><button className="quick" onClick={() => { setRecall(null); setSelected(graphThoughts[0]?.id ?? "origin"); }}>◉ EXPLORE</button></div>
        </div>
      </section>
      <div className="bottomline"><span>{thoughts.length} THOUGHTS STORED</span><span>ENCRYPTED ON THIS DEVICE</span></div>
      {selectedThought && <aside className="detail">
        <div className="detail-top"><span className="detail-type">{selectedThought.id === "origin" ? "THE CORE" : selectedThought.role === "detail" ? "EXTRACTED SOURCE DETAIL" : "ORIGINAL MEMORY · UNIFIED NODE"}</span><button className="icon-button" onClick={() => { setRecall(null); setSelected(null); setEditing(false); }} aria-label="Close thought">×</button></div>
        {editing ? <><input value={editTitle} onChange={e => setEditTitle(e.target.value)} aria-label="Thought title" style={{ background: "#090909", color: "#eee", border: "1px solid var(--line)", padding: 11, borderRadius: 8, marginTop: 25 }}/><textarea value={editBody} onChange={e => setEditBody(e.target.value)} aria-label="Thought content" style={{ flex: 1, resize: "none", background: "#090909", color: "#ddd", border: "1px solid var(--line)", padding: 12, borderRadius: 8, marginTop: 10 }}/><div className="detail-actions"><button className="gold-button" onClick={saveEdit}>SAVE CHANGES</button><button className="ghost-button" onClick={() => setEditing(false)}>CANCEL</button></div></> : <>
          <h2>{selectedThought.title}</h2><div className="detail-body">{selectedThought.body}</div><div className="detail-meta">SAVED {new Date(selectedThought.createdAt).toLocaleString()} · {selectedThought.links.length} CONNECTIONS</div>{selectedThought.sourceText && <div className="detail-source"><span className="detail-type">{selectedThought.role === "detail" ? "EXACT SOURCE EXCERPT" : "ORIGINAL PARAGRAPH · PRESERVED"}</span><p>{selectedThought.sourceText}</p></div>}{selectedThought.connectionReasons && Object.keys(selectedThought.connectionReasons).length > 0 && <div className="detail-source"><span className="detail-type">AI-SUGGESTED LINKS · NOT VERIFIED FACTS</span>{Object.entries(selectedThought.connectionReasons).map(([id, reason]) => <p key={id}>{thoughts.find(item => item.id === id)?.title || "Related point"} — {reason}</p>)}</div>}
          <div className="detail-actions"><button className="ghost-button" onClick={beginEdit}>EDIT THOUGHT</button>{selectedThought.id !== "origin" && <button className="ghost-button" onClick={deleteSelected}>DELETE</button>}</div>
        </>}
      </aside>}
    </main>
  );
}