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

The built-in catalogue is illustrative preview data, not a live metadata feed. A live metadata provider and API-key configuration can be added without exposing credentials in the browser. Remote source fetching is not part of Phase 2.

## Phase 3 · Playback, adaptive streaming and subtitles

- Native browser playback for direct MP4/WebM media URLs
- Shaka Player integration for HLS (`.m3u8`) and MPEG-DASH (`.mpd`) adaptive streams
- Optional Widevine and PlayReady DRM configuration using provider-issued HTTPS license endpoints
- External WebVTT subtitle tracks
- Playback position saved locally with resume and start-over actions
- Retry handling and clearer player initialisation / media errors

### Playback import fields

Add `streamUrl`, optional `subtitles`, and (only when your provider requires it) optional `drm` to a catalogue item. Use media and license endpoints you own or are authorised to access.

```json
{
  "title": "Example title",
  "type": "movie",
  "streamUrl": "https://media.example.org/manifest.mpd",
  "subtitles": [
    { "src": "https://media.example.org/subtitles/en.vtt", "lang": "en", "label": "English" }
  ],
  "drm": {
    "keySystem": "com.widevine.alpha",
    "licenseServer": "https://license.example.org/widevine"
  }
}
```

Supported DRM key systems in the current configuration are `com.widevine.alpha` and `com.microsoft.playready`. A working DRM stream still requires a compatible browser/device, a valid provider-issued license server, correct CORS and response headers, and any required account entitlement. This does not provide DRM keys, bypass licensing, or make protected content accessible without the provider's authorisation. FairPlay and certificate-based configurations are not included in this baseline.

HLS and DASH support depends on browser Media Source Extensions and codec support. Some providers require signed URLs, request headers, cookies, or custom license challenges; those provider-specific authentication flows are not guessed or bypassed here. External subtitle files should be WebVTT (`.vtt`) and allow cross-origin requests where hosted separately. Playback progress remains local to this browser and device.
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
3. Playback, adaptive streaming, subtitles and authorised DRM configuration
4. Accounts, profiles, watchlist and synchronisation
5. Accessibility, performance, security, testing and deployment

## Reference and licensing
NuvioMobile is published under the GNU General Public License v3.0. This project references its public feature set and broad interaction model; it does not copy NuvioMobile's Kotlin/Compose implementation. See the [upstream repository](https://github.com/NuvioMedia/NuvioMobile) and its [GPL-3.0 license](https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/LICENSE).
