import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://vrnhfhfndzqpqlzbuevs.supabase.co";
const SUPABASE_KEY = "sb_publishable_R1IhT9HiOORRhv9-preA7A_GH2pMXo0";
const AUTH_URL = `${SUPABASE_URL}/functions/v1/username-auth`;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const style = document.createElement("link");
style.rel = "stylesheet";
style.href = "/ryan-watch-auth.css";
document.head.append(style);

const root = document.createElement("section");
root.id = "rw-auth";
root.innerHTML = `
  <div class="rw-auth-panel">
    <div class="rw-mark">RW<span> / 01</span></div>
    <p class="rw-eyebrow">PRIVATE MEDIA SPACE</p>
    <h1>Ryan watch</h1>
    <p class="rw-copy">Your library, your watchlist, your space.</p>
    <div class="rw-tabs"><button type="button" data-mode="login" class="active">Sign in</button><button type="button" data-mode="signup">Create account</button></div>
    <form id="rw-form">
      <label for="rw-username">Username</label>
      <input id="rw-username" name="username" autocomplete="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+" placeholder="your_username" required>
      <label for="rw-password">Password</label>
      <input id="rw-password" name="password" type="password" autocomplete="current-password" minlength="10" maxlength="72" placeholder="At least 10 characters" required>
      <p class="rw-hint">3-24 letters, numbers, or underscores. Passwords must be at least 10 characters.</p>
      <p id="rw-error" role="alert" aria-live="polite"></p>
      <button class="rw-submit" type="submit">Continue <span>↗</span></button>
    </form>
    <p class="rw-foot">Accounts are secured by Supabase Auth.</p>
  </div>`;
document.body.append(root);

let mode = "login";
const form = root.querySelector("#rw-form");
const errorBox = root.querySelector("#rw-error");
const submit = root.querySelector(".rw-submit");

root.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    root.querySelectorAll("[data-mode]").forEach((item) => item.classList.toggle("active", item === button));
    root.querySelector("#rw-password").autocomplete = mode === "signup" ? "new-password" : "current-password";
    submit.innerHTML = mode === "signup" ? "Create account <span>↗</span>" : "Continue <span>↗</span>";
    errorBox.textContent = "";
  });
});

function showApp() {
  document.documentElement.classList.add("rw-authenticated");
  root.remove();
  if (!document.querySelector("#rw-account")) {
    const account = document.createElement("button");
    account.id = "rw-account";
    account.type = "button";
    account.textContent = "Account · Sign out";
    account.addEventListener("click", async () => {
      await supabase.auth.signOut();
      document.documentElement.classList.remove("rw-authenticated");
      document.body.append(root);
    });
    document.body.append(account);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";
  submit.disabled = true;
  submit.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
  const username = form.elements.username.value.trim().toLowerCase();
  const password = form.elements.password.value;
  try {
    const result = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ action: mode, username, password }),
    });
    const payload = await result.json();
    if (!result.ok) throw new Error(payload.error || "Unable to sign in.");
    const { error } = await supabase.auth.setSession({
      access_token: payload.session.access_token,
      refresh_token: payload.session.refresh_token,
    });
    if (error) throw error;
    showApp();
  } catch (error) {
    errorBox.textContent = error instanceof Error ? error.message : "Authentication failed.";
  } finally {
    submit.disabled = false;
    submit.innerHTML = mode === "signup" ? "Create account <span>↗</span>" : "Continue <span>↗</span>";
  }
});

const { data: { session } } = await supabase.auth.getSession();
if (session) showApp();
supabase.auth.onAuthStateChange((_event, session) => {
  if (session && document.getElementById("rw-auth")) showApp();
  if (!session && !document.getElementById("rw-auth")) {
    document.documentElement.classList.remove("rw-authenticated");
    document.body.append(root);
  }
});
