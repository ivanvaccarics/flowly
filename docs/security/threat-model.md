# Flowly Server MVP threat model

Scope: the self-hosted server, its browser sessions, the encrypted vault on
disk, and the import/export files the user moves by hand.

## Assets

1. The vault contents: accounts, transactions, notes, tags and rules.
2. The passphrase and the data-encryption key (DEK).
3. Session cookies and CSRF tokens.
4. Export files: plaintext transaction CSV and the password-encrypted archive.

## Adversaries

| Adversary | Capability |
| --- | --- |
| Someone with the disk | Reads the volume, copies files, powers the host off |
| Someone on the local network | Reaches the published port, scans, sends requests |
| A malicious browser page | Runs script in the user's browser, tries cross-site requests |
| A malicious import file | Crafts CSV or archive content to break the parser |
| A curious operator | Reads logs, container metadata and environment variables |

## Controls

| Threat | Control |
| --- | --- |
| Disk theft or snapshot leak | SQLCipher whole-file encryption with a per-vault key; the header stores only the Argon2id parameters and the wrapped DEK |
| Guessing the passphrase | Argon2id (19 MiB, t=2 by default) plus per-address rate limiting on unlock |
| Tampering with the vault | AES-256-GCM authentication on the wrapped DEK and, for the fallback engine, on every record; corruption fails closed |
| Stolen session cookie | `HttpOnly`, `SameSite=Strict`, `Secure` behind TLS, server-side idle and absolute expiry, `lock-all` revocation |
| Cross-site request forgery | Per-session CSRF token required on mutating requests plus an Origin allow-list |
| Unauthorized write | Revision checks on every mutation; a stale revision is rejected, never merged |
| Unlocked vault left running | Auto-lock when no session is active, lock-current, lock-all, keys zeroized on lock |
| Malicious import | Strict parsing with per-row errors, checksum manifest, "same vault" guard, orphan-reference checks, atomic replace with a pre-import snapshot |
| Formula injection in exports | `'` prefix on spreadsheet-triggering cells, plain numbers untouched |
| Public exposure by accident | The server refuses `0.0.0.0` without an explicit opt-in; Compose publishes loopback only |
| Sensitive data in logs | Request logging records method, URL and status only; payloads, passphrases and keys are never logged |

## Explicit non-goals (MVP)

- Multi-user access, roles or sharing: one owner, one vault.
- Protection against a host-level attacker with root who can read process memory
  while the vault is unlocked.
- Protection against a compromised browser or a keylogger on the client.
- Denial of service from a host on the network (the service is private by
  design).
- Provider-supplied data: Enable Banking arrives in Phase 6 with its own model.

## Residual risks

- A user who loses the passphrase loses the data: there is no recovery path by
  design (see `data-loss.md`).
- An unlocked vault is readable by anyone who gains access to the browser
  session until it expires or is locked.
- Malware on the client can read whatever that client can read.
