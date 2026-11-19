# Nuvio Web

A responsive web adaptation inspired by the feature model and mobile-first experience of [NuvioMobile](https://github.com/NuvioMedia/NuvioMobile).

This repository is an independent web implementation. It is not an official NuvioMedia product and is not affiliated with NuvioMedia.

## Phase 1 foundation

- Next.js App Router with TypeScript
- Responsive application shell for desktop and mobile
- Mobile bottom navigation and desktop sidebar
- Dark visual system and reusable media-card primitives
- Search interaction against clearly marked local preview data
- Accessibility basics, reduced-motion support and mobile safe-area spacing

The current catalogue is preview content only. No streaming sources, playback engine, account system, or real metadata provider is connected yet.

## Development

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Checks

```bash
npm run typecheck
npm run build
```

## Roadmap

1. Foundation and responsive shell
2. Discovery, catalogues, metadata and source management
3. Playback, subtitles and stream handling
4. Accounts, profiles, watchlist and synchronisation
5. Accessibility, performance, security, testing and deployment

## Reference and licensing

NuvioMobile is published under the GNU General Public License v3.0. This project references its public feature set and broad interaction model; it does not copy NuvioMobile's Kotlin/Compose implementation. See the upstream repository and license for the original project:

- https://github.com/NuvioMedia/NuvioMobile
- https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/LICENSE
