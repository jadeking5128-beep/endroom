import "server-only";
import { createHmac, randomBytes, pbkdf2, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "altbrain_session";
const SESSION_SECONDS = 60 * 60 * 12;

function base64url(input: Buffer | Uint8Array) {
  return Buffer.from(input).toString("base64url");
}

function sessionSecret() {
  const value = process.env.ALTBRAIN_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("Altbrain session secret is not configured.");
  return value;
}

export async function verifyMainPassword(password: string) {
  const encoded = process.env.ALTBRAIN_PASSWORD_HASH;
  if (!encoded) throw new Error("Altbrain main password is not configured.");
  const [scheme, iterationsText, saltText, hashText] = encoded.split("$");
  if (scheme !== "pbkdf2" || !iterationsText || !saltText || !hashText) throw new Error("Altbrain password hash has an invalid format.");
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 600_000 || iterations > 1_000_000) throw new Error("Altbrain password hash has an invalid iteration count.");
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  if (salt.length < 16 || expected.length !== 32) throw new Error("Altbrain password hash has an invalid format.");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    pbkdf2(password, salt, iterations, 32, "sha256", (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
  return timingSafeEqual(actual, expected);
}

export function createSessionCookie(response: NextResponse) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${expires}.${base64url(randomBytes(24))}`;
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  response.cookies.set(SESSION_COOKIE, `${payload}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
}

export function hasValidSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiresText, nonce, suppliedSignature] = parts;
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000) || !nonce || !suppliedSignature) return false;
  try {
    const expected = createHmac("sha256", sessionSecret()).update(`${expiresText}.${nonce}`).digest();
    const supplied = Buffer.from(suppliedSignature, "base64url");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
