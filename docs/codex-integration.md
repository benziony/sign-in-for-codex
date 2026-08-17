# Codex integration

The installed skill triggers when Codex is blocked by a login, OAuth approval,
device code, MFA prompt, or credential request.

Start the CLI with a writable standard input stream:

```bash
sign-in-for-codex request provider --stdin --wait
```

The invoking agent writes one JSON object directly to that process's stdin and
closes the stream. The object contains `provider`, `action`, HTTPS `url`,
`expiresInSeconds`, and optional `deviceCode` or `instructions`.

Do not interpolate provider URLs, codes, instructions, credentials, or
capability material into a shell command, `printf`, heredoc, environment
variable, temporary file, or argv. The CLI accepts no provider-detail options.

After the result is `completed`, rerun the blocked provider or CLI operation.
Only that downstream check proves authentication succeeded.
