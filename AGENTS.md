# Sign In for Codex working agreement

Read `README.md`, `SECURITY.md`, `PROVENANCE.md`, and `docs/README.md` before
changing authentication, persistence, browser, installer, or release behavior.

- Lead documentation with the user problem: Codex needs the human to finish a
  sign-in to another service.
- Keep the daemon loopback-only and the agent API on a mode-`0600` Unix socket.
- Provider URLs, codes, instructions, grants, cookies, keys, and secrets are
  transient. Never add them to durable state, logs, argv, Git, or CLI output.
- Do not add hosted services, telemetry, public tunnels, arbitrary command
  execution, or a password-manager dependency.
- Use synthetic `example.test` fixtures only.
- Run `npm run check`, the public-boundary audit, package inspection, installer
  smoke, and a security diff review before release.
- The private production implementation is not a code source or shared runtime.
  Compatibility checks compare behavior only.
