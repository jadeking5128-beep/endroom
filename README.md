# Nuvio Web

An independent, responsive web adaptation inspired by the feature model and mobile-first experience of [NuvioMobile](https://github.com/NuvioMedia/NuvioMobile). This is not an official NuvioMedia product and is not affiliated with NuvioMedia.

## Phase 1 · Foundation
- Next.js App Router and TypeScript
- Responsive desktop sidebar and mobile bottom navigation
- Dark visual system and reusable media cards

## Phase 2 · Discovery and catalogues
- Unified catalogue model with movie, series and anime types
- Search across title, overview and genres
- Type and genre filters, plus rating, year and title sorting
- Detail preview with metadata and source attribution
- Local JSON catalogue import and source management
- Imported entries persist in the current browser using local storage

### Import format

Choose a JSON file containing an array of objects, or an object with an `items` array:

```json
{
  "items": [
    {
      "title": "Example title",
      "year": 2025,
      "type": "movie",
      "genres": ["Drama", "Mystery"],
      "rating": 7.8,
      "overview": "A short description.",
      "poster": "photo-1489599849927-2ee91cede3ba"
    }
  ]
}
```

The poster field accepts an Unsplash photo ID in the `photo-...` format. Invalid rows are skipped. Imports remain on the device and can be removed from Manage sources. Do not import lists you do not have permission to use.

The built-in catalogue is illustrative preview data, not a live metadata feed. A live metadata provider and API-key configuration can be added without exposing credentials in the browser. Remote source fetching and playback are not part of this phase.

## Development
```bash
npm install
npm run dev
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
NuvioMobile is published under the GNU General Public License v3.0. This project references its public feature set and broad interaction model; it does not copy NuvioMobile's Kotlin/Compose implementation. See the [upstream repository](https://github.com/NuvioMedia/NuvioMobile) and its [GPL-3.0 license](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/LICENSE).
