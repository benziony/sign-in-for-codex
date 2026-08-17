# Migration boundary

The private system that proved this workflow remains separately owned and
unchanged during public development.

Sign In for Codex uses new Git history, generic configuration, fresh code,
synthetic fixtures, a new LaunchAgent label, a new package name, and a separate
runtime directory. Private host configuration and deployment state are not
inputs to the public package.

Compatibility work compares observable behavior only. The private system will
not depend on this package until a public release passes independent security,
installer, package, and bounded production compatibility checks. Until then,
the private implementation remains the rollback path.
