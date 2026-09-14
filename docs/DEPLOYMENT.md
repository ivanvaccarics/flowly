# Deploying Flowly

How to install, upgrade, roll back and back up a self-hosted Flowly server. The
short version: it runs on your hardware, on a private network, with no Flowly
service involved.

## Supported hosts

| Host | Status |
| --- | --- |
| Linux `amd64` (Docker Engine + Compose v2) | Supported |
| Linux `arm64` (Docker Engine + Compose v2) | Supported |
| Docker Desktop on macOS (Apple Silicon, Intel) | Supported |
| Docker Desktop on Windows (WSL 2 backend) | Supported |
| Anything requiring public Internet exposure | **Not supported** |

The image is built for `linux/amd64` and `linux/arm64` and is published by CI as
a multi-architecture image with SBOM and provenance attestations.

## Install

```bash
git clone <your fork or checkout>
cd flowly
cp .env.example .env                              # local server defaults, optional
cp deployment/self-hosted/.env.example deployment/self-hosted/.env
docker compose -f deployment/self-hosted/compose.yaml up --build -d
```

Compose substitutes its variables from the `.env` **next to the compose file**.
The repository root `.env` lists the variables the server itself reads from its
environment and is not consulted by this stack, so editing it and restarting
changes nothing — `docker compose config` showing the defaults is the symptom.
The alternative to the folder file is an explicit
`docker compose --env-file .env -f deployment/self-hosted/compose.yaml up -d`.

Two containers start:

- `server` — the TypeScript service, listening on port 8787 **inside** the
  Compose network, with the vault in `./data/vault` inside the project.
- `proxy` — Caddy terminating HTTPS on `127.0.0.1:8443` and forwarding to the
  server. Only HTTPS is exposed; plain HTTP is not published, so there is no
  half-configured redirect to work around.

Only the proxy publishes ports, and only on the loopback interface. To reach the
server from another device on your private LAN or VPN, set the interface and the
port in `deployment/self-hosted/.env` — for example:

```bash
FLOWLY_BIND_IP=192.168.1.20        # or the Tailscale address of this machine
FLOWLY_SITE_PORT=8443
FLOWLY_SITE_ADDRESS=flowly.local   # or <machine>.<tailnet>.ts.net
```

and start the stack again. `0.0.0.0` publishes on every interface: only do that
inside a private network you control.

The port becomes part of every URL, including the Enable Banking callback URL:
with the defaults above the address is `https://<host>:8443/…`. Publish on the
default HTTPS port instead (`FLOWLY_SITE_PORT=443`) if you want an address
without a port, and register and save exactly the address you end up using.

Changing the port takes one command — the published mapping belongs to the
`proxy` service, so Compose recreates that container when the value changes:

```bash
# after editing FLOWLY_SITE_PORT in deployment/self-hosted/.env
docker compose -f deployment/self-hosted/compose.yaml up -d
docker compose -f deployment/self-hosted/compose.yaml ps   # check the mapping
```

There is no extra flag to add: `up -d` replaces a container whose configuration
changed. If the mapping still shows the old port, recreate the containers
explicitly — the vault is a bind mount in `data/`, so this keeps it:

```bash
docker compose -f deployment/self-hosted/compose.yaml down
docker compose -f deployment/self-hosted/compose.yaml up -d
```

Never add `-v` to `down` unless you want the named volumes gone as well.

Check it:

```bash
curl -k https://127.0.0.1:8443/api/health
curl -k https://127.0.0.1:8443/            # the web client
docker compose -f deployment/self-hosted/compose.yaml ps
```

## Certificates

Caddy issues certificates from its own local CA. Browsers will warn until you
trust that CA — this is the "guided local certificate enrollment" step:

```bash
docker compose -f deployment/self-hosted/compose.yaml \
  exec proxy cat /data/caddy/pki/authorities/local/root.crt > flowly-local-ca.crt

# macOS
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain flowly-local-ca.crt

# Linux (Debian/Ubuntu)
sudo cp flowly-local-ca.crt /usr/local/share/ca-certificates/flowly-local-ca.crt
sudo update-ca-certificates
```

Then open `https://flowly.local:8443` (or whatever `FLOWLY_SITE_ADDRESS` says).
Delete `flowly-local-ca.crt` from where you exported it once it is installed.

Direct IP access works too: Caddy falls back to the `localhost` certificate when
the client sends no SNI (`default_sni localhost`), so `https://192.168.1.20:8443`
completes the handshake — you will still want the CA trusted to avoid warnings.

## HTTPS in the application

The proxy adds `X-Forwarded-Proto`, and the server runs with
`FLOWLY_TRUST_PROXY=true`, so session cookies are marked `Secure` and HSTS is
sent. The server also sets `Content-Security-Policy`, `X-Content-Type-Options`,
`Referrer-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy` and
`Permissions-Policy` on every response.

Requests coming from the app the server itself serves are always trusted; a
foreign `Origin` is rejected. Set `FLOWLY_ALLOWED_ORIGIN` only when a different
host must call the API (for example a separately served front-end), which is why
it is empty by default.

## Backup and restore

Manual exports are the supported backup in the MVP (automatic encrypted backups
are Phase 12):

1. Open the app, unlock the vault, go to **Import & export**.
2. **Export complete archive** and store the file where you keep backups.
3. Keep the archive password somewhere separate; without it the file is
   unreadable, by design.

Both containers write into the project's `data/` folder through bind mounts, so
nothing is hidden inside a Docker volume:

```text
data/vault/          the encrypted vault (vault.json, vault.db, snapshots/)
data/caddy/data/     the local certificate authority and issued certificates
data/caddy/config/   Caddy's runtime configuration
```

`data/` is git-ignored: financial data must never end up in a commit.

To restore, start a fresh deployment with an empty `data/vault` folder, create a
vault with any passphrase you will remember, unlock it and import the archive
over it; the import validates the checksums and replaces the vault atomically.

The vault lives in `./data/vault` on the host, so you can see it, size it and
copy it. Copying `vault.db` while the container is running is **not** a supported
backup: the WAL file may be inconsistent. Stop the stack
(`docker compose ... down`) for a file-level copy, or use the archive export,
which is the supported path.

## Upgrade

```bash
docker compose -f deployment/self-hosted/compose.yaml down
git pull                     # or check out the new tag
docker compose -f deployment/self-hosted/compose.yaml up --build -d
```

On startup the server applies pending migrations. Every migration runs in a
transaction, and any failure rolls back to the previous schema, so an
interrupted upgrade never leaves a half-migrated vault. Before a schema change,
take an archive export.

Check the result:

```bash
curl -k https://127.0.0.1:8443/api/system/info
# { "version": "...", "schemaVersion": 2, ... }
```

## Rollback

1. Stop the stack: `docker compose ... down`.
2. Take the archive export from **before** the upgrade, or the snapshot the
   upgrade created under `data/vault/snapshots/`.
3. Start the previous image tag (`docker compose ... up -d` with that tag, or
   rebuild from the previous commit).
4. If the newer schema had been applied and you need the old one, restore from
   the pre-upgrade archive export: create a fresh vault and import it.

The vault never migrates backwards on its own; restoring the pre-upgrade data is
an explicit, user-driven action.

## Health, monitoring and logs

- `GET /api/health` — liveness, no vault access, safe for Docker health checks.
- `GET /api/system/info` — version, schema version, engine, uptime.
- `docker compose ... logs -f server` — request logs; never passphrases,
  financial payloads or keys.

## Hardening checklist

- Keep the published ports bound to loopback or to a private LAN/VPN interface.
- Never forward these ports from your router, and never put the stack on a
  public host.
- `FLOWLY_ALLOW_PUBLIC_BIND=true` only exists for containers whose port mapping
  stays private; there is no reason to set it on a bare host.
- Review `docs/security/threat-model.md` before exposing the server to a shared
  network.
- Regenerate `docs/security/sbom.json` with `pnpm release:report` on every
  dependency change; CI fails on denied licenses. The report ignores
  platform-specific optional bindings, so it is byte-identical on macOS, Linux
  and Windows and CI's `git diff --exit-code -- docs/security` stays meaningful.
