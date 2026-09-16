# Repository Guidelines

## Commit Practices

- Commit every completed modification. Do not leave finished work uncommitted.
- Keep each commit focused on a single logical change.
- Write clear, concise, and descriptive commit messages that explain both what changed and why.
- Prefer the Conventional Commits format where appropriate:
  - `feat: add user authentication`
  - `fix: handle missing configuration`
  - `docs: update installation instructions`
  - `refactor: simplify request validation`
  - `test: cover authentication failures`
- Before committing:
  - Review the changes with `git diff`.
  - Run all relevant tests, linters, and validation checks.
  - Confirm that temporary files, credentials, secrets, and unrelated changes are not included.
- Include related code, tests, and documentation in the same commit.
- Do not amend, squash, reorder, or remove existing commits unless explicitly requested.
- Never paste an identifier copied from a real provider response or control panel
  (Enable Banking application, authorization and session ids, account uids,
  IBANs from a live account) into fixtures, tests, placeholders or documentation.
  Use obviously synthetic values, like the `TEST_*` constants in
  `apps/server/tests/helpers/banking.ts`.

## Documentation Maintenance

`docs/` is the home of the project documentation, and it must stay accurate.
Review it during every development iteration and update it whenever necessary:
no completed change is allowed to leave the documentation behind.

| Path | What it holds | Update it when |
| --- | --- | --- |
| `docs/PLAN.md` | Architecture, security requirements, data model and the phased delivery plan | Work completes, decisions change, scope or priorities shift, or tasks, risks and next steps change |
| `docs/RUNNING.md` | How to run, self-host and work on the app | Commands, prerequisites, configuration, deployment steps, mobile/desktop instructions or troubleshooting change |
| `docs/AUTOMATIC_STARTUP.md` | Installing Docker and Tailscale, the boot script and the systemd unit | Startup commands, the script's flags or environment knobs, or the boot procedure change |
| `docs/adr/` | One decision record per binding technical choice | A decision is made or reversed; add a new numbered ADR instead of rewriting an accepted one |
| `docs/TERMS_OF_SERVICE.md`, `docs/PRIVACY_POLICY.md` | The legal documents referenced by the Enable Banking application registration | What the software stores, who can reach it, or which third parties are involved changes |
| `README.md` | Product overview and entry point, linking into `docs/` | Features, setup, usage, architecture, dependencies or milestones change |

Rules:

- Documentation must describe implemented behavior, never intentions presented
  as facts.
- Include documentation updates in the same commit as the change they describe.
- When you add or move a document under `docs/`, update every reference to it,
  including `README.md`, the repository guidelines and any ADR.
- If an iteration needs no documentation change, verify that every file above is
  still accurate before completing it.

### `docs/PLAN.md`

Keep `docs/PLAN.md` aligned with the current state of the project. Update it to reflect:

- Completed work.
- Current implementation status.
- Technical or architectural decisions.
- Changes in scope or priorities.
- Remaining tasks, known issues, and next steps.

### `docs/RUNNING.md`

Keep `docs/RUNNING.md` usable by someone who has never run the project. Update it
when:

- Prerequisites, commands or environment variables change.
- The local, self-hosted or container workflow changes.
- A phase adds or changes what users can do, or how they reach the app.
- Planned client work (mobile and desktop) moves forward and gains real
  commands.
- A new failure mode or troubleshooting step is discovered.

### `docs/adr/`

Record every binding decision as a numbered ADR before or with the change that
implements it:

- One decision per file, in the form `NNNN-short-title.md`, with status, context,
  decision and consequences.
- Never rewrite an accepted ADR to say something else; add a superseding ADR and
  link the two.
- Keep the decisions consistent with `docs/PLAN.md`; when they diverge, fix
  whichever document is wrong in the same commit.

### `README.md`

Update `README.md` whenever a change affects:

- Installation or setup.
- Configuration.
- Usage or available commands.
- Features or behavior.
- Public APIs or interfaces.
- Project architecture or directory structure.
- Dependencies, prerequisites, limitations, or compatibility.

Documentation must accurately describe the implemented behavior.

## Iteration Completion Checklist

Before considering an iteration complete:

1. Review the implementation and its associated tests.
2. Run all relevant tests, linters, and validation checks.
3. Review and update the documentation under `docs/` (`PLAN.md`, `RUNNING.md`,
   `adr/`) and `README.md` as necessary, and fix any reference that points at a
   moved file.
4. Inspect the final changes with `git diff`.
5. Create a clear, focused commit containing the completed work.
6. Verify the repository state with `git status`.
7. Ensure no completed changes remain uncommitted. If any files are intentionally excluded, report them explicitly.
