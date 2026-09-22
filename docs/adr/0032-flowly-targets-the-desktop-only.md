# ADR 0032 — Flowly targets the desktop only

Status: Accepted (2026-09-22)

## Context

The plan shipped with a native client for four platforms: iOS, Android, macOS
and Windows. That shaped far more than the roadmap — the storage notes, the
unlock design, the testing strategy, the distribution story, the brand assets
(an iOS touch icon) and even the certificate instructions were written for
phones as well as desktops. Every one of those decisions is a cost: a mobile
app means app stores, mobile permissions, mobile biometric APIs, app-switcher
privacy and a second set of platform failure modes.

Flowly is a self-hosted, private-network product used at a desk, next to the
server that holds the vault. The mobile client was never the reason anyone
would run it.

## Decision

- **The client is a desktop application, and only that.** macOS and Windows, one
  Flutter/Dart codebase, direct signed downloads. There is no mobile
  application, no mobile platform and no app store in this plan.
- **Everything derived from the mobile plan goes with it**: the phone guidance
  in `docs/RUNNING.md`, mobile permission and app-switcher requirements, the
  `BiometricPrompt` path, the mobile backup-exclusion flags, the OWASP MASVS
  mobile checklist, the App Store/Play distribution rows, and the iOS touch icon
  (`apps/web/public/apple-touch-icon.png` and its `<link>` in
  `apps/web/index.html`).
- **What stays is desktop-shaped.** The phases keep their published numbers
  (8-12) but are named for the desktop: foundation, feature parity, hardening
  and release, Enable Banking for the desktop app, automatic encrypted backups.
  Task names follow (`desktop-architecture-spike`, `scaffold-desktop`,
  `implement-desktop-*`, `harden-desktop`, `build-desktop-release-pipelines`),
  and the planned directory is `apps/desktop/` with `desktop-packages/` beside
  it.
- **The stack is unchanged.** Flutter + Drift + SQLCipher stays the choice for
  the desktop client; `contracts/` keeps feeding generated Dart types. Touch ID
  (macOS) and Windows Hello (Windows) remain the optional biometric shortcuts.
- **The browser UI stays responsive.** It is served to desktop browsers on the
  private network, and its layout still adapts to the width of the window; what
  is gone is the promise of a phone client, not CSS that reflows.

## Consequences

- `docs/PLAN.md` loses the mobile targets, the mobile platform rows, the
  app-store distribution and the mobile-specific requirements; `README.md`,
  `docs/RUNNING.md`, `docs/TESTING.md`, `docs/DESIGN.md`,
  `docs/AUTOMATIC_STARTUP.md`, `docs/DEPLOYMENT.md`, `AGENTS.md` and
  `contracts/README.md` say desktop where they said mobile or native.
- ADRs that described the four-platform client keep their text as history and
  point here — [ADR 0016](./0016-enable-banking-integration.md) and
  [ADR 0023](./0023-flowly-brand-lockup-and-palette.md) carry the note — so the
  record of what was decided, and when it changed, survives.
- A future mobile client, if it ever happens, starts from a new ADR and knows it
  must reintroduce the requirements this one removed.
