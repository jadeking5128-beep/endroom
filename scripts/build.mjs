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
  const addonRepositoryPath = path.join(
    sourceDir,
    "js/data/repository/addonRepository.js"
  );
  let addonRepository = await readFile(addonRepositoryPath, "utf8");
  const defaultAddonMarker =
    'const DEFAULT_ADDON_URLS = ["https://v3-cinemeta.strem.io", "https://opensubtitles-v3.strem.io"];';
  const endroomDefaultAddons = [
    "const DEFAULT_ADDON_URLS = [",
    '  "https://v3-cinemeta.strem.io",',
    '  "https://opensubtitles-v3.strem.io",',
    '  "https://btttr.cc/TYxBDoMwDAT_4nP6gXyg96q3qgcLrBQpxNR2VCHE36sEAtzGs-tdoEPDyEHBvyCikdptBNdQwYFxj3OVG50OwUHH45BCjXfUE0vBhFLfKsdRShNPOaLUoPE2PsHbwUiG4Je1hGok4JcaecBsXH6Eg5AqeJNM-_gTwyG-GeNg81Xph393SkJX8UAbUmgGA13Fuv4B",',
    '  "https://voteit.co.uk/VOTEIT"',
    "];"
  ].join("\n");
  addonRepository = replaceOnce(
    addonRepository,
    defaultAddonMarker,
    endroomDefaultAddons,
    "default addon manifest list"
  );
  await writeFile(addonRepositoryPath, addonRepository);

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

  const accountSettingsPath = path.join(
    sourceDir,
    "js/ui/screens/settings/settingsScreenMethods-04-render-collapsible-row.js"
  );
  let accountSettings = await readFile(accountSettingsPath, "utf8");
  const accountStart = accountSettings.indexOf("    renderAccountSection(model) {");
  const accountEnd = accountSettings.indexOf("    renderAccountStatusCard(value) {", accountStart);
  if (accountStart < 0 || accountEnd < 0) {
    throw new Error("Upstream account settings section changed; refusing an unsafe patch.");
  }
  accountSettings =
    accountSettings.slice(0, accountStart) +
    '    renderAccountSection() {\n      return "";\n    },\n    ' +
    accountSettings.slice(accountEnd);
  await writeFile(accountSettingsPath, accountSettings);

  const metadataPath = path.join(
    sourceDir,
    "js/ui/screens/settings/settingsScreenHelpers-03-clamp-subtitle-text-opacity.js"
  );
  let metadata = await readFile(metadataPath, "utf8");
  const oldSubtitle = 'subtitle: "Add-ons, plugins, catalogs, and discovery sources"';
  if (!metadata.includes(oldSubtitle)) {
    throw new Error("Upstream content-discovery metadata changed; refusing an unsafe patch.");
  }
  const accountMeta = [
    '    id: "account",',
    '    labelKey: "settings.sections.account.label",',
    '    subtitleKey: "settings.sections.account.subtitle"'
  ].join("\n");
  if (!metadata.includes(accountMeta)) {
    throw new Error("Upstream account navigation metadata changed; refusing an unsafe patch.");
  }
  metadata = metadata.replace(
    accountMeta,
    accountMeta + ',\n    hideFromNav: true'
  );
  metadata = metadata.replace(oldSubtitle, 'subtitle: "Connect and manage media servers"');
  await writeFile(metadataPath, metadata);

  const layoutPreferencesPath = path.join(sourceDir, "js/data/local/layoutPreferences.js");
  let layoutPreferences = await readFile(layoutPreferencesPath, "utf8");
  layoutPreferences = replaceOnce(
    layoutPreferences,
    "  const modernSidebar = Boolean(merged.modernSidebar);",
    "  const modernSidebar = false;",
    "disable modern floating navigation"
  );
  layoutPreferences = replaceOnce(
    layoutPreferences,
    "    modernSidebarBlur: modernSidebar\n      ? Boolean(merged.modernSidebarBlur)\n      : Boolean(merged.modernSidebarBlur)",
    "    modernSidebarBlur: false",
    "disable sidebar glass blur"
  );
  await writeFile(layoutPreferencesPath, layoutPreferences);

  const responsiveCssPath = path.join(sourceDir, "css/components-64.css");
  const responsiveCss = "\n/* Endroom responsive layout: phone, tablet, laptop and desktop. */\nhtml, body, #app { min-height: 100%; width: 100%; max-width: 100%; overflow-x: clip; }\n#app, .home-screen-shell, .settings-shell, .search-screen-shell, .library-shell, .stream-route-shell { box-sizing: border-box; max-width: 100%; }\n.home-screen-shell { width: 100%; padding-bottom: 28px; }\n.home-screen-shell.home-layout-modern { --home-modern-portrait-poster-width: clamp(108px, 13vw, 188px); --home-modern-portrait-poster-height: clamp(162px, 19.5vw, 282px); --home-landscape-poster-width: clamp(190px, 22vw, 360px); --home-landscape-poster-height: clamp(107px, 12.4vw, 203px); --home-track-gap: clamp(10px, 1.4vw, 20px); }\n.home-screen-shell .home-track { padding-inline: clamp(14px, 3vw, 48px) !important; }\n.home-screen-shell .home-row-head { padding-inline: clamp(14px, 3vw, 48px) !important; }\n.home-screen-shell .home-row-title { font-size: clamp(16px, 1.6vw, 25px) !important; }\n.home-screen-shell .home-hero-title-text { font-size: clamp(25px, 3.2vw, 50px) !important; }\n.home-screen-shell .home-hero-description { max-width: min(60ch, 90%); line-height: 1.5; }\n#player { width: 100vw; height: 100vh; height: 100dvh; }\n#videoPlayer { width: 100%; height: 100%; object-fit: contain !important; }\n@media (min-width: 1200px) { .home-screen-shell.home-layout-modern { --home-modern-portrait-poster-width: clamp(140px, 11vw, 210px); --home-modern-portrait-poster-height: clamp(210px, 16.5vw, 315px); --home-landscape-poster-width: clamp(250px, 21vw, 390px); --home-landscape-poster-height: clamp(141px, 11.8vw, 220px); } }\n@media (min-width: 700px) and (max-width: 1199px) { .home-screen-shell.home-layout-modern { --home-modern-portrait-poster-width: clamp(118px, 16vw, 168px); --home-modern-portrait-poster-height: clamp(177px, 24vw, 252px); --home-landscape-poster-width: clamp(200px, 27vw, 300px); --home-landscape-poster-height: clamp(113px, 15.2vw, 169px); } }\n@media (max-width: 699px) { .home-screen-shell { padding-bottom: 18px; } .home-screen-shell.home-layout-modern { --home-modern-portrait-poster-width: clamp(96px, 29vw, 132px); --home-modern-portrait-poster-height: clamp(144px, 43.5vw, 198px); --home-landscape-poster-width: clamp(172px, 49vw, 224px); --home-landscape-poster-height: clamp(97px, 27.6vw, 126px); --home-track-gap: 9px; } .home-screen-shell .home-track, .home-screen-shell .home-row-head { padding-inline: 14px !important; } .home-screen-shell .home-row-title { font-size: 17px !important; } .home-screen-shell .home-hero-title-text { font-size: clamp(23px, 7vw, 34px) !important; } .home-screen-shell .home-hero-description { font-size: 13px !important; } #app > .screen:not(#player) { min-width: 0; max-width: 100vw; } #player { min-height: 100dvh; } }\n@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; } }\n";
  const currentResponsiveCss = await readFile(responsiveCssPath, "utf8");
  if (!currentResponsiveCss.includes("Endroom responsive layout: phone, tablet, laptop and desktop")) {
    await writeFile(responsiveCssPath, currentResponsiveCss + responsiveCss);
  }

  const streamRenderPath = path.join(sourceDir, "js/ui/screens/stream/streamScreenMethods-09-render.js");
  let streamRender = await readFile(streamRenderPath, "utf8");
  streamRender = replaceOnce(
    streamRender,
    'body = `<div class="stream-route-empty"><p>${escapeHtml(t("sources_no_streams", {}, "No streams found"))}</p><p>${escapeHtml(t("stream_no_streams_hint"))}</p></div>`;',
    'body = `<div class="stream-route-empty stream-route-no-sources"><p>${escapeHtml(t("sources_no_streams", {}, "No playable sources found"))}</p><p>${escapeHtml(t("stream_no_streams_hint"))}</p><p class="stream-route-source-help">Endroom needs a compatible stream source. Connect your own Jellyfin or Emby media server in Settings → Content Discovery → Media Servers. Catalogue and rating add-ons do not provide video streams.</p></div>`;',
    "explain missing playback sources"
  );
  await writeFile(streamRenderPath, streamRender);


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
  const authScriptPath = path.join(rootDir, "public/ryan-watch-auth.js");
  const authStylePath = path.join(rootDir, "public/ryan-watch-auth.css");
  await cp(authScriptPath, path.join(distDir, "ryan-watch-auth.js"));
  await cp(authStylePath, path.join(distDir, "ryan-watch-auth.css"));
  const builtIndexPath = path.join(distDir, "index.html");
  let builtIndex = await readFile(builtIndexPath, "utf8");
  if (!builtIndex.includes("/ryan-watch-auth.js")) {
    builtIndex = builtIndex.replace("</body>", '  <script type="module" src="/ryan-watch-auth.js"></script>\n</body>');
    await writeFile(builtIndexPath, builtIndex);
  }

  console.log("Endroom built from NuvioTVSmart " + upstreamCommit);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
