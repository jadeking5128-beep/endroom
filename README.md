# Endroom

Endroom Phase 1 deploys the official Nuvio TV Smart web application, preserving the upstream Nuvio interface rather than recreating it.

The Vercel build checks out the pinned upstream source commit, applies only the Endroom guest-first and public add-on visibility changes, then runs the original Nuvio build pipeline. The original logo, loading experience, artwork, navigation, media browsing, detail pages, and player are retained.

## Phase 1 changes

- Public account and QR sign-in are bypassed.
- First-launch add-on setup is skipped.
- Public add-on and plugin management screens are hidden.
- The public settings area retains media-server settings, but no add-on management.
- The original Nuvio application and loading visuals are preserved.

## Upstream source and license

- Upstream: https://github.com/NuvioMedia/NuvioTVSmart
- Pinned commit: `2a7ac34d155bba570881c953763d6a6425932918`
- License: GNU GPL v3.0. See [LICENSE](./LICENSE).

This repository contains the Endroom deployment wrapper and build-time patches. The complete upstream source is fetched from the pinned public commit during each Vercel build; it is not copied into this repository's Git tree.

## Build

```bash
npm install
npm run build
```

The generated static application is written to `dist/`.

## Phase 2

The private administrator area for supported add-on and application configuration is planned for Phase 2. It is not exposed in the public application in Phase 1.
