# Threat model

## Assets

- Provider approval URLs and device codes.
- The user's provider session and granted scopes.
- Browser grants, CSRF tokens, and local bootstrap nonces.
- The integrity of the request lifecycle shown to the user and Codex.

## Trust boundaries

- Codex/CLI to daemon: a mode-`0600` Unix socket owned by the current user.
- Browser to daemon: loopback HTTP, optionally proxied by private Tailscale
  Serve HTTPS.
- Human to provider: a new tab on the provider's canonical HTTPS origin.
- Durable ledger to memory-only request details.

## In-scope attackers

- A remote caller without the approved Tailscale identity.
- A malicious website attempting CSRF or framing.
- A malicious provider page trying to influence the local handoff UI.
- Prompt-injected content asking Codex to expose a code, URL, or credential.
- Accidental disclosure through argv, logs, state files, package contents, or
  Git history.
- A stale browser grant or replayed action.
- A daemon crash or restart during approval.

## Controls

- Explicit `127.0.0.1` binding; no LAN or public listener.
- Unix socket permissions and current-user ownership.
- HTTPS-only provider URLs with userinfo rejected.
- No server-side provider fetch.
- HttpOnly, SameSite=Strict, idle-limited and absolute-limited grants.
- Exact Origin checks, per-session CSRF tokens, and one-use action nonces.
- No-store responses, restrictive CSP, frame denial, no-referrer, and MIME
  sniffing denial.
- Text-only DOM rendering and no third-party assets.
- Atomic allowlisted persistence and fail-closed restart behavior.

## Explicit limitations

This project does not protect against root, physical compromise, or a malicious
process already running as the same macOS user. A same-user process can read
process memory, access the Unix socket, or spoof proxy headers on loopback.

The provider controls its own page, consent language, scopes, and authentication
policy. Users must verify the hostname and requested access before approving.

Opening a provider URL can place it in ordinary browser history. Copying a
device code can place it on the clipboard. The project avoids doing either
automatically.

Tailscale Serve is an optional transport, not a defense against a compromised
tailnet account. Funnel and other public exposure are unsupported.
