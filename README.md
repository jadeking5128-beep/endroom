# ENDROOM

ENDROOM is a browser-based Linux development workspace.

## Phase 2 architecture

- Static frontend served by Vercel.
- Server-side username/password authentication.
- Password verification with scrypt; no plaintext password is stored.
- AES-256-GCM encrypted, HttpOnly, Secure, SameSite=Strict session cookie.
- Isolated Linux workspaces provisioned through the E2B JavaScript SDK.
- Short sandbox lifetime and a deliberately restricted command interface.

## Configure deployment

Set these **server-only** environment variables in Vercel:

- `ENDROOM_USERNAME`: the account username.
- `ENDROOM_PASSWORD_HASH`: generate locally with `node scripts/hash-password.mjs`.
- `SESSION_SECRET`: a fresh 32-byte random value encoded as base64.
- `E2B_API_KEY`: your sandbox provider API key.

Do not put these values in GitHub, the browser, or public-prefixed environment variables. If a password has been shared in chat or committed, rotate it and use a new one.

After adding variables, redeploy the project. Without these values, the sign-in screen stays closed to access and no guest session is available.

## Runtime safety

The current command interface intentionally supports only a limited set of basic workspace commands. It rejects shell chaining, redirection, command substitution, absolute paths, parent-directory traversal, and unrestricted script execution. It is not a root shell and does not provide arbitrary command execution.

The sandbox is temporary. Workspace persistence, file browser/editor, package workflows, richer terminal I/O and multi-tab support are future work. Review the provider's isolation and retention terms before storing important data.

## Local development

```sh
npm install
node scripts/hash-password.mjs
```

Use a local environment file for development only; never commit it. Deploy through Vercel with the required server-side variables.
