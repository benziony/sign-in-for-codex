# Sign In for Codex

> Finish the sign-ins Codex gets stuck on—without pasting passwords into chat.

**Unofficial local macOS helper. This project is independent and is not
affiliated with, endorsed by, or sponsored by OpenAI.**

When Codex needs you to log in to another service, approve OAuth, enter a
device code, or respond to MFA, the request appears on one private page. Open
it from your Mac—or through a private Tailscale connection—finish the provider's
own sign-in, then let Codex verify that the blocked command works.

This is **not** a tool for signing in to Codex itself.

## Why this exists

Long-running and remote Codex tasks often stop at the same awkward moment:
the command is waiting for a human, but the approval link is buried in terminal
output, the browser is on another machine, or asking for a password in chat
would be unsafe.

Sign In for Codex gives that moment a small, explicit handoff:

1. Codex starts the provider's normal login or device-code flow.
2. The request appears on a private page.
3. You approve it directly with the provider.
4. Codex reruns the blocked operation and verifies that access works.

Provider-native approval comes first. A private browser and encrypted macOS
Keychain fallback are planned behind separate security gates; version `0.1.0`
deliberately fails closed when a reusable secret would be required.

## Current status

Version `0.1.0` implements provider approval and device-code handoff on macOS.
It intentionally does not collect reusable passwords or depend on 1Password,
another password manager, or a hosted credential service.

## Safety model

- The web service listens only on `127.0.0.1`.
- Agent/CLI requests use a private Unix socket, not the web listener.
- Approval URLs, device codes, instructions, cookies, grants, and CSRF tokens
  exist only in memory.
- The durable ledger contains lifecycle metadata only.
- A restart interrupts pending requests instead of reconstructing sensitive
  material.
- There is no hosted service, telemetry, public tunnel, password manager, or
  required vault.
- Tailscale Serve is optional; Tailscale Funnel is unsupported.

See [How it works](docs/how-it-works.md), [Data handling](docs/data-handling.md),
and the [Threat model](docs/threat-model.md) before installing.

## Development

```bash
npm ci
npm run check
npm pack --json
```

The release artifact is an npm-compatible tarball attached to GitHub Releases.
The npm registry is not required.

## Install

```bash
npm install -g https://github.com/benziony/sign-in-for-codex/releases/download/v0.1.0/sign-in-for-codex-0.1.0.tgz
sign-in-for-codex install
sign-in-for-codex doctor --json
```

Installation is explicit. The package has no mutating `postinstall`, does not
use `sudo`, and does not configure Tailscale automatically.

## Use from Codex

The installer adds a small Codex skill. When a provider login blocks work, the
skill starts this command with a writable standard input stream:

```bash
sign-in-for-codex request provider --stdin --wait
```

Codex writes one JSON object directly to that process's standard input and then
closes the stream. It must not interpolate the payload into a shell command,
shell variable, `printf`, heredoc, environment variable, or temporary file.
After you press **I'm done**, Codex still has to rerun the blocked command. A
click is not proof that authentication succeeded.

## Uninstall

```bash
sign-in-for-codex uninstall
```

Uninstall removes only paths recorded in the project's installation manifest.
See [Uninstall](docs/uninstall.md) for the exact boundary.

## Contributing and security

Please open ordinary bugs and feature requests in GitHub Issues. Do not post a
suspected vulnerability or sensitive authentication detail publicly; follow
[SECURITY.md](SECURITY.md).

Apache-2.0 licensed. See [NOTICE](NOTICE) for trademark and attribution notes.
