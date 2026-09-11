# Flowly UI design system

The interface follows **Sovereign Ledger**, the design language captured in the
repository's `ui/` folder (a design specification plus four desktop mockups:
dashboard, accounts, transactions, vault). That folder is a local, untracked
reference — the tokens and rules that matter are reproduced here and implemented
in `apps/web`, so the codebase is self-contained and this document is the
authoritative summary for anyone cloning the repository.

## Character

High-trust, sovereign and quiet: pure white cards over a soft slate canvas,
hairline borders, dense tabular structures, restrained feedback and precise
typographic contrast. No gradients, no decorative noise, no dark-mode inversion.

## Tokens

Defined once as CSS custom properties in `apps/web/src/styles.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#f8fafc` | Application background |
| `--surface` | `#ffffff` | Cards, tables, inputs |
| `--surface-sunken` | `#f1f5f9` | Table headers, sunken segments |
| `--border` / `--border-strong` | `#e2e8f0` / `#cbd5e1` | Hairlines and hover containment |
| `--text` / `--text-secondary` / `--text-muted` | `#0f172a` / `#334155` / `#64748b` | Headlines, body, metadata |
| `--primary` | `#4648d4` (hover `#3a3cbe`) | Primary actions, active navigation, focus ring |
| `--income` | `#047857` | Inflows, confirmations |
| `--expense` | `#be123c` | Outflows, destructive actions, errors |
| Radius | 4 px / 8 px / 12 px | Badges, controls, cards |
| Shadow | level 1-3 | Cards, hover/popovers, modal |

## Typography

- **Display (Manrope):** page titles and section headings.
- **Body (Inter):** controls, prose, table cells.
- **Data (JetBrains Mono):** every monetary amount, date, currency code, vault id
  and schema version, so figures stay vertically aligned.

**No webfont CDN.** Flowly runs on a private network with no Internet access, so
the families are declared with local fallbacks (`SF Pro`, `Segoe UI`, system
fonts). Where Manrope, Inter or JetBrains Mono are installed the intended look is
reproduced exactly; otherwise the closest system face is used and the layout does
not shift.

## Layout

- Fixed 260 px sidebar with the brand, a "Vault navigation" label, the section
  list and a vault card showing the storage engine and schema version.
- Sticky 64 px top bar: vault state chips (unlocked, cipher, vault format) and the
  session controls (`Lock this session`, `Lock all sessions`).
- Content column capped at 1600 px with 24 px gutters; cards carry 24 px internal
  padding and hairline borders.
- Below 1024 px the sidebar becomes a horizontal, wrapping nav and cards stack.

## Components

- **Metric card:** uppercase eyebrow, monospaced value, optional delta chip.
- **Data table:** uppercase micro-headers on a sunken row, 44 px rows, hover tint,
  right-aligned monospaced amounts, coral for outflows and emerald for inflows.
- **Status chip:** compact 2/8 px padding with tone variants (`income`, `expense`,
  `vault`, `neutral`); the vault chip pairs with a pulsing state dot.
- **Buttons:** primary indigo (36 px, radius 8), ghost secondary, destructive
  coral-outline that only fills on an explicit destructive action.
- **Inputs:** 36 px, hairline border, indigo focus ring with a soft halo.
- **Banner:** inline feedback for errors, confirmations and loading.

## Mapping to implemented features

Only shipping functionality is on screen; the mockups' charts, budgets, savings
rate and multi-account widgets are **not** rendered because the product does not
compute them.

| Section | Contents |
| --- | --- |
| Dashboard | Date range, per-currency net flow metrics, account balances, spending by tag with share bars |
| Accounts | Create account, status chips, archive, cascade delete |
| Transactions | Create with notes and tags, server-side filters (account, dates, tag, status, text), inline note editing, tag toggling, delete |
| Tags | Create with color, normalized name shown, cascade delete |
| Rules | Condition builder (AND/OR, per-field operators, amount currency), tag selection, pause/resume, backfill report |
| Settings | Passphrase change, transaction CSV export, complete archive export, CSV preview and merge, archive replacement |

The vault lock screen uses the same language: centered card, lock badge,
passphrase field, the no-recovery warning, and a facts row with state, storage
engine and vault format.
