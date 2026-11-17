import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });
try {
  const password = await rl.question("New ENDROOM password (input is visible in this local terminal): ");
  if (password.length < 12) throw new Error("Use at least 12 characters.");
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  console.log("\nENDROOM_PASSWORD_HASH=scrypt$" + salt.toString("base64url") + "$" + hash.toString("base64url"));
  console.log("Copy the hash value into the server-only Vercel environment variable. Do not commit it.");
} finally { rl.close(); }
