import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://vrnhfhfndzqpqlzbuevs.supabase.co";
const SUPABASE_KEY = "sb_publishable_R1IhT9HiOORRhv9-preA7A_GH2pMXo0";
const API_URL = `${SUPABASE_URL}/functions/v1/admin-api`;
const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const style = document.createElement("link");
style.rel = "stylesheet";
style.href = "/ryan-watch-admin.css";
document.head.append(style);

let launcher;
let panel;
let currentSession;

async function api(action, extra = {}) {
  if (!currentSession?.access_token) throw new Error("Sign in again to continue.");
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${currentSession.access_token}`,
    },
    body: JSON.stringify({ action, ...extra }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Admin request failed.");
  return payload;
}

function closePanel() {
  panel?.remove();
  panel = null;
}

function renderUsers(users) {
  const list = panel.querySelector(".rw-admin-users");
  list.replaceChildren();
  for (const user of users) {
    const row = document.createElement("article");
    row.className = "rw-admin-user";
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = user.username;
    const meta = document.createElement("small");
    meta.textContent = `${user.role === "admin" ? "Administrator" : "Standard user"} · Joined ${new Date(user.created_at).toLocaleDateString()}`;
    details.append(name, meta);
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = user.role === "admin" ? "Remove admin" : "Make admin";
    control.disabled = user.user_id === currentSession.user.id;
    control.addEventListener("click", async () => {
      control.disabled = true;
      try {
        await api("set_role", { user_id: user.user_id, role: user.role === "admin" ? "user" : "admin" });
        await loadUsers();
      } catch (error) {
        panel.querySelector(".rw-admin-status").textContent = error.message;
      } finally {
        control.disabled = false;
      }
    });
    row.append(details, control);
    list.append(row);
  }
  panel.querySelector(".rw-admin-count").textContent = `${users.length} registered user${users.length === 1 ? "" : "s"}`;
}

async function loadUsers() {
  const status = panel.querySelector(".rw-admin-status");
  status.textContent = "Loading accounts…";
  try {
    const data = await api("list_users");
    renderUsers(data.users || []);
    status.textContent = "";
  } catch (error) {
    status.textContent = error.message;
  }
}

function openPanel() {
  if (panel) return;
  panel = document.createElement("section");
  panel.id = "rw-admin-panel";
  panel.innerHTML = `
    <div class="rw-admin-head">
      <div><p>RYAN WATCH / CONTROL</p><h2>Admin panel</h2></div>
      <button class="rw-admin-close" type="button" aria-label="Close admin panel">×</button>
    </div>
    <div class="rw-admin-overview"><strong class="rw-admin-count">Accounts</strong><span>USER MANAGEMENT</span></div>
    <p class="rw-admin-status" role="status" aria-live="polite"></p>
    <div class="rw-admin-users"></div>
    <footer>Only administrators can access account controls.</footer>`;
  document.body.append(panel);
  panel.querySelector(".rw-admin-close").addEventListener("click", closePanel);
  loadUsers();
}

async function checkAdmin(session) {
  currentSession = session;
  launcher?.remove();
  launcher = null;
  closePanel();
  if (!session) return;
  try {
    await api("list_users");
    launcher = document.createElement("button");
    launcher.id = "rw-admin-launcher";
    launcher.type = "button";
    launcher.textContent = "Admin";
    launcher.addEventListener("click", openPanel);
    document.body.append(launcher);
  } catch {
    // Non-admin accounts intentionally receive no admin UI.
  }
}

const { data: { session } } = await client.auth.getSession();
await checkAdmin(session);
client.auth.onAuthStateChange((_event, session) => {
  queueMicrotask(() => checkAdmin(session));
});
