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
  const endroomDefaultAddons = defaultAddonMarker;
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


  const wordmarkPath = path.join(sourceDir, "js/ui/components/brandWordmark.js");
  let wordmark = await readFile(wordmarkPath, "utf8");
  wordmark = replaceOnce(wordmark,
    'export function renderBrandWordmarkImage({ className = "", alt = "Nuvio" } = {}) {',
    'export function renderBrandWordmarkImage({ className = "", alt = "Ryan Watch" } = {}) {',
    "Ryan Watch wordmark label");
  wordmark = replaceOnce(wordmark,
    '  return `<img src="${getBrandWordmarkAsset()}" class="theme-brand-wordmark${safeClassName}" data-theme-brand-wordmark alt="${escapeHtml(alt)}" />`;',
    '  return `<span class="theme-brand-wordmark${safeClassName}" data-theme-brand-wordmark aria-label="${escapeHtml(alt)}">RYAN WATCH</span>`;',
    "replace upstream wordmark");
  wordmark = replaceOnce(wordmark, '  const src = getBrandWordmarkAsset(themeName);', '  const src = "";', "disable upstream logo asset");
  wordmark = wordmark.replace(
    '    if (image.getAttribute("src") !== src) {\\n      image.setAttribute("src", src);\\n    }',
    '    image.textContent = "RYAN WATCH";');
  await writeFile(wordmarkPath, wordmark);

  const indexPath = path.join(sourceDir, "index.html");
  let indexHtml = await readFile(indexPath, "utf8");
  indexHtml = indexHtml.replace("<title>Nuvio TV</title>", "<title>Ryan Watch</title>");
  indexHtml = indexHtml.replace("maximum-scale=1.0, user-scalable=no", "maximum-scale=1.0, viewport-fit=cover");
  if (!indexHtml.includes("css/ryan-watch-responsive.css")) {
    indexHtml = indexHtml.replace("</head>", '    <link rel="stylesheet" href="css/ryan-watch-responsive.css" />\\n  </head>');
  }
  await writeFile(indexPath, indexHtml);

  const bootGuardPath = path.join(sourceDir, "boot-guard.js");
  let bootGuard = await readFile(bootGuardPath, "utf8");
  bootGuard = bootGuard.replaceAll("Nuvio TV", "Ryan Watch").replaceAll("Nuvio", "Ryan Watch");
  await writeFile(bootGuardPath, bootGuard);

  const updatePromptPath = path.join(sourceDir, "js/ui/components/appUpdatePrompt.js");
  let updatePrompt = await readFile(updatePromptPath, "utf8");
  updatePrompt = updatePrompt.replaceAll(
    "Use Nuvio TV Installer to update the app on your TV.",
    "Check Ryan Watch for the latest version.");
  await writeFile(updatePromptPath, updatePrompt);

  const responsivePath = path.join(sourceDir, "css/ryan-watch-responsive.css");
  await writeFile(responsivePath, `
:root { --rw-bg:#090a0c; --rw-gutter:clamp(14px,3vw,48px); }
html,body { width:100%; min-width:320px; min-height:100%; margin:0; overflow-x:hidden!important; background:var(--rw-bg); }
body { padding-bottom:env(safe-area-inset-bottom); }
#app { width:100%; max-width:100%; min-height:100dvh; overflow-x:clip; }
.screen,.home-screen-shell,.home-shell,.settings-shell,.search-screen-shell,.library-shell,.discover-shell,.addons-shell,.trakt-route-shell,.detail-screen-shell,.stream-route-shell { box-sizing:border-box; max-width:100%; min-width:0; }
.home-screen-shell { width:100%; min-height:100dvh; height:auto; overflow-x:clip; }
.home-screen-shell.home-layout-modern {
 --home-modern-portrait-poster-width:clamp(112px,12vw,188px);
 --home-modern-portrait-poster-height:calc(var(--home-modern-portrait-poster-width)*1.5);
 --home-landscape-poster-width:clamp(200px,21vw,360px);
 --home-landscape-poster-height:calc(var(--home-landscape-poster-width)*.5625);
 --home-track-gap:clamp(10px,1.4vw,20px);
}
.home-screen-shell .home-track,.home-screen-shell .home-row-head { padding-inline:var(--rw-gutter)!important; }
.home-screen-shell .home-row-title { font-size:clamp(17px,1.5vw,24px)!important; }
.home-screen-shell .home-hero-title-text { font-size:clamp(27px,3.2vw,52px)!important; }
.home-screen-shell .home-hero-description { max-width:min(60ch,90%); line-height:1.5; }
.discover-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(142px,1fr)); gap:clamp(12px,1.6vw,22px); }
.discover-card,.discover-action-card { min-width:0; max-width:100%; }
.discover-card-poster { width:100%; height:auto; aspect-ratio:2/3; object-fit:cover; }
.theme-brand-wordmark { display:inline-flex; color:#f2eee5!important; font-size:16px; font-weight:800; letter-spacing:.13em; white-space:nowrap; }
#player { width:100vw; height:100vh; height:100dvh; }
#videoPlayer { width:100%; height:100%; object-fit:contain!important; }
@media(min-width:1200px) { .discover-grid { grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); } }
@media(max-width:699px) {
 :root { --rw-gutter:14px; }
 html,body { font-size:15px; }
 .home-screen-shell { padding-bottom:calc(88px + env(safe-area-inset-bottom)); }
 .home-screen-shell.home-layout-modern {
  --home-modern-portrait-poster-width:clamp(98px,29vw,132px);
  --home-modern-portrait-poster-height:calc(var(--home-modern-portrait-poster-width)*1.5);
  --home-landscape-poster-width:clamp(170px,49vw,224px);
  --home-landscape-poster-height:calc(var(--home-landscape-poster-width)*.5625);
  --home-track-gap:9px;
 }
 .home-screen-shell .home-track,.home-screen-shell .home-row-head { padding-inline:14px!important; }
 .home-screen-shell .home-row-title { font-size:17px!important; }
 .home-screen-shell .home-hero-title-text { font-size:clamp(24px,7vw,36px)!important; }
 .home-screen-shell .home-hero-description { font-size:13px!important; }
 .home-sidebar { position:fixed!important; inset:auto 10px calc(8px + env(safe-area-inset-bottom)) 10px!important; width:auto!important; height:64px!important; min-height:64px!important; z-index:999!important; display:flex!important; flex-direction:row!important; justify-content:center!important; padding:6px 8px!important; border:1px solid rgba(255,255,255,.12)!important; border-radius:19px!important; background:rgba(17,19,22,.96)!important; box-shadow:0 12px 36px rgba(0,0,0,.45); }
 .home-sidebar .home-nav-list { display:flex!important; flex-direction:row!important; width:100%; justify-content:space-around!important; gap:4px!important; }
 .home-sidebar .home-nav-item { flex:1 1 0; min-width:0!important; width:auto!important; max-width:62px; height:48px!important; min-height:48px!important; margin:0!important; border-radius:14px!important; justify-content:center!important; }
 .home-sidebar .home-nav-label { display:none!important; }
 .home-sidebar .home-nav-icon,.home-sidebar .home-nav-icon-wrap { width:22px!important; height:22px!important; font-size:22px!important; }
 .home-main { margin:0!important; width:100%!important; padding-bottom:24px!important; }
 .settings-workspace { display:flex!important; flex-direction:column!important; width:100%!important; height:auto!important; min-height:100dvh!important; margin:0!important; padding:14px!important; border:0!important; border-radius:0!important; gap:14px!important; }
 .settings-sidebar { display:flex!important; flex-direction:row!important; width:100%!important; height:auto!important; max-height:none!important; overflow-x:auto!important; overflow-y:hidden!important; gap:7px!important; padding:2px 0 8px!important; }
 .settings-nav-item { flex:0 0 auto; min-height:42px!important; padding:0 12px!important; white-space:nowrap; }
 .settings-content,.settings-content-frame { height:auto!important; max-height:none!important; overflow:visible!important; }
 .trakt-route-shell,.discover-shell,.search-screen-shell,.library-shell,.addons-shell { width:100%!important; margin:0!important; padding:18px 14px 100px!important; }
 .discover-grid { grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px 9px; }
 .discover-card-title { font-size:12px!important; }
 .discover-card-meta { font-size:10px!important; }
 .nuvio-dialog-panel { width:calc(100vw - 24px)!important; max-width:520px!important; max-height:calc(100dvh - 24px)!important; overflow:auto!important; }
}
@media(max-width:360px) { .discover-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation-duration:.01ms!important; transition-duration:.01ms!important; } }
`);

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
  const adminScriptPath = path.join(rootDir, "public/ryan-watch-admin.js");
  const adminStylePath = path.join(rootDir, "public/ryan-watch-admin.css");
  await cp(authScriptPath, path.join(distDir, "ryan-watch-auth.js"));
  await cp(authStylePath, path.join(distDir, "ryan-watch-auth.css"));
  await cp(adminScriptPath, path.join(distDir, "ryan-watch-admin.js"));
  await cp(adminStylePath, path.join(distDir, "ryan-watch-admin.css"));
  const builtIndexPath = path.join(distDir, "index.html");
  let builtIndex = await readFile(builtIndexPath, "utf8");
  if (!builtIndex.includes("/ryan-watch-auth.js")) {
    builtIndex = builtIndex.replace("</body>", '  <script type="module" src="/ryan-watch-auth.js"></script>\n  <script type="module" src="/ryan-watch-admin.js"></script>\n</body>');
    await writeFile(builtIndexPath, builtIndex);
  }

  console.log("Endroom built from NuvioTVSmart " + upstreamCommit);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
