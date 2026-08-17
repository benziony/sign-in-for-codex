---
name: sign-in-for-codex
description: Hand a provider approval URL, OAuth device code, or MFA approval from Codex to the user through the local Sign In for Codex page. Use when a command or task is blocked because the user must finish signing in to another service. Do not use for signing in to Codex itself, storing passwords, or inventing a login flow.
---

# Sign In for Codex

Use the provider's own approval flow and keep sensitive details out of chat,
arguments, logs, and durable files.

1. Prefer an existing provider-native OAuth, device-code, magic-link, or MFA
   approval flow. Do not ask for a password when one of those works.
2. Build one JSON object in memory with `provider`, `action`, HTTPS `url`,
   `expiresInSeconds`, and optional `deviceCode` or `instructions`.
3. Pipe that object through standard input:

   ```bash
   printf '%s' "$PROVIDER_APPROVAL_JSON" | sign-in-for-codex request provider --stdin --wait
   ```

4. Tell the user plainly: “I need you to finish signing in to PROVIDER. Open
   Sign In for Codex on your Mac.” Never paste the approval URL or code into
   chat.
5. Treat `completed` as the user's claim that the provider flow is finished,
   not proof of access. Rerun the exact blocked operation and verify success.

Fail closed if the provider does not offer a safe approval flow or if the local
helper is unavailable. Do not move sensitive values into command arguments,
temporary files, environment variables, Git, issue trackers, or alternate chat
messages as a workaround.
