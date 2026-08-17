# Data handling

The design keeps enough metadata to show whether a request was completed while
making sensitive approval material disappear on restart.

| Data | Location | Lifetime |
| --- | --- | --- |
| Opaque request ID | Durable ledger | Until history cleanup |
| Request kind | Durable ledger | Until history cleanup |
| Lifecycle status and timestamps | Durable ledger | Until history cleanup |
| Terminal outcome | Durable ledger | Until history cleanup |
| Provider name | Daemon memory | Until completion, expiry, or restart |
| Action title | Daemon memory | Until completion, expiry, or restart |
| Provider URL | Daemon memory | Until completion, expiry, or restart |
| Device code | Daemon memory and authenticated page | Until completion, expiry, or restart |
| Instructions | Daemon memory and authenticated page | Until completion, expiry, or restart |
| Browser grant and CSRF token | Daemon memory and protected cookie/session | At most 15 minutes |
| Local bootstrap nonce | Daemon memory | One use or 60 seconds |
| CLI waiter | Process memory | Until terminal state or timeout |

Provider details are accepted through standard input and a mode-`0600` Unix
socket. They are rejected in command arguments and omitted from CLI output.

The ledger is written atomically with mode `0600` inside a mode-`0700`
directory. A restart converts pending requests to `interrupted` because their
memory-only details no longer exist.
