#!/usr/bin/env bash
#
# Flowly — start the self-hosted stack and publish it inside the tailnet.
#
#   deployment/self-hosted/startup.sh [--compose-only] [--build] [--help]
#
# The script, in order:
#   1. reads the single `.env` in the repository root (the Compose project
#      directory, which is what makes Compose substitute it),
#   2. starts the stack — the server and Caddy — with `docker compose up -d`,
#   3. publishes it to the tailnet with `tailscale serve` (never Funnel).
#
# The server image is not rebuilt unless you ask for it with --build: Compose
# builds it only when it is missing, which is what makes a boot fast and
# offline-safe. Pass --build after updating the code.
#
# Safe to run repeatedly, by hand or from a systemd unit at boot: every step
# waits for the daemon it needs instead of assuming it is already up.
#
# NEVER use `tailscale funnel` for this service: Funnel publishes to the public
# internet, and Flowly is a private-network service. This script only ever calls
# `tailscale serve`, refuses an explicit `--funnel`, and warns if it finds a
# funnel already configured on the node.

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

# How long to wait for Docker and tailscaled to be ready, in seconds. A cold
# boot on a Raspberry Pi needs a few of them; a service manager gives up sooner
# than you expect, so these are generous on purpose.
DOCKER_WAIT_SECONDS="${FLOWLY_STARTUP_DOCKER_WAIT:-120}"
TAILSCALE_WAIT_SECONDS="${FLOWLY_STARTUP_TAILSCALE_WAIT:-60}"

log() {
  printf '[%s] %s\n' "$SCRIPT_NAME" "$*"
}

fail() {
  printf '[%s] %s\n' "$SCRIPT_NAME" "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: startup.sh [--compose-only] [--build] [--help]

Starts the Flowly Compose stack with the `.env` in the repository root, then
publishes it inside your tailnet with Tailscale Serve.

Options:
  --compose-only   Start the stack and stop: do not touch Tailscale.
  --build          Rebuild the server image first (`docker compose up --build`).
                   Use it after updating the code, not on a boot schedule.
  --help           Show this message.

Environment (read from .env, optional):
  FLOWLY_BIND_IP, FLOWLY_SITE_PORT, FLOWLY_SITE_ADDRESS   See .env.example
  TS_SERVE_HTTPS_PORT                                     Tailnet HTTPS port on Serve (default 443)
  FLOWLY_STARTUP_DOCKER_WAIT                              Seconds to wait for the Docker daemon
  FLOWLY_STARTUP_TAILSCALE_WAIT                           Seconds to wait for tailscaled to connect

SECURITY: `tailscale funnel` is never used here. Funnel would publish Flowly to
the public internet. Read docs/AUTOMATIC_STARTUP.md before changing anything.
EOF
}

compose_only=0
build=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --compose-only)
      compose_only=1
      shift
      ;;
    --build)
      build=1
      shift
      ;;
    --no-build)
      # Kept so units and notes written against the first version keep working:
      # not rebuilding is the default.
      build=0
      shift
      ;;
    --funnel)
      fail "--funnel is not an option: Funnel publishes Flowly to the public internet. Use Serve (the default) and read docs/AUTOMATIC_STARTUP.md."
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -f "$ENV_FILE" ]]; then
  log "Reading $ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
else
  fail "Missing $ENV_FILE. Copy .env.example to .env next to it, edit the values, then run this script again."
fi

FLOWLY_SITE_PORT="${FLOWLY_SITE_PORT:-8443}"
FLOWLY_SITE_ADDRESS="${FLOWLY_SITE_ADDRESS:-localhost}"
FLOWLY_BIND_IP="${FLOWLY_BIND_IP:-127.0.0.1}"
TS_SERVE_HTTPS_PORT="${TS_SERVE_HTTPS_PORT:-443}"

# ---------------------------------------------------------------- the stack

command -v docker >/dev/null 2>&1 ||
  fail "docker not found. Install Docker Engine (see docs/AUTOMATIC_STARTUP.md)."

docker compose version >/dev/null 2>&1 ||
  fail "Docker Compose v2 is not available. Install the Compose plugin and run this script again."

docker_ready() {
  docker info >/dev/null 2>&1
}

if ! docker_ready; then
  log "Waiting for the Docker daemon (up to ${DOCKER_WAIT_SECONDS}s)…"
  deadline=$((SECONDS + DOCKER_WAIT_SECONDS))
  until docker_ready; do
    if [[ $SECONDS -ge $deadline ]]; then
      fail "The Docker daemon did not come up. Start Docker (on Linux: sudo systemctl start docker) and run this script again."
    fi
    sleep 2
  done
fi

# The Compose project directory is the repository root, which is where Compose
# looks for `.env`; the root compose.yaml only includes the stack definition in
# this folder.
if [[ $build -eq 1 ]]; then
  log "Starting the stack and rebuilding the server image (docker compose up --build -d)"
  (cd "$REPO_ROOT" && docker compose up --build -d)
else
  log "Starting the stack (docker compose up -d): reusing the image, building it only if it is missing"
  (cd "$REPO_ROOT" && docker compose up -d)
fi

if [[ $compose_only -eq 1 ]]; then
  log "Done: the stack is up. Tailscale left untouched (--compose-only)."
  (cd "$REPO_ROOT" && docker compose ps) || true
  exit 0
fi

# ------------------------------------------------------------- the tailnet

command -v tailscale >/dev/null 2>&1 ||
  fail "tailscale not found. Install Tailscale, run 'sudo tailscale up', then run this script again (see docs/AUTOMATIC_STARTUP.md)."

tailscale_connected() {
  tailscale status >/dev/null 2>&1
}

if ! tailscale_connected; then
  log "Waiting for tailscaled to connect (up to ${TAILSCALE_WAIT_SECONDS}s)…"
  deadline=$((SECONDS + TAILSCALE_WAIT_SECONDS))
  until tailscale_connected; do
    if [[ $SECONDS -ge $deadline ]]; then
      fail "tailscaled is not connected. Run 'sudo tailscale up', approve the node, then run this script again."
    fi
    sleep 2
  done
fi

# `https+insecure` because Caddy answers with a certificate from its own local
# CA: Tailscale terminates TLS for the tailnet name and forwards to loopback, so
# no device ever has to trust that CA.
log "Publishing Flowly on the tailnet: https://<node>.<tailnet>.ts.net -> http://127.0.0.1:${FLOWLY_SITE_PORT} (Serve, not Funnel)"
tailscale serve --bg --https="$TS_SERVE_HTTPS_PORT" "https+insecure://127.0.0.1:${FLOWLY_SITE_PORT}"

serve_status="$(tailscale serve status 2>&1 || true)"
printf '%s\n' "$serve_status"

if printf '%s\n' "$serve_status" | grep -qi "funnel"; then
  log "WARNING: a funnel is configured on this node. Funnel is reachable from the public internet."
  log "         Turn it off: sudo tailscale funnel --https=${TS_SERVE_HTTPS_PORT} off"
fi

serve_url="$(printf '%s\n' "$serve_status" | grep -Eo 'https://[^ ]+' | head -n 1 || true)"

# ------------------------------------------------------------- the summary

log "Stack:"
if ! (cd "$REPO_ROOT" && docker compose ps); then
  log "  docker compose ps failed; check 'cd $REPO_ROOT && docker compose logs'."
fi

log "Flowly is up."
log "  Local loopback   https://localhost:${FLOWLY_SITE_PORT} (Caddy's own CA: trust it once, or ignore this URL)"
if [[ -n "$serve_url" ]]; then
  log "  On the tailnet   ${serve_url}"
fi

if [[ "$FLOWLY_SITE_ADDRESS" == *.ts.net ]]; then
  log "  Enable Banking   https://${FLOWLY_SITE_ADDRESS}/enablebanking/auth_callback"
  log "                   Register exactly this URL as a redirect URL of your Enable Banking application,"
  log "                   and open Flowly at the same address before pressing Connect."
else
  log "  Enable Banking   FLOWLY_SITE_ADDRESS is '${FLOWLY_SITE_ADDRESS}', which is not a tailnet name."
  log "                   Through Serve you reach Flowly at ${serve_url:-https://<node>.<tailnet>.ts.net} (no port)."
  log "                   Set FLOWLY_SITE_ADDRESS to that name so the registered callback URL matches."
fi

log "Funnel is never used for this service. 'tailscale funnel status' must stay empty."
