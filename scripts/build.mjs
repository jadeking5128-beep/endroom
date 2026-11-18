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
  const endroomDefaultAddons =
    'const DEFAULT_ADDON_URLS = [\n' +
    '  "https://v3-cinemeta.strem.io",\n' +
    '  "https://opensubtitles-v3.strem.io",\n' +
    '  "https://btttr.cc/TYxBDoMwDAT_4nP6gXyg96q3qgcLrBQpxNR2VCHE36sEAtzGs-tdoEPDyEHBvyCikdptBNdQwYFxj3OVG50OwUHH45BCjXfUE0vBhFLfKsdRShNPOaLUoPE2PsHbwUiG4Je1hGok4JcaecBsXH6Eg5AqeJNM-_gTwyG-GeNg81Xph393SkJX8UAbUmgGA13Fuv4B"\n' +
    '];';
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
    "  const modernSidebar = true;",
    "enable Endroom floating navigation by default"
  );
  layoutPreferences = replaceOnce(
    layoutPreferences,
    "    modernSidebarBlur: modernSidebar\n      ? Boolean(merged.modernSidebarBlur)\n      : Boolean(merged.modernSidebarBlur)",
    "    modernSidebarBlur: true",
    "enable liquid-glass sidebar blur"
  );
  await writeFile(layoutPreferencesPath, layoutPreferences);

  const sidebarMarkupPath = path.join(sourceDir, "js/ui/components/sidebarNavigationHelpers-02-get-sidebar-avatar-catalog.js");
  let sidebarMarkup = await readFile(sidebarMarkupPath, "utf8");
  sidebarMarkup = replaceOnce(
    sidebarMarkup,
    '<div class="modern-sidebar-shell\${expanded ? " expanded panel-visible" : ""}\${blurEnabled ? " blur-enabled" : ""}\${keepPillExpanded ? " keep-pill-expanded" : ""}\${performanceConstrained ? " performance-constrained" : ""}" data-selected-route="\${selectedRoute}">',
    '<div class="modern-sidebar-shell ios-floating-nav expanded panel-visible blur-enabled" data-selected-route="\${selectedRoute}">',
    "floating navigation shell"
  );
  sidebarMarkup = replaceOnce(
    sidebarMarkup,
    '<aside class="modern-sidebar-panel" aria-hidden="\${expanded ? "false" : "true"}">',
    '<aside class="modern-sidebar-panel" aria-hidden="false">',
    "always-visible floating navigation"
  );
  await writeFile(sidebarMarkupPath, sidebarMarkup);

  const sidebarEventsPath = path.join(sourceDir, "js/ui/components/sidebarNavigationHelpers-03-render-root-sidebar.js");
  let sidebarEvents = await readFile(sidebarEventsPath, "utf8");
  sidebarEvents = replaceOnce(
    sidebarEvents,
    "      if (keyCode === 38) {",
    [
      "      if (keyCode === 37 || keyCode === 39) {",
      "        event?.preventDefault?.();",
      "        event?.stopPropagation?.();",
      "        moveSidebarFocus(node, keyCode === 37 ? -1 : 1);",
      '        container?.querySelector(".modern-sidebar-panel .focusable.focused")?.scrollIntoView?.({',
      '          block: "nearest",',
      '          inline: "center",',
      '          behavior: "smooth"',
      "        });",
      "        return;",
      "      }",
      "      if (keyCode === 38) {"
    ].join("\n"),
    "horizontal floating navigation focus"
  );
  await writeFile(sidebarEventsPath, sidebarEvents);

  const glassCssPath = path.join(sourceDir, "css/components-64.css");
  const glassCss = "\n/* Endroom: iOS-inspired liquid-glass floating navigation. */\n.modern-sidebar-shell.ios-floating-nav {\n  position: fixed !important; z-index: 1000 !important; top: auto !important;\n  right: auto !important; bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;\n  left: 50% !important; width: max-content !important; max-width: calc(100vw - 20px) !important;\n  height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important;\n  transform: translateX(-50%) !important; pointer-events: none !important;\n}\n.ios-floating-nav .modern-sidebar-pill,\n.ios-floating-nav .modern-sidebar-profile { display: none !important; }\n.ios-floating-nav .modern-sidebar-panel {\n  position: relative !important; inset: auto !important; display: block !important;\n  visibility: visible !important; opacity: 1 !important; width: max-content !important;\n  min-width: 0 !important; max-width: calc(100vw - 20px) !important; height: auto !important;\n  max-height: none !important; margin: 0 !important; padding: 7px !important; overflow: hidden !important;\n  border: 1px solid rgba(255,255,255,.24) !important; border-radius: 28px !important;\n  background: linear-gradient(145deg,rgba(255,255,255,.19),rgba(255,255,255,.075) 34%,rgba(18,19,24,.76) 100%) !important;\n  box-shadow: 0 18px 58px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.28),inset 0 -1px 0 rgba(255,255,255,.055) !important;\n  -webkit-backdrop-filter: blur(34px) saturate(1.85) !important;\n  backdrop-filter: blur(34px) saturate(1.85) !important; transform: none !important; pointer-events: auto !important;\n}\n.ios-floating-nav .modern-sidebar-nav-list {\n  display: flex !important; flex-direction: row !important; align-items: center !important;\n  justify-content: flex-start !important; gap: 4px !important; width: max-content !important;\n  max-width: calc(100vw - 36px) !important; height: auto !important; max-height: none !important;\n  margin: 0 !important; padding: 0 !important; overflow-x: auto !important; overflow-y: hidden !important;\n  overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; touch-action: pan-x;\n  scroll-snap-type: x proximity; scrollbar-width: none !important;\n}\n.ios-floating-nav .modern-sidebar-nav-list::-webkit-scrollbar { display: none !important; }\n.ios-floating-nav .modern-sidebar-nav-item {\n  display: inline-flex !important; flex: 0 0 auto !important; flex-direction: column !important;\n  align-items: center !important; justify-content: center !important; gap: 3px !important;\n  width: auto !important; min-width: 58px !important; min-height: 54px !important; height: 54px !important;\n  margin: 0 !important; padding: 5px 12px !important; border: 1px solid transparent !important;\n  border-radius: 20px !important; background: transparent !important; color: rgba(255,255,255,.78) !important;\n  scroll-snap-align: center;\n  transition: background .28s cubic-bezier(.2,.8,.2,1),border-color .28s ease,transform .28s cubic-bezier(.2,.8,.2,1),color .2s ease !important;\n}\n.ios-floating-nav .modern-sidebar-nav-item.selected {\n  border-color: rgba(255,255,255,.22) !important;\n  background: linear-gradient(180deg,rgba(255,255,255,.23),rgba(255,255,255,.105)) !important;\n  color: #fff !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.24),0 4px 16px rgba(0,0,0,.18) !important;\n}\n.ios-floating-nav .modern-sidebar-nav-item.focused {\n  outline: 1px solid rgba(255,255,255,.72) !important; outline-offset: 1px !important;\n  transform: translateY(-2px) scale(1.035);\n}\n.ios-floating-nav .modern-sidebar-nav-icon-circle {\n  display: flex !important; align-items: center !important; justify-content: center !important;\n  width: 23px !important; height: 23px !important; margin: 0 !important; border-radius: 50% !important;\n  background: transparent !important;\n}\n.ios-floating-nav .modern-sidebar-nav-icon { width: 21px !important; height: 21px !important; font-size: 21px !important; }\n.ios-floating-nav .modern-sidebar-nav-label {\n  display: block !important; max-width: 76px !important; overflow: hidden !important;\n  color: inherit !important; font-size: 10px !important; font-weight: 550 !important;\n  line-height: 12px !important; letter-spacing: .01em; text-align: center !important;\n  text-overflow: ellipsis !important; white-space: nowrap !important;\n}\n.home-screen-shell { padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }\n@media (min-width: 760px) {\n  .modern-sidebar-shell.ios-floating-nav { bottom: calc(20px + env(safe-area-inset-bottom, 0px)) !important; }\n  .ios-floating-nav .modern-sidebar-nav-item { min-width: 72px !important; min-height: 58px !important; height: 58px !important; padding-inline: 16px !important; }\n  .ios-floating-nav .modern-sidebar-nav-label { font-size: 11px !important; }\n}\n@media (prefers-reduced-motion: reduce) { .ios-floating-nav .modern-sidebar-nav-item { transition: none !important; } }\n";
  const existingGlassCss = await readFile(glassCssPath, "utf8");
  if (!existingGlassCss.includes("Endroom: iOS-inspired liquid-glass floating navigation")) {
    await writeFile(glassCssPath, existingGlassCss + "\n" + glassCss);
  }

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
