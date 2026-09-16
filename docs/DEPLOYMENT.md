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
cp .env.example .env        # optional: where Flowly answers, and how it is tuned
mkdir -p data               # the vault lives here; create it as your own user
docker compose pull         # fetch the image CI published, no local build
docker compose up -d
```

The server image comes from the GitHub Container Registry, built and published by
[.github/workflows/image.yml](../.github/workflows/image.yml) for `linux/amd64`
and `linux/arm64`: pulling it takes seconds, while building it locally compiles
SQLCipher from source and takes minutes (tens of minutes on a Raspberry Pi 3).
`docker compose up --build -d` still works and builds from source, and Compose
falls back to that on its own when the registry has no image for the tag yet.

One `.env`, in the repository root, configures the stack. `compose.yaml` at the
root only includes the stack definition in `deployment/self-hosted/`, which keeps
the Compose project directory here — and the project directory is where Compose
looks for `.env`. Run `docker compose config | grep -E "host_ip|published"` after
editing it to see what Compose resolved.

Create the folder the vault lives in before the first start, as your own user:

```bash
mkdir -p data
```

Docker creates a missing bind-mount source directory as `root`, and the server
runs as uid 1000 inside its container, so a `data/` born that way can never be
written to: creating the vault fails with `vault_storage_unavailable`. If it
already happened, `sudo chown -R 1000:1000 data` is the fix. On Docker Desktop
(macOS, Windows) the mount hides the difference, so a stack can work there for
months and fail the first time it runs on a Linux host.

`deployment/self-hosted/startup.sh` takes care of this before it starts the
stack: it creates the folder as the user running the script and, when it has the
rights (it runs as root from the systemd unit in
[AUTOMATIC_STARTUP.md](./AUTOMATIC_STARTUP.md)), it fixes the ownership too. On
Docker Desktop it leaves the folder untouched, because that mount ignores
ownership and the change would only hurt.

Two containers start:

- `server` — the TypeScript service, listening on port 8787 **inside** the
  Compose network, with the vault in `./data/vault` inside the project.
- `proxy` — Caddy terminating HTTPS on `127.0.0.1:8443` and forwarding to the
  server. Only HTTPS is exposed; plain HTTP is not published, so there is no
  half-configured redirect to work around.

Only the proxy publishes ports, and only on the loopback interface. To reach the
server from another device on your private LAN or VPN, set the interface and the
port in `.env` — for example:

```bash
FLOWLY_BIND_IP=192.168.1.20        # Linux: the address of this machine
FLOWLY_SITE_PORT=8443
FLOWLY_SITE_ADDRESS=flowly.local   # or <machine>.<tailnet>.ts.net
```

and start the stack again. `0.0.0.0` publishes on every interface: only do that
inside a private network you control.

Want the stack and the tailnet mapping to come back by themselves after a
reboot? [AUTOMATIC_STARTUP.md](./AUTOMATIC_STARTUP.md) walks through Docker,
Tailscale and the `deployment/self-hosted/startup.sh` script, including the
systemd unit that runs it at boot.

Flowly never asks your router to open a port (no UPnP, no NAT-PMP), so anything
reachable from the internet is reachable because a forward exists somewhere
else. Worth checking once, because routers often ship with UPnP enabled and a
device on the LAN can then open ports without asking:

```bash
upnpc -l          # lists the router's UPnP mappings (brew install miniupnpc)
```

Any mapping pointing at the machine that runs Flowly, or a DMZ host set to it,
means that port is exposed to the internet. Remove the forward, turn UPnP off on
the router, and prefer `tailscale serve` when only your own devices should reach
Flowly.

On **Docker Desktop** (macOS and Windows) the published port is opened from
Docker's own Linux VM, which does not own the host's interfaces. Naming a LAN or
Tailscale address there fails with
`ports are not available: … bind: can't assign requested address`, so use
`FLOWLY_BIND_IP=0.0.0.0` and rely on the private network around the machine. On
Linux, binding the specific interface is the tighter choice.

Prefer not to publish on every interface on a Mac? Keep
`FLOWLY_BIND_IP=127.0.0.1` and put Tailscale in front of the stack, so only the
tailnet reaches it:

```bash
tailscale serve --bg --https=443 https+insecure://127.0.0.1:8443
tailscale serve status          # https://<machine>.<tailnet>.ts.net → Caddy
```

Tailscale terminates TLS with a real certificate for the tailnet name and
forwards to Caddy, whose own local-CA certificate is skipped by
`https+insecure`. Untrusted-certificate warnings disappear for tailnet devices,
and the Enable Banking callback URL becomes
`https://<machine>.<tailnet>.ts.net/enablebanking/auth_callback`.

The port becomes part of every URL, including the Enable Banking callback URL:
with the defaults above the address is `https://<host>:8443/…`. Publish on the
default HTTPS port instead (`FLOWLY_SITE_PORT=443`) if you want an address
without a port, and register and save exactly the address you end up using.

Changing the port takes one command — the published mapping belongs to the
`proxy` service, so Compose recreates that container when the value changes:

```bash
# after editing FLOWLY_SITE_PORT in .env
docker compose up -d
docker compose ps   # check the mapping
```

There is no extra flag to add: `up -d` replaces a container whose configuration
changed. If the mapping still shows the old port, recreate the containers
explicitly — the vault is a bind mount in `data/`, so this keeps it:

```bash
docker compose down
docker compose up -d
```

Never add `-v` to `down` unless you want the named volumes gone as well.

Check it:

```bash
curl -k https://127.0.0.1:8443/api/health
curl -k https://127.0.0.1:8443/            # the web client
docker compose ps
```

## Certificates

Two ways to stop the browser warning — pick by how Flowly is reached:

**Tailnet only (no trusting anything).** Keep `FLOWLY_BIND_IP=127.0.0.1` and let
Tailscale terminate TLS with a real certificate for the tailnet name:

```bash
tailscale serve --bg --https=443 https+insecure://127.0.0.1:8443
```

Nothing to install on any device that is on your tailnet, and nothing published
on the LAN.

**LAN, localhost or plain Compose (trust Caddy's local CA).** Caddy signs with
its own CA, so each device has to trust that root once. One command exports it
from the Caddy volume and prints the platform command:

```bash
pnpm ca:export        # writes data/flowly-local-ca.crt and shows the next step
pnpm ca:trust         # the same, and runs the trust command (asks for sudo)
```

By hand it is:

```bash
cp data/caddy/data/caddy/pki/authorities/local/root.crt data/flowly-local-ca.crt

# macOS
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain data/flowly-local-ca.crt

# Linux (Debian/Ubuntu)
sudo cp data/flowly-local-ca.crt /usr/local/share/ca-certificates/flowly-local-ca.crt
sudo update-ca-certificates
```

Phones need the same certificate installed as a profile, with full trust enabled
for it afterwards. Then open Flowly at the address in `.env`; the address bar
shows a normal padlock instead of "Not secure".

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
docker compose down
git pull                     # or check out the new tag
docker compose pull          # the image CI built for that commit
docker compose up -d
```

Using `deployment/self-hosted/startup.sh` instead? It notices the new commit by
itself, pulls the published image for it, and builds only when the registry has
nothing for that commit. It also clears the image layers the new one replaced,
which is what keeps a small disk from filling up: see
[AUTOMATIC_STARTUP.md](./AUTOMATIC_STARTUP.md#when-the-image-is-built).

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
