"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import BrainScene from "./brain-scene";

type Thought = { id: string; title: string; body: string; createdAt: number; x: number; y: number; links: string[]; sourceText?: string; connectionReasons?: Record<string, string> };
type AiResult = { nodes: { title: string; content: string }[]; connections: { from_node_index: number; to_node_index: number; existing_thought_id: string; reason: string }[] };
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


  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredVault;
        if (parsed.version === 1 && parsed.salt && parsed.iv && parsed.data) setStored(parsed);
      }
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
    } catch {
      setError("That passphrase did not unlock this vault. Nothing was changed.");
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
    setUnlocked(false);
    setVault(null);
    setVaultKey(null);
    setSelected(null);
    setEditing(false);

  }

  async function addThought(e?: FormEvent) {
    e?.preventDefault();
    const value = draft.trim();
    if (!value || !vault || isAnalysing) return;
    setIsAnalysing(true);
    setAiError("");
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
      if (!Array.isArray(result.nodes) || result.nodes.length === 0) throw new Error("No separate knowledge points were found. Try adding more detail.");
      const now = Date.now();
      const created = result.nodes.slice(0, 24).map((node, index) => {
        const angle = ((thoughts.length + index) * 2.399) - Math.PI / 2;
        const radius = 145 + (Math.floor((thoughts.length + index) / 7) * 48);
        return {
          id: makeId(),
          title: node.title.slice(0, 90),
          body: node.content.slice(0, 4000),
          createdAt: now + index,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          links: [] as string[],
          sourceText: value,
          connectionReasons: {} as Record<string, string>
        };
      });
      const existingIds = new Set(thoughts.map(item => item.id));
      for (const connection of result.connections || []) {
        const from = created[connection.from_node_index];
        if (!from) continue;
        let targetId = "";
        if (Number.isInteger(connection.to_node_index) && connection.to_node_index >= 0 && connection.to_node_index < created.length) {
          targetId = created[connection.to_node_index].id;
        } else if (existingIds.has(connection.existing_thought_id)) {
          targetId = connection.existing_thought_id;
        }
        if (!targetId || targetId === from.id) continue;
        if (!from.links.includes(targetId)) from.links.push(targetId);
        from.connectionReasons[targetId] = connection.reason.slice(0, 280);
        const target = created.find(item => item.id === targetId);
        if (target && !target.links.includes(from.id)) target.links.push(from.id);
        if (target) target.connectionReasons[from.id] = connection.reason.slice(0, 280);
      }
      if (created.length === 1 && !created[0].links.length) created[0].links.push("origin");
      await persist({ ...vault, thoughts: [...thoughts, ...created] });
      setDraft("");
      setSelected(created[0].id);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Could not analyse this paragraph.");
    } finally {
      setIsAnalysing(false);
    }
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
        <div className="graph-wrap">
          <BrainScene thoughts={thoughts} selected={selected} onSelect={(id) => { setSelected(id); setEditing(false); }} />
          <div className="graph-hint">CONNECTED THOUGHTS · DRAG TO ROTATE · PINCH TO ZOOM</div>
        </div>
        <div className="capture">
          <form className="capture-box" onSubmit={addThought}><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Drop a paragraph, idea, or collection of thoughts…" aria-label="Paragraph to structure" rows={2} disabled={isAnalysing} /><button className="capture-button" disabled={!draft.trim() || isAnalysing} type="submit">{isAnalysing ? "ANALYSING…" : "SPLIT + CONNECT ↗"}</button></form>{aiError && <div className="error ai-error">{aiError}</div>}
          <div className="quick-row"><button className="quick" onClick={() => setSelected("origin")}>⌘ CENTRE NODE</button><button className="quick" onClick={() => { setDraft("An idea: "); document.querySelector<HTMLInputElement>(".capture-box input")?.focus(); }}>＋ NEW IDEA</button><button className="quick" onClick={() => setSelected(graphThoughts[0]?.id ?? "origin")}>◉ EXPLORE</button></div>
        </div>
      </section>
      <div className="bottomline"><span>{thoughts.length} THOUGHTS STORED</span><span>ENCRYPTED ON THIS DEVICE</span></div>
      {selectedThought && <aside className="detail">
        <div className="detail-top"><span className="detail-type">{selectedThought.id === "origin" ? "THE CORE" : "THOUGHT NODE"}</span><button className="icon-button" onClick={() => { setSelected(null); setEditing(false); }} aria-label="Close thought">×</button></div>
        {editing ? <><input value={editTitle} onChange={e => setEditTitle(e.target.value)} aria-label="Thought title" style={{ background: "#090909", color: "#eee", border: "1px solid var(--line)", padding: 11, borderRadius: 8, marginTop: 25 }}/><textarea value={editBody} onChange={e => setEditBody(e.target.value)} aria-label="Thought content" style={{ flex: 1, resize: "none", background: "#090909", color: "#ddd", border: "1px solid var(--line)", padding: 12, borderRadius: 8, marginTop: 10 }}/><div className="detail-actions"><button className="gold-button" onClick={saveEdit}>SAVE CHANGES</button><button className="ghost-button" onClick={() => setEditing(false)}>CANCEL</button></div></> : <>
          <h2>{selectedThought.title}</h2><div className="detail-body">{selectedThought.body}</div><div className="detail-meta">SAVED {new Date(selectedThought.createdAt).toLocaleString()} · {selectedThought.links.length} CONNECTIONS</div>{selectedThought.sourceText && <div className="detail-source"><span className="detail-type">SOURCE PARAGRAPH</span><p>{selectedThought.sourceText}</p></div>}{selectedThought.connectionReasons && Object.keys(selectedThought.connectionReasons).length > 0 && <div className="detail-source"><span className="detail-type">WHY THESE CONNECT</span>{Object.entries(selectedThought.connectionReasons).map(([id, reason]) => <p key={id}>{thoughts.find(item => item.id === id)?.title || "Related point"} — {reason}</p>)}</div>}
          <div className="detail-actions"><button className="ghost-button" onClick={beginEdit}>EDIT THOUGHT</button>{selectedThought.id !== "origin" && <button className="ghost-button" onClick={deleteSelected}>DELETE</button>}</div>
        </>}
      </aside>}
    </main>
  );
}