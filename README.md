# ENDROOM

ENDROOM is a browser-based Linux workspace designed for mobile and desktop. The repository is being rebuilt in four phases.

## Build phases

1. **Foundation** — responsive terminal interface, project structure, health endpoint and security baseline.
2. **Linux engine** — isolated cloud Linux sandboxes, streamed terminal I/O and managed sessions.
3. **Workspace tools** — file browser, editor, multiple terminals, and supported development runtimes.
4. **Security and launch** — authentication, encryption, resource limits, abuse controls, testing and production deployment.

## Current status

Phase 1 provides the interface and a browser-only command preview. The preview supports a small set of harmless demonstration commands. It is **not** a Linux shell and does not execute commands on a server.

## Development

This is a static-first Vercel project. Open `index.html` locally or deploy the repository to Vercel. The health endpoint is available at `/api/health`.

No secrets are required for Phase 1. Copy `.env.example` to a local environment file only when a later phase introduces server configuration. Never commit real credentials.

## Architecture direction

Vercel serves the web interface and lightweight API routes. Actual Linux command execution will run in a separate, isolated sandbox provider in Phase 2. Vercel serverless functions are not persistent Linux machines.

See [SECURITY.md](SECURITY.md) for the security baseline and [ROADMAP.md](ROADMAP.md) for implementation scope.
