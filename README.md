# Ryan Watch

Ryan Watch is a browser-first media-library interface designed for phones, tablets, laptops, and desktop browsers. It is deployed as a static web application on Vercel.

## Web compatibility

The selected NuvioMobile project is a Kotlin Multiplatform application whose current build includes Android and iOS targets, not a browser target. Its native project cannot be deployed directly to Vercel as a website.

To keep Ryan Watch usable on the web, this repository uses the browser-compatible NuvioTVSmart web runtime, with responsive layout adaptations informed by the NuvioMobile experience. This keeps the existing browser playback, routing, and responsive web build instead of pretending a native Android package is a website.

## Ryan Watch adaptations

- Ryan Watch branding is applied to the browser title, wordmark, and startup messaging.
- The layout is adapted for narrow phones, tablets, laptops, and wide desktop displays.
- Mobile navigation, media grids, settings, dialogs, and the player receive viewport-aware sizing.
- Reduced-motion preferences and safe-area insets are respected.
- The public build does not inject additional third-party source URLs. Users should connect media services and sources they are authorized to use.
- The existing Supabase authentication and protected admin scripts remain part of the web build.

## Build

Requirements: Node.js 22 and Git.

```bash
npm ci
npm run build
```

The build checks out the pinned browser-compatible upstream source, applies Ryan Watch patches, runs its production build, and writes the static site to `dist/`.

## Upstream and licensing

- Browser runtime: https://github.com/NuvioMedia/NuvioTVSmart
- Pinned upstream commit: `2a7ac34d155bba570881c953763d6a6425932918`
- Native UI reference: https://github.com/NuvioMedia/NuvioMobile
- License: GNU General Public License v3.0. See [LICENSE](./LICENSE).

The upstream license and required notices are retained. Ryan Watch branding does not remove the original project attribution or license obligations.
