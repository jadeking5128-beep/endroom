# ENDROOM implementation roadmap

## Phase 1 — Foundation
- [x] Remove The Hollow Kingdom experience.
- [x] Add responsive terminal-first interface.
- [x] Add local-only safe command preview and command history.
- [x] Add a health endpoint and project documentation.
- [x] Establish secret-handling and sandbox security requirements.
- [ ] Verify the deployed Vercel build and endpoint.

## Phase 2 — Linux engine
- Integrate a managed Linux sandbox provider behind server-side API routes.
- Create isolated workspaces per authenticated user.
- Stream terminal input/output over an authenticated WebSocket or supported streaming transport.
- Add session lifecycle controls, idle expiry and resource quotas.
- Never expose provider credentials in browser code.

## Phase 3 — Workspace
- Add a file browser and editor scoped to the user's sandbox.
- Add multiple terminal tabs and session restoration.
- Add supported runtimes and package workflows.
- Enforce path boundaries and per-workspace storage limits.

## Phase 4 — Security and launch
- Add server-side authentication and secure session cookies.
- Hash passwords with Argon2id (or a reviewed equivalent); never store plaintext passwords.
- Encrypt transport with HTTPS/WSS and protect stored sensitive data with managed keys.
- Add CSRF protection, rate limits, audit events, sandbox isolation tests and abuse controls.
- Add deployment checks, monitoring, backups and documented recovery procedures.
