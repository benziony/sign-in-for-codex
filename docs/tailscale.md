# Optional Tailscale access

Tailscale is not required for local use. It is useful when Codex runs on an
always-on Mac and you need to finish a sign-in from your phone.

The supported design is:

```text
tailnet device -> Tailscale Serve HTTPS -> 127.0.0.1-only daemon
```

Configure an exact `allowedLogins` list and a `publicBaseUrl` before enabling
Serve. The daemon accepts Tailscale identity headers only on its loopback
listener and binds the browser grant to that identity.

Tailscale Funnel is unsupported because it exposes the service to the public
internet. Do not bind the daemon to a tailnet IP, LAN interface, `0.0.0.0`, or
`::`.

The installer deliberately makes no Tailscale changes. A future release will
provide a doctor check and copy-paste Serve command after the local-only path is
healthy.
