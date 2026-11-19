# Phase 4 playback integrations

EndRoom's web player uses browser playback plus Shaka Player for HLS/DASH. It does not embed Android ExoPlayer or native libmpv; those engines cannot run inside a normal browser page.

## IntroDB

IntroDB reads are anonymous. EndRoom looks up known intro, recap, outro and post-credits timestamps through its server route. A movie or episode needs an IMDb ID. Series episodes also need season and episode numbers. Missing community timestamps are normal and do not prevent playback.

Attribution: Intro data provided by IntroDB (introdb.app).

## Subtitle discovery

The player can request subtitle tracks exposed by the selected catalogue add-on. The add-on must implement the standard `subtitles` resource and return browser-accessible HTTPS subtitle URLs. This does not silently scrape subtitle websites or bypass provider access controls.

## Trakt and Simkl progress sync

Both providers use OAuth PKCE. Tokens are stored in HttpOnly cookies and are never placed in localStorage or returned to the browser JavaScript.

Add these Vercel Production environment variables:

- `NEXT_PUBLIC_APP_URL=https://endroom1.vercel.app`
- `TRAKT_CLIENT_ID=<your Trakt application client ID>`
- `SIMKL_CLIENT_ID=<your Simkl application client ID>`

Register these exact callback URLs in the respective developer applications:

- `https://endroom1.vercel.app/api/sync/trakt/callback`
- `https://endroom1.vercel.app/api/sync/simkl/callback`

No client secret is required for these PKCE flows. Do not put a client secret in the frontend or commit credentials. After adding the variables, redeploy Production, then use Settings → Watch progress sync to connect each account.

Progress events are sent when playback starts, pauses, and ends. A series episode needs a valid season and episode number. A title without an IMDb ID may be matched by title and year, but provider matching can be less reliable.

## Torrent-backed sources and hosting limits

A browser can play direct HTTPS media URLs and compatible HLS/DASH manifests. A magnet URI or raw torrent file is not a media URL, and Vercel Functions are short-lived request handlers rather than persistent peer-to-peer clients. EndRoom therefore must not claim that a magnet link is playable just because an add-on returned it.

For lawful, public-domain or otherwise authorized torrent media, a separate playback service would need to resolve the torrent and expose a browser-compatible HTTPS stream. That service must be hosted outside Vercel on infrastructure designed for persistent connections and bandwidth. EndRoom's web player can consume the resulting authorized HTTPS stream; it does not implement a general-purpose torrent swarm client.

## Current browser playback support

- Direct HTTPS media files supported by the browser.
- HLS and DASH through Shaka Player, subject to browser codec, CORS and DRM support.
- External subtitle tracks returned by the configured catalogue add-on.
- Local resume progress on the current browser.
- IntroDB skip prompts when a matching IMDb ID and segment data are available.
- Optional Trakt and Simkl playback progress sync after the app credentials are configured.
