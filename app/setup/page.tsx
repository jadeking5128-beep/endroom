"use client";

import { useState } from "react";

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export default function PasswordSetup() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [hash, setHash] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setHash("");
    setCopied(false);
    if (password.length < 10 || password.length > 256) {
      setError("Use a password between 10 and 256 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" }, material, 256);
      const derived = toBase64Url(new Uint8Array(bits));
      setHash("pbkdf2$600000$" + toBase64Url(salt) + "$" + derived);
      setPassword("");
      setConfirmation("");
    } catch {
      setError("This browser could not generate the password hash. Use the local script in SETUP.md.");
    } finally {
      setBusy(false);
    }
  }

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
    } catch {
      setError("Clipboard access was blocked. Select and copy the hash manually.");
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/">✳ ALTBRAIN</a>
        <div className="top-meta"><span>LOCAL PASSWORD SETUP</span></div>
      </header>
      <div className="overlay">
        <form className="lock-card" onSubmit={generate}>
          <div className="eyebrow">PRIVATE OWNER ACCESS</div>
          <h2>Generate main password hash</h2>
          <p>Your password is processed only in this browser. It is never sent to Altbrain or Groq from this page.</p>
          <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Choose main password" minLength={10} required />
          <input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Confirm main password" minLength={10} required />
          <button className="gold-button" type="submit" disabled={busy}>{busy ? "GENERATING…" : "GENERATE HASH"}</button>
          {error && <p className="error">{error}</p>}
          {hash && <div className="detail-source">
            <span className="detail-type">PASSWORD HASH · NOT YOUR PASSWORD</span>
            <textarea readOnly value={hash} rows={4} style={{ width: "100%", marginTop: 10, background: "#090909", color: "#d8c49e", border: "1px solid var(--line)", borderRadius: 8, padding: 10, overflowWrap: "anywhere" }} />
            <button className="gold-button" type="button" onClick={copyHash}>{copied ? "COPIED" : "COPY HASH"}</button>
            <p>Paste this hash into Vercel as the sensitive environment variable <strong>ALTBRAIN_PASSWORD_HASH</strong>, then redeploy. Never share the hash or raw password in chat.</p>
          </div>}
          <p className="lock-note">PBKDF2-SHA256 · 600,000 ITERATIONS · NO NETWORK REQUEST</p>
          <a className="ghost-button" href="/">BACK TO ALTBRAIN</a>
        </form>
      </div>
    </main>
  );
}
