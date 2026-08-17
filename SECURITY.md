# Security policy

## Supported versions

No version is supported yet. The repository is in private alpha until `0.1.0`
passes the publication security gate.

After `0.1.0`, the latest minor release will receive security fixes. Older
releases may be asked to upgrade before a fix is backported.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not open a
public issue containing an exploit, provider URL, device code, credential,
cookie, local path, tailnet identity, or other sensitive material.

Include the affected version, a minimal reproduction using synthetic values,
impact, and any suggested mitigation. You should receive an acknowledgment
within seven days.

## Security boundary

Read [docs/threat-model.md](docs/threat-model.md) and
[docs/data-handling.md](docs/data-handling.md). This project is not designed to
protect against root or a malicious process already running as the same macOS
user.
