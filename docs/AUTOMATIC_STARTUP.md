# Automatic startup

How to make a self-hosted Flowly come back on its own after a reboot: Docker,
Tailscale, and one script that starts the stack and publishes it inside your
tailnet.

The result: the machine can be switched off, moved, or power-cycled by a
blackout, and when it returns your phone finds Flowly again at the same HTTPS
address — the same address the bank redirects to, so the bank connection keeps
working without touching the Enable Banking control panel.

> **One rule to remember:** this stack uses **Tailscale Serve**, never
> **Funnel**. Serve keeps Flowly private to your tailnet; Funnel publishes it to
> the public internet. `deployment/self-hosted/startup.sh` refuses a `--funnel`
> argument and warns if it finds a funnel already configured on the node.

## What runs, and what has to happen again after a reboot

| Piece | Comes back by itself? | Why |
| --- | --- | --- |
| Docker daemon | Yes, once enabled | `systemctl enable --now docker` |
| `server` and `proxy` containers | Yes, usually | `restart: unless-stopped` restarts them once the daemon is up |
| `tailscale serve` mapping | Yes, usually | `--bg` stores the mapping in tailscaled's state |
| Everything, in the right order | **No** | That is what the unit in [Run it after every reboot](#run-it-after-every-reboot) is for |

The script is deliberately boring: it waits for Docker, starts the stack,
waits for tailscaled, (re)applies the Serve mapping, and prints the address to
register at Enable Banking. Running it twice is harmless.

## 1. Before you start

- A machine that stays on: Raspberry Pi 4/5, a mini PC, a NAS, or your desktop.
  Supported hosts and their status are in [DEPLOYMENT.md](./DEPLOYMENT.md).
- Docker Engine with Compose v2 (Linux) or Docker Desktop (macOS/Windows).
- A Tailscale account, free for personal use.
- The repository checked out somewhere permanent, for example `/opt/flowly`.
  The examples below use that path: replace it with yours.

## 2. Install Docker

**Linux (Debian, Ubuntu, Raspberry Pi OS)** — Docker's convenience script, then
the two things it does not do for you:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"     # then log out and back in
sudo systemctl enable --now docker  # start it at boot
docker compose version              # must print v2.x
```

Prefer your distribution's packages? They work, but on older releases they may
ship Compose v1 or no Compose at all: the stack needs the `docker compose`
**plugin** (v2). Docker's own apt repository has `docker-ce` plus
`docker-compose-plugin`.

**macOS and Windows** — install Docker Desktop and turn on **Start Docker
Desktop when you sign in** (Settings → General). Desktop's engine runs in a VM,
which matters for one thing later: it cannot bind the host's LAN or Tailscale
address, so `FLOWLY_BIND_IP=0.0.0.0` is the value to use there.

## 3. Install Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up      # open the printed URL and approve the node
tailscale status       # the node should be listed and connected
```

Then, in the Tailscale admin console:

1. Enable **MagicDNS** for the tailnet (DNS settings).
2. Find the node's name — the fully qualified name looks like
   `<host>.<tailnet>.ts.net`. From the machine itself:

```bash
tailscale status --json | grep -m1 '"DNSName"'
```

Keep that name at hand: it is the address Flowly will be reached at, and it is
where the bank sends your browser back. `tailscale serve` provisions and renews
the HTTPS certificate for it automatically, so nothing has to be bought or
trusted.

## 4. Configure `.env`

```bash
cd /opt/flowly
cp .env.example .env
chmod 600 .env
$EDITOR .env
```

For the tailnet-only setup described here, three values matter:

```dotenv
FLOWLY_BIND_IP=127.0.0.1
FLOWLY_SITE_PORT=8443
FLOWLY_SITE_ADDRESS=<host>.<tailnet>.ts.net
```

- `FLOWLY_BIND_IP=127.0.0.1` keeps Caddy on loopback: nothing is published on
  the LAN. Tailscale Serve terminates TLS on port 443 and forwards here.
- `FLOWLY_SITE_PORT` is the **internal** port on loopback. Leave it at `8443`;
  the URL you browse has no port because Serve answers on 443.
- `FLOWLY_SITE_ADDRESS` is the hostname Caddy serves and the host of the Enable
  Banking callback URL. Set it to the MagicDNS name, so the callback URL
  Settings proposes is the address you actually use.

On Docker Desktop (macOS, Windows) use `FLOWLY_BIND_IP=0.0.0.0` instead: the
published port lives in Docker's VM and cannot own the loopback address of the
host, and binding a LAN or Tailscale address fails with
`bind: can't assign requested address`. Serve still reaches it on
`127.0.0.1:<port>` because that mapping lands on the host.

## 5. Start it once by hand

```bash
chmod +x deployment/self-hosted/startup.sh
./deployment/self-hosted/startup.sh --build
```

The script:

1. reads `.env` from the repository root (the Compose project directory, which is
   what makes Compose substitute those values),
2. waits for the Docker daemon, then runs `docker compose up -d` from the
   repository root (with `--build` when you asked for a rebuild),
3. waits for tailscaled, then applies
   `tailscale serve --bg --https=443 https+insecure://127.0.0.1:<FLOWLY_SITE_PORT>`,
4. prints `docker compose ps`, the tailnet URL, and the callback URL to register
   in Enable Banking.

`https+insecure` is correct here: Caddy answers with a certificate from its own
local CA, Tailscale terminates TLS with the real certificate for the tailnet
name in front of it, and Caddy's certificate is never validated by a device.

On Linux, `tailscale serve` talks to tailscaled and normally needs root: if the
last step complains about permissions, run the script with `sudo`, or give your
own user the operator role once (`sudo tailscale set --operator="$USER"`) and
run it as yourself from then on. The systemd unit below runs as root, so there
it is a non-issue.

Flags:

| Flag | Effect |
| --- | --- |
| `--compose-only` | Start the stack and stop; do not touch Tailscale |
| `--build` | Rebuild the `flowly-server:local` image first: use it after updating the code |
| `--help` | Usage, including the environment knobs the script honours |

### When the image is built

By default the script starts the stack without rebuilding: Compose builds
`flowly-server:local` only when the image is **missing**, and reuses it
otherwise. That is the behaviour a boot unit wants.

A rebuild is not cheap. The Dockerfile copies the whole build context in one
layer and then runs two `pnpm install` passes and three builds (contracts,
server, web), so any change to a tracked source file re-runs all of that — and a
cold cache needs the network. Forcing it on every boot would mean a Raspberry Pi
spending minutes compiling code it already compiled, with the app down until it
finishes, and a boot that can fail simply because the network is slow or absent.

So the rule is:

| When | What to run |
| --- | --- |
| First install, or after `git pull` with code changes | `./deployment/self-hosted/startup.sh --build` |
| Every boot | `./deployment/self-hosted/startup.sh --no-build` (the unit below) |
| Only the stack, Tailscale untouched | add `--compose-only` |

The unit never passes `--build`: a machine that comes back after a blackout has
the image already, and the first start of a fresh checkout still builds it,
because Compose builds a missing image even without the flag.

When a rebuild does happen, the Dockerfile is ordered so it stays cheap: the
manifests and the lockfile are copied first, the two `pnpm install` passes sit in
their own layer, and the sources come after them one workspace package at a time.
A change in the web client therefore leaves both installs in the cache and only
re-runs the web build and what comes after it, instead of reinstalling the whole
workspace.

Then check it from the machine itself:

```bash
docker compose ps                    # server healthy, proxy healthy
tailscale serve status               # the tailnet URL and its proxy target
curl -k https://127.0.0.1:8443/api/health
```

The last command answers something like
`{"status":"ok","version":"…","uptimeSeconds":12}`. The `-k` is expected: this
is the loopback URL, where Caddy presents its own CA.

From a device on the tailnet, open `https://<host>.<tailnet>.ts.net`, unlock the
vault, and register the callback URL in the Enable Banking control panel:

```text
https://<host>.<tailnet>.ts.net/enablebanking/auth_callback
```

Open Flowly at that same address before pressing **Connect**: see
[Where the callback URL goes](./RUNNING.md#the-callback-url-has-to-be-the-address-you-use).

## 6. Run it after every reboot

### Linux: a systemd unit (recommended)

Create `/etc/systemd/system/flowly-startup.service` with your real path in the
three places that mention `/opt/flowly`:

```ini
[Unit]
Description=Flowly — self-hosted stack and Tailscale Serve
Documentation=file:///opt/flowly/docs/AUTOMATIC_STARTUP.md
Wants=network-online.target
After=network-online.target docker.service tailscaled.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/flowly
ExecStart=/opt/flowly/deployment/self-hosted/startup.sh --no-build
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
```

`Wants=network-online.target` is what makes the boot wait for an address before
the unit runs; `After=` only orders the start, it does not wait for a connection.

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now flowly-startup.service
systemctl status flowly-startup.service
```

Notes on that unit:

- `Type=oneshot` plus `RemainAfterExit=yes` is right for a script that starts
  other things and exits.
- The script waits for Docker and tailscaled by itself (up to 120 s and 60 s by
  default), so a slow daemon at boot does not fail the unit.
- No `User=` line: the script talks to the Docker socket and to tailscaled,
  which is simplest as root. If your user is in the `docker` group and you
  prefer that, add `User=<you>` and make sure the user can run `tailscale`
  commands too.
- It does not restart the stack when it fails: `docker compose up -d` is
  idempotent, so re-running the unit is always safe.

Try a real reboot instead of trusting the theory:

```bash
sudo systemctl reboot
# after the machine is back:
systemctl status flowly-startup.service
journalctl -u flowly-startup.service -b      # this boot's output
tailscale serve status
```

### Alternative: cron `@reboot`

Works, but it is the weaker option: cron runs early, with a minimal environment,
and a firing that happens before the network or Docker is up is silently lost.
If you use it anyway, give it a delay and absolute paths:

```cron
@reboot sleep 60 && /opt/flowly/deployment/self-hosted/startup.sh >> /var/log/flowly-startup.log 2>&1
```

Install it for root (`sudo crontab -e`) so the script can reach the Docker
socket, and check `/var/log/flowly-startup.log` after the first reboot.

### macOS

Docker Desktop's **Start at login** covers the containers. For the Serve
mapping, run the script once and leave it: `tailscale serve --bg` persists the
mapping in tailscaled's state, and it survives a restart of the app or the
machine as long as the node keeps its name. If you want it re-applied at every
login, call `deployment/self-hosted/startup.sh --no-build` from a LaunchAgent
(`~/Library/LaunchAgents/com.flowly.startup.plist`, `RunAtLoad`), and remember
that Docker Desktop has to be running for the stack part to succeed.

## 7. Never Funnel

Serve and Funnel are the same mechanism with a different audience:

| | Reachable from | Use it here? |
| --- | --- | --- |
| `tailscale serve` | Your tailnet only | **Yes** |
| `tailscale funnel` | The whole public internet | **Never** |

Funnel would put the unlocked vault's HTTPS endpoint on the public internet and
make the "private network only" promise in
[the threat model](./security/threat-model.md) false. The supported-host table in
[DEPLOYMENT.md](./DEPLOYMENT.md) lists "anything requiring public Internet
exposure" as **not supported** for the same reason.

Check, and undo if you ever find it on:

```bash
tailscale serve status
tailscale funnel status                      # must show nothing
sudo tailscale funnel --https=443 off        # turn a mapping off
sudo tailscale funnel reset                  # or clear all funnel config
```

`tailscale serve reset` clears the Serve mapping too — if you do that by
accident, run `startup.sh` again to put it back.

## 8. Troubleshooting

| Symptom | What it is | What to do |
| --- | --- | --- |
| `The Docker daemon did not come up` | Docker is installed but not running | `sudo systemctl start docker`, or start Docker Desktop, then run the script again |
| `tailscaled is not connected` | The node is logged out or the daemon is not up | `sudo tailscale up`, approve the node, re-run |
| `bind: can't assign requested address` | Docker Desktop cannot bind a LAN or Tailscale address | Set `FLOWLY_BIND_IP=0.0.0.0` and keep Serve in front |
| Browser certificate warning on the tailnet URL | Serve did not issue the certificate yet, or you are on `https://localhost:<port>` | Give it a minute; make sure MagicDNS is on; use the `<host>.<tailnet>.ts.net` URL |
| `404` or an empty page on the tailnet URL | The proxy container is not healthy yet | `docker compose logs proxy`, then `docker compose ps` |
| The Serve mapping disappeared | Node renamed, logged out, or `serve reset` was run | Run `startup.sh` again; the node's name must match `FLOWLY_SITE_ADDRESS` |
| A code update is not visible after a restart | The image was not rebuilt | `./deployment/self-hosted/startup.sh --build` |
| Enable Banking says the redirect URL is not allowed | The URL registered does not match the address in use | Register `https://<host>.<tailnet>.ts.net/enablebanking/auth_callback`; Settings warns when the two differ, and **Use the address I am using now** fills in the right one |
| `ASPSP_RATE_LIMIT_EXCEEDED` while syncing | The bank's own limit on daily unattended reads | Nothing to do with the network: sync less often and retry the next day ([RUNNING.md](./RUNNING.md)) |

## 9. Related

- [DEPLOYMENT.md](./DEPLOYMENT.md) — install, upgrade, roll back, back up, and
  the certificate options for LAN and tailnet access.
- [RUNNING.md](./RUNNING.md) — everyday use, the callback URL rules, and what a
  phone client needs today.
- [`deployment/self-hosted/startup.sh`](../deployment/self-hosted/startup.sh) —
  the script this page describes.
- [`deployment/self-hosted/compose.yaml`](../deployment/self-hosted/compose.yaml)
  and [`.env.example`](../.env.example) — what the stack reads.
