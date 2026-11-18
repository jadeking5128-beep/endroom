import { execFileSync } from "node:child_process";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(rootDir, ".nuvio-source");
const distDir = path.join(rootDir, "dist");
const upstreamRepo = "https://github.com/NuvioMedia/NuvioTVSmart.git";
const upstreamCommit = "2a7ac34d155bba570881c953763d6a6425932918";

function run(command, args, cwd = rootDir) {
  execFileSync(command, args, { cwd, stdio: "inherit", env: process.env });
}

function capture(command, args, cwd = rootDir) {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

function replaceOnce(source, marker, replacement, label) {
  const index = source.indexOf(marker);
  if (index < 0) {
    throw new Error("Upstream source changed at " + label + "; refusing an unsafe patch.");
  }
  return source.slice(0, index) + replacement + source.slice(index + marker.length);
}

async function patchNuvioSource() {
  const appPath = path.join(sourceDir, "js/app.js");
  let app = await readFile(appPath, "utf8");

  const profileImport = 'import { ProfileManager } from "./core/profile/profileManager.js";';
  app = replaceOnce(
    app,
    profileImport,
    profileImport + '\nimport { ExperienceModeStore } from "./data/local/experienceModeStore.js";',
    "profile manager import"
  );

  app = app.replace(
    'import { DeviceSessionRegistration } from "./core/auth/deviceSessionRegistration.js";\n',
    ""
  );
  app = app.replace("  DeviceSessionRegistration.start();\n", "");

  const remoteMode = [
    "function isAddonRemoteMode() {",
    "  try {",
    '    return new URLSearchParams(window.location.search).get("addonsRemote") === "1";',
    "  } catch {",
    "    return false;",
    "  }",
    "}"
  ].join("\n");
  app = replaceOnce(
    app,
    remoteMode,
    "function isAddonRemoteMode() {\n  return false;\n}",
    "public add-on remote mode"
  );

  const bootstrapMarker = "  await AuthManager.bootstrap();";
  const guestBootstrap = [
    "  // Endroom local-only startup: bypass public account and QR sign-in.",
    "  LocalStore.set(GUEST_QR_BYPASS_KEY, true);",
    '  LocalStore.set("rememberLastProfile", true);',
    '  LocalStore.set("hasEverSelectedProfile", true);',
    '  LocalStore.set("activeProfileId", "1");',
    '  LocalStore.set("hasSeenAuthQrOnFirstLaunch", true);',
    '  await ExperienceModeStore.setForProfile("1", { mode: "ADVANCED", addonSetupSkipped: true });',
    "  await AuthManager.bootstrap();"
  ].join("\n");
  app = replaceOnce(app, bootstrapMarker, guestBootstrap, "auth bootstrap");
  await writeFile(appPath, app);

  const settingsPath = path.join(
    sourceDir,
    "js/ui/screens/settings/settingsScreenMethods-07-render-plugins-section.js"
  );
  let settings = await readFile(settingsPath, "utf8");
  const start = settings.indexOf("    renderPluginsSection(model = {}) {");
  const integration = settings.indexOf("    renderIntegrationHub() {", start);
  if (start < 0 || integration < 0) {
    throw new Error("Upstream settings section changed; refusing an unsafe patch.");
  }

  const publicDiscoveryOnly = [
    "    renderPluginsSection() {",
    '      return "";',
    "    },",
    "    renderContentDiscoverySection() {",
    "      if (this.mediaServersView) return renderMediaServersSection.call(this);",
    '      this.actionMap.set("contentDiscovery:servers", () => {',
    '        this.mediaServersView = "list";',
    '        this.contentFocusKey = "mediaServers:back";',
    "      });",
    "      return (",
    '        this.renderSectionHeader(SECTION_META.find((item) => item.id === "contentDiscovery")) +',
    '        \'<div class="settings-group-card"><div class="settings-stack">\' +',
    "        this.renderActionRow({",
    '          focusKey: "contentDiscovery:servers",',
    '          title: t("settings_media_servers"),',
    '          subtitle: t("settings_media_servers_subtitle"),',
    '          leadingIcon: "dns"',
    "        }) +",
    '        "</div></div>"',
    "      );",
    "    },",
    "  "
  ].join("\n");
  settings = settings.slice(0, start) + publicDiscoveryOnly + settings.slice(integration);
  await writeFile(settingsPath, settings);

  const metadataPath = path.join(
    sourceDir,
    "js/ui/screens/settings/settingsScreenHelpers-03-clamp-subtitle-text-opacity.js"
  );
  let metadata = await readFile(metadataPath, "utf8");
  const oldSubtitle = 'subtitle: "Add-ons, plugins, catalogs, and discovery sources"';
  if (!metadata.includes(oldSubtitle)) {
    throw new Error("Upstream content-discovery metadata changed; refusing an unsafe patch.");
  }
  metadata = metadata.replace(oldSubtitle, 'subtitle: "Connect and manage media servers"');
  await writeFile(metadataPath, metadata);
}

async function main() {
  await rm(sourceDir, { recursive: true, force: true });
  await rm(distDir, { recursive: true, force: true });

  run("git", ["clone", "--depth", "1", "--branch", "main", upstreamRepo, sourceDir]);
  let checkedOut = capture("git", ["rev-parse", "HEAD"], sourceDir);
  if (checkedOut !== upstreamCommit) {
    run("git", ["fetch", "--depth=1", "origin", upstreamCommit], sourceDir);
    run("git", ["checkout", "--detach", "FETCH_HEAD"], sourceDir);
    checkedOut = capture("git", ["rev-parse", "HEAD"], sourceDir);
  }
  if (checkedOut !== upstreamCommit) {
    throw new Error("Expected Nuvio commit " + upstreamCommit + " but received " + checkedOut);
  }

  await patchNuvioSource();

  run("npm", ["ci", "--no-audit", "--no-fund"], sourceDir);
  run("npm", ["run", "build"], sourceDir);
  await cp(path.join(sourceDir, "dist"), distDir, { recursive: true });

  console.log("Endroom built from NuvioTVSmart " + upstreamCommit);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
