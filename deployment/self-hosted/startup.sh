#!/usr/bin/env bash
#
# Flowly — start the self-hosted stack and publish it inside the tailnet.
#
#   deployment/self-hosted/startup.sh [--compose-only] [--build] [--no-build] [--help]
#
# The script, in order:
#   1. reads the single `.env` in the repository root (the Compose project
#      directory, which is what makes Compose substitute it),
#   2. rebuilds the server image only when the checkout has moved on since the
#      image was built (see "The source stamp" below), then starts the stack —
#      the server and Caddy — with `docker compose up -d`,
#   3. publishes it to the tailnet with `tailscale serve` (never Funnel).
#
# The source stamp: the image records a hash of the files it was built from, and
# this script compares it with the checkout on every run. Same hash, no build; a
# `git pull` (or a hand edit) changes it and the image is rebuilt. Use --build to
# force a rebuild and --no-build to never build, whatever the stamp says.
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
Usage: startup.sh [--compose-only] [--build] [--no-build] [--help]

Starts the Flowly Compose stack with the `.env` in the repository root, then
publishes it inside your tailnet with Tailscale Serve. The server image is
rebuilt only when the files it was built from have changed since.

Options:
  --compose-only   Start the stack and stop: do not touch Tailscale.
  --build          Rebuild the server image, whatever the source stamp says.
  --no-build       Never rebuild: start the image that is already there.
  --print-stamp    Print the source stamp of this checkout and stop. Use it to
                   build the image on a faster machine and have this one accept
                   it without rebuilding (see docs/AUTOMATIC_STARTUP.md).
  --stamp-files    Print one line per file — `<path> <sha256>` — that feeds the
                   stamp, to diff two checkouts and see what actually differs.
  --help           Show this message.

Environment (read from .env, optional):
  FLOWLY_BIND_IP, FLOWLY_SITE_PORT, FLOWLY_SITE_ADDRESS   See .env.example
  FLOWLY_IMAGE                                            Image to build and check (default: the one in compose.yaml)
  FLOWLY_CONTAINER_UID, FLOWLY_CONTAINER_GID              User the server runs as inside the container (default 1000)
  TS_SERVE_HTTPS_PORT                                     Tailnet HTTPS port on Serve (default 443)
  FLOWLY_STARTUP_DOCKER_WAIT                              Seconds to wait for the Docker daemon
  FLOWLY_STARTUP_TAILSCALE_WAIT                           Seconds to wait for tailscaled to connect

SECURITY: `tailscale funnel` is never used here. Funnel would publish Flowly to
the public internet. Read docs/AUTOMATIC_STARTUP.md before changing anything.
EOF
}

compose_only=0
# auto: rebuild only when the sources changed since the image was built.
build="auto"
print_stamp=0
print_stamp_files=0

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
      build="always"
      shift
      ;;
    --no-build)
      build="never"
      shift
      ;;
    --print-stamp)
      print_stamp=1
      shift
      ;;
    --stamp-files)
      print_stamp_files=1
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

# --------------------------------------------------------- the source stamp

# The files the stamp covers: everything the Dockerfile takes from the checkout.
# It follows what Git tracks, so the same commit hashes the same on every machine
# no matter what the operating system leaves lying around — a stray .DS_Store was
# enough to make a Mac and a Raspberry Pi with identical code disagree. Without a
# repository (a tarball deployment) it walks the filesystem and skips the same
# kind of junk explicitly.
source_files() {
  local paths=(apps packages tsconfig.base.json package.json pnpm-lock.yaml pnpm-workspace.yaml)
  if [ -d "$REPO_ROOT/.git" ] && command -v git >/dev/null 2>&1; then
    # --cached: what the commit contains. --others --exclude-standard: files
    # added but not committed yet, which the Docker build would copy as well.
    # Anything Git ignores (.DS_Store, dist, node_modules) stays out, and so does
    # per-machine junk.
    (
      cd "$REPO_ROOT" &&
        git ls-files -z --cached --others --exclude-standard -- "${paths[@]}"
    ) | tr '\0' '\n' | LC_ALL=C sort
    return 0
  fi
  (
    cd "$REPO_ROOT" &&
      find "${paths[@]}" \
        -type f \
        -not -path "*/node_modules/*" \
        -not -path "*/dist/*" \
        -not -path "*/coverage/*" \
        -not -name ".DS_Store" \
        -not -name "._*" \
        -not -name "*.tsbuildinfo" |
      LC_ALL=C sort
  )
}

hash_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | cut -d" " -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | cut -d" " -f1
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 | awk '{print $NF}'
  else
    return 1
  fi
}

# One line per file: `<path> <sha256>`, the exact input of the stamp. Printed by
# --stamp-files, so two machines can diff them and see which file diverges.
stamp_lines() {
  local files file missing=""
  files="$(source_files)" || return 1
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if [ ! -f "$REPO_ROOT/$file" ]; then
      missing="$missing $file"
      continue
    fi
    printf '%s %s\n' "$file" "$(hash_stdin <"$REPO_ROOT/$file")"
  done <<<"$files"
  if [ -n "$missing" ]; then
    printf 'warning: tracked files missing from this checkout:%s\n' "$missing" >&2
  fi
}

source_stamp() {
  stamp_lines | hash_stdin
}

# Asked before anything else, and without needing .env: the point is to run it on
# the machine that builds the image, not on the one that runs it.
if [ "$print_stamp" -eq 1 ]; then
  stamp="$(source_stamp)" ||
    fail "Cannot stamp the sources. Run this from a full Flowly checkout (apps/, packages/ and the lockfile), with sha256sum, shasum or openssl available."
  printf '%s\n' "$stamp"
  exit 0
fi

if [ "$print_stamp_files" -eq 1 ]; then
  stamp_lines ||
    fail "Cannot read the sources. Run this from a full Flowly checkout (apps/, packages/ and the lockfile)."
  exit 0
fi

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
# The uid the server runs as inside its container: the `node` user of the image.
# Only change it if you rebuilt the image with another user.
CONTAINER_UID="${FLOWLY_CONTAINER_UID:-1000}"
CONTAINER_GID="${FLOWLY_CONTAINER_GID:-$CONTAINER_UID}"
DATA_DIR="$REPO_ROOT/data"

# ---------------------------------------------------------------- the stack

command -v docker >/dev/null 2>&1 ||
  fail "docker not found. Install Docker Engine (see docs/AUTOMATIC_STARTUP.md)."

docker compose version >/dev/null 2>&1 ||
  fail "Docker Compose v2 is not available. Install the Compose plugin and run this script again."

docker_ready() {
  docker info >/dev/null 2>&1
}

# The image Compose builds: the compose file is the source of truth, and
# FLOWLY_IMAGE overrides it for an unusual setup.
compose_image() {
  local images
  images="$(cd "$REPO_ROOT" && docker compose config --images 2>/dev/null | head -n1 || true)"
  printf '%s' "${FLOWLY_IMAGE:-${images:-flowly-server:local}}"
}

image_stamp() {
  local value
  value="$(
    docker image inspect --format '{{ if .Config.Labels }}{{ index .Config.Labels "org.flowly.source-stamp" }}{{ end }}' "$1" 2>/dev/null || true
  )"
  if [ "$value" = "<no value>" ]; then
    value=""
  fi
  printf '%s' "$value"
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

# ------------------------------------------------------------ the data folder

# The vault lives in a bind mount, so on Linux the folder on the host has to
# belong to the user inside the container. Docker creates a missing bind-mount
# source as root, and then the server cannot write its own vault: the first
# attempt to create one fails. Docker Desktop reaches the host through a VM whose
# mount ignores host ownership, which is why a stack can work on a laptop for
# months and fail the first time it runs on a Linux host — and why `chown` there
# would only lock the person out of their own files.
owner_uid() {
  case "$(uname -s)" in
    Darwin) stat -f %u "$1" 2>/dev/null ;;
    *) stat -c %u "$1" 2>/dev/null ;;
  esac
}

mount_ignores_ownership() {
  case "$(uname -s)" in
    Darwin | MINGW* | MSYS* | CYGWIN*) return 0 ;;
  esac
  docker info --format '{{.OperatingSystem}}' 2>/dev/null | grep -qi "docker desktop"
}

data_dir_needs_owner() {
  [ -d "$DATA_DIR" ] || return 1
  local owner
  owner="$(owner_uid "$DATA_DIR")"
  # No `stat` that answers: leave the folder alone rather than chown blindly.
  [ -n "$owner" ] || return 1
  [ "$owner" = "$CONTAINER_UID" ] || return 0
  if [ -d "$DATA_DIR/vault" ]; then
    owner="$(owner_uid "$DATA_DIR/vault")"
    [ -n "$owner" ] || return 1
    [ "$owner" = "$CONTAINER_UID" ] || return 0
  fi
  return 1
}

# Created as the current user, so Docker never gets the chance to create it as
# root in the first place.
mkdir -p "$DATA_DIR" || fail "Cannot create $DATA_DIR. Check the path and its permissions."

if data_dir_needs_owner; then
  if mount_ignores_ownership; then
    log "data/ belongs to uid $(owner_uid "$DATA_DIR"): this Docker ignores host ownership on bind mounts, so it is left alone"
  elif [ "$(id -u)" -eq 0 ]; then
    chown "$CONTAINER_UID:$CONTAINER_GID" "$DATA_DIR"
    [ -d "$DATA_DIR/vault" ] && chown -R "$CONTAINER_UID:$CONTAINER_GID" "$DATA_DIR/vault"
    log "data/ now belongs to uid $CONTAINER_UID, the user inside the container"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo -n chown "$CONTAINER_UID:$CONTAINER_GID" "$DATA_DIR"
    [ -d "$DATA_DIR/vault" ] && sudo -n chown -R "$CONTAINER_UID:$CONTAINER_GID" "$DATA_DIR/vault"
    log "data/ now belongs to uid $CONTAINER_UID, the user inside the container"
  else
    log "WARNING: $DATA_DIR is not writable by the user inside the container (uid $CONTAINER_UID)."
    log "         Creating the vault will fail with vault_storage_unavailable. Fix it once with:"
    log "           sudo chown -R $CONTAINER_UID:$CONTAINER_GID \"$DATA_DIR\""
  fi
fi

image="$(compose_image)"
want_stamp="$(source_stamp || true)"
have_stamp="$(image_stamp "$image")"
build_reason=""

case "$build" in
  always)
    build_reason="--build was given"
    ;;
  never)
    if [ -n "$want_stamp" ] && [ "$have_stamp" != "$want_stamp" ]; then
      log "Note: --no-build was given and the image does not match the checkout. Flowly will run the code in $image."
    fi
    ;;
  *)
    if [ -z "$want_stamp" ]; then
      log "Cannot hash the sources (no sha256sum, shasum or openssl): rebuilding is left to you (--build)."
    elif [ -z "$have_stamp" ]; then
      build_reason="no image yet, or one built before this check existed"
    elif [ "$have_stamp" != "$want_stamp" ]; then
      build_reason="the checkout changed since ${image} was built"
    fi
    ;;
esac

built=0
build_failed=0
if [ -n "$build_reason" ]; then
  log "Rebuilding $image: ${build_reason}"
  if (cd "$REPO_ROOT" && FLOWLY_SOURCE_STAMP="$want_stamp" docker compose build); then
    built=1
  else
    build_failed=1
    log "WARNING: the image build failed (offline, or a broken dependency)."
    log "         Starting the previous $image instead: Flowly runs the code that image has, not this checkout."
  fi
elif [ "$build" = "auto" ]; then
  log "No rebuild needed: $image already matches the checkout"
fi

# The Compose project directory is the repository root, which is where Compose
# looks for `.env`; the root compose.yaml only includes the stack definition in
# this folder.
log "Starting the stack (docker compose up -d)"
(cd "$REPO_ROOT" && docker compose up -d)

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
if [ "$built" -eq 1 ]; then
  log "  Image            rebuilt from this checkout just now (${image})"
elif [ "$build_failed" -eq 1 ]; then
  log "  Image            ${image}, from an earlier build: the rebuild failed, so this is not this checkout"
elif [ "$build" = "never" ]; then
  log "  Image            ${image}, reused as asked"
else
  log "  Image            ${image}, already matching this checkout"
fi
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
