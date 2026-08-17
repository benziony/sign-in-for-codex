# How it works

## The moment this handles

Codex runs a command. The command says a person must open a provider page,
approve OAuth, enter a device code, or respond to MFA. Codex cannot safely make
that decision for you, and you should not paste a password into chat.

Sign In for Codex moves only that human step to a private page.

## Provider approval flow

1. Codex starts the provider's own authentication flow.
2. A Codex skill sends the provider page, optional device code, and plain
   instructions to the local daemon over a private Unix socket.
3. You open Sign In for Codex locally or through optional Tailscale Serve.
4. You continue on the provider's real HTTPS page.
5. You mark the handoff done or deny it.
6. Codex reruns the blocked command and verifies the result independently.

The daemon never fetches the provider page and never exchanges OAuth tokens.
It is a handoff surface, not an identity provider.

## What “done” means

“I'm done” means only that the human step is finished. It does not prove that
the provider accepted the login, the requested scope was granted, or the CLI
stored a usable credential. The invoking Codex workflow must verify those facts.

## Current alpha boundary

The first alpha handles provider-owned approval and device-code flows. It does
not collect reusable passwords. Supervised-browser and encrypted Keychain
fallbacks remain unavailable until their separate security reviews pass.
