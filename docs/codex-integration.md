# Codex integration

The installed skill triggers when Codex is blocked by a login, OAuth approval,
device code, MFA prompt, or credential request.

The provider payload travels through standard input:

```bash
sign-in-for-codex request provider --stdin --wait <<'JSON'
{
  "provider": "Example Provider",
  "action": "Approve repository access",
  "url": "https://login.example.test/approve",
  "deviceCode": "ABCD-EFGH",
  "instructions": "Open the provider and enter the code.",
  "expiresInSeconds": 900
}
JSON
```

Do not put provider URLs, codes, instructions, credentials, or capability
material in argv. The CLI intentionally has no `--url`, `--code`, or `--secret`
option.

After the result is `completed`, rerun the blocked provider or CLI operation.
Only that downstream check proves authentication succeeded.
