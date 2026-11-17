# Security baseline

ENDROOM is not a general-purpose public shell yet. Phase 1 intentionally does not execute commands on a server.

## Credentials
- Never commit passwords, API keys, provider tokens, private keys or session secrets.
- Do not place credentials in frontend JavaScript, HTML, source maps or public environment variables.
- Future authentication must verify passwords on the server and store only a salted, slow password hash such as Argon2id.
- Use a unique password. If a password has been pasted into a chat, issue tracker or source file, treat it as exposed and rotate it before production use.
- Keep provider credentials in Vercel server-side environment variables or a dedicated secrets manager.

## Command execution (Phase 2)
- Execute commands only inside isolated, unprivileged sandboxes.
- Do not mount host filesystems, expose host sockets, or grant privileged container capabilities.
- Apply CPU, memory, disk, process-count and wall-clock limits.
- Enforce per-user isolation, network egress policy, session expiry and rate limits.
- Validate every session and workspace identifier server-side.
- Never construct shell commands by concatenating untrusted user input into a command string.
- Log security-relevant events without recording passwords, tokens or private file contents.

## Data protection
- Require HTTPS and WSS in production.
- Use secure, HttpOnly, SameSite cookies for browser sessions.
- Protect state-changing endpoints against CSRF.
- Encrypt sensitive stored data with managed keys and rotate keys through the provider's key-management system.
- Provide deletion and expiry policies for workspace data.

## Reporting
Do not use ENDROOM for sensitive workloads until the sandbox, authentication and data-protection phases have been completed and independently reviewed.
