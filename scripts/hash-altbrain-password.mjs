import { randomBytes, pbkdf2Sync } from "node:crypto";
import { stdin, stdout } from "node:process";

if (!stdin.isTTY || !stdout.isTTY) {
  console.error("Run this script in an interactive terminal so the password can be entered without echoing.");
  process.exit(1);
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = chunk => {
      for (const char of chunk) {
        if (char === "\u0003") {
          stdin.setRawMode(false);
          stdin.pause();
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          stdin.removeListener("data", onData);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await readHidden("Choose your Altbrain main password (10+ characters): ");
const confirmation = await readHidden("Enter it again to confirm: ");
if (password.length < 10 || password.length > 256) {
  console.error("Password must be between 10 and 256 characters.");
  process.exit(1);
}
if (password !== confirmation) {
  console.error("The passwords did not match. No hash was created.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 600_000, 32, "sha256");
console.log("Copy this value into Vercel as ALTBRAIN_PASSWORD_HASH:");
console.log(`pbkdf2$600000${salt.toString("base64url")}${hash.toString("base64url")}`);
