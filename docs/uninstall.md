# Uninstall

`sign-in-for-codex uninstall` reads the installation manifest and removes only
the exact paths owned by this project under these roots:

- `~/Library/Application Support/sign-in-for-codex`
- `~/Library/LaunchAgents/io.github.benziony.sign-in-for-codex.plist`
- the configured Codex skills directory, only when the project-created symlink
  still points to the installed skill

The uninstaller refuses malformed paths, symlink traversal, a changed skill
target, or a LaunchAgent it cannot identify as project-owned. It never uses
`sudo` and never removes another application's credentials or configuration.

The alpha has no Keychain fallback, so it creates no Keychain items.
