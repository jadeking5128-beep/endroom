# Security

- Passwords are verified using scrypt with a per-password random salt. Plaintext passwords are never stored.
- Browser sessions are encrypted with AES-256-GCM and held in Secure, HttpOnly, SameSite=Strict cookies.
- Authentication and sandbox API keys are server-only environment variables.
- Commands are allowlisted and shell metacharacters are rejected before reaching the isolated runtime.
- Relative workspace paths are validated; parent-directory traversal and absolute paths are blocked.
- Sandboxes have a short automatic timeout.

## Important limitations

The in-memory sign-in throttle is best-effort on serverless deployments. Production use should add a shared rate-limit store, account recovery policy, audit monitoring and independent security review. The current restricted command set is not intended for sensitive production workloads.
