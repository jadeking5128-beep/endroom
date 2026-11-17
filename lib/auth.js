import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE = "endroom_session";
const TTL = 12 * 60 * 60;
function key() {
  const raw = process.env.SESSION_SECRET;
  if (!raw) throw new Error("SESSION_SECRET is not configured");
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
}
function cookieOptions(maxAge = TTL) {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export function setSession(res, payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now()/1000) + TTL }));
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  const token = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`);
}
export function clearSession(res) { res.setHeader("Set-Cookie", cookieOptions(0)); }
export function getSession(req) {
  const header = req.headers.cookie || "";
  const token = header.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  if (!token) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 30) return null;
    const iv = raw.subarray(0,12), tag = raw.subarray(12,28), data = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString());
    if (!payload.user || !payload.exp || payload.exp < Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch { return null; }
}
export function passwordMatches(password, encoded) {
  if (typeof encoded !== "string") return false;
  const [scheme, salt, expected] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  try {
    const actual = scryptSync(password, Buffer.from(salt,"base64url"), 64);
    const wanted = Buffer.from(expected,"base64url");
    return wanted.length === actual.length && timingSafeEqual(actual,wanted);
  } catch { return false; }
}
export function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
export function sendError(res, status, message) {
  res.status(status).json({ error: message });
}
