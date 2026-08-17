# Changelog

## 0.1.0 — 2026-08-17

- Add provider-native OAuth, device-code, magic-link, and MFA handoff.
- Keep provider details in memory and durable lifecycle metadata mode `0600`.
- Add authenticated loopback UI with short-lived grants, CSRF checks, and
  one-use action nonces.
- Add explicit macOS LaunchAgent installation, diagnostics, Codex skill, and
  ownership-checked uninstall.
- Add optional allowlisted Tailscale Serve support without configuring
  Tailscale or enabling public exposure.
