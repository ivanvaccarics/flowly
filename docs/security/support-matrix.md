# Support matrix (Server MVP)

| Area | Supported | Notes |
| --- | --- | --- |
| Container platforms | Linux `amd64`, Linux `arm64`, Docker Desktop (macOS, Windows/WSL 2) | Multi-arch image built and verified in CI |
| Orchestration | Docker Compose v2 | Single-host, single-vault deployments |
| Browsers | Current Chrome, Firefox, Safari, Edge | Same-origin app served by the server |
| Network | Private LAN or user-managed VPN, HTTPS via the bundled Caddy proxy | Public Internet exposure is not supported |
| Storage engine | SQLCipher 4 (`sqlcipher`) | Primary |
| Storage engine (fallback) | `node:sqlite` + AES-256-GCM per record (`record-encryption`) | Needs Node's `--experimental-sqlite`; visible ids and dates on disk |
| Currencies | ISO 4217 codes with known minor units (EUR, USD, GBP, CHF, JPY, KRW, KWD, BHD) | Unsupported codes are rejected; no implicit conversion |
| Export formats | Transaction CSV, plain-text tables ZIP (`flowly-tables-v1`), complete portable archive (format version 1) | The ZIP is for leaving with your data; the archive is the restore and transfer format. See `contracts/csv/export-format-v1.md` |
| Import formats | Transaction CSV, complete portable archive (format version 1) | See `contracts/csv/export-format-v1.md` |
| Node.js | 22.12 or newer | 22.9 works with a Vite warning |
| Languages | English UI strings | Externalized for later translation |
| Accessibility | Keyboard-operable forms, labelled fields, live regions, WCAG 2.2 AA target | Automated structure checks plus a documented manual review; a full assistive-technology audit is still pending |
| Backups | Manual encrypted archive export | Automatic encrypted backups: Phase 12 |
| Multi-user | Not supported | One owner, one vault |
