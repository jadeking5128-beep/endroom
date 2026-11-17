import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout } from "node:process";

if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
  throw new Error("Run this script in an interactive local terminal.");
}
async function hidden(prompt) {
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  return await new Promise((resolve,reject) => {
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
      resolve(value);
    };
    const onData = chunk => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u007f" || char === "\b") {
          value = Array.from(value).slice(0,-1).join("");
          continue;
        }
        if (char >= " ") value += char;
      }
    };
    stdin.on("data",onData);
  });
}
const first = await hidden("New ENDROOM password (hidden): ");
if (first.length < 12) throw new Error("Use at least 12 characters.");
const second = await hidden("Confirm password (hidden): ");
if (first !== second) throw new Error("Passwords did not match.");
const salt = randomBytes(16);
const hash = scryptSync(first,salt,64);
console.log("\nENDROOM_PASSWORD_HASH=scrypt$"+salt.toString("base64url")+"$"+hash.toString("base64url"));
console.log("Add the value to Vercel as a server-only environment variable. Do not commit it.");
