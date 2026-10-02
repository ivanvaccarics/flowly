# ADR 0042 — startup.sh keeps only the image the stack runs, and never cleans beyond Flowly

Status: Accepted (2026-10-02). Complements
[ADR 0009](./0009-deployment-transport-and-release.md): the deployment stays one
small, self-hosted stack, and now stays one image.

## Context

`deployment/self-hosted/startup.sh` pulls the image CI published for the checkout
when the sources have moved on, and then ran `docker image prune --force` once the
stack was back up. That removes only **dangling** images — the layers a replaced
tag leaves behind. Tagged older versions stayed. A host that tracks `latest`
accumulated little visible, but a host that pins a version per install, or that
built locally before switching to the registry, kept every image it had ever run.
On a Raspberry Pi's SD card that is the difference between months and weeks of
room, and a version the stack will not start again is dead weight.

The heavy tool is not acceptable here. `docker image prune --all` and
`docker volume prune --all` are machine-wide: the Docker daemon is shared with
whatever else runs on the host, and the volume form would delete other
applications' data. A script that starts one application must not reach that far.

## Decision

- **Remove every Flowly image but the one the stack now runs.** It happens after
  `docker compose up -d` has recreated the container with the new image, never
  before: until then the previous image is still in use. "Flowly images" means
  the repository of `FLOWLY_IMAGE` (`ghcr.io/ivanvaccarics/flowly` by default)
  and the local `flowly-server:local` build tag.
- **Match the running image by ID, not by tag.** When `latest`, `main` and a
  version tag all point at the same build, they all stay; the same image under
  another name is not another version and takes no extra room.
- **Prune volumes only when they carry this Compose project's label**
  (`com.docker.compose.project=flowly`, read from the running container) and
  nothing uses them. Flowly keeps the vault and the certificates in `data/` bind
  mounts, so this is normally a no-op kept for older layouts. `--all` is needed
  to remove a *named* volume at all, and it is always paired with that label
  filter.
- **No machine-wide prune.** `docker image prune --all` is never run, and
  `docker volume prune --all` is only ever run together with the project's label
  filter. `--prune` still empties the BuildKit build cache, which belongs to
  Flowly alone.
- **Only when the image changed.** A run that neither pulls nor builds deletes
  nothing, so a plain reboot does not touch the daemon's state.

## Consequences

- Disk usage stays flat across updates instead of growing by one image per
  version, which is what the script was already trying to achieve and did only
  for the untagged case.
- Rolling back by tag needs the image again: the older tags are still in the
  registry (`docker compose pull` with `FLOWLY_IMAGE=<tag>`), or the previous
  commit can be built locally. The trade is explicit — the script is for keeping
  one version running, not for keeping a local cache of versions — and
  `docs/DEPLOYMENT.md` says what to run.
- A shared Docker daemon is untouched outside Flowly's own repository and project
  label, so running Flowly next to other stacks cannot take their images or their
  data.
- The reclamation is visible in the output (`Disk: …` lines), so what was removed
  ends up in the boot log instead of disappearing silently.
