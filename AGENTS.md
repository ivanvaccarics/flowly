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

## Documentation Maintenance

Review `docs/PLAN.md`, `docs/RUNNING.md` and `README.md` during every development
iteration and update them whenever necessary.

### `docs/PLAN.md`

Keep `docs/PLAN.md` aligned with the current state of the project. Update it to reflect:

- Completed work.
- Current implementation status.
- Technical or architectural decisions.
- Changes in scope or priorities.
- Remaining tasks, known issues, and next steps.

### `README.md`

Update `README.md` whenever a change affects:

- Installation or setup.
- Configuration.
- Usage or available commands.
- Features or behavior.
- Public APIs or interfaces.
- Project architecture or directory structure.
- Dependencies, prerequisites, limitations, or compatibility.

Documentation must accurately describe the implemented behavior. Include documentation updates in the same commit as the change they describe.

If an iteration does not require documentation changes, verify that
`docs/PLAN.md`, `docs/RUNNING.md` and `README.md` remain accurate before
completing the iteration.

## Iteration Completion Checklist

Before considering an iteration complete:

1. Review the implementation and its associated tests.
2. Run all relevant tests, linters, and validation checks.
3. Review and update `docs/PLAN.md`, `docs/RUNNING.md` and `README.md` as necessary.
4. Inspect the final changes with `git diff`.
5. Create a clear, focused commit containing the completed work.
6. Verify the repository state with `git status`.
7. Ensure no completed changes remain uncommitted. If any files are intentionally excluded, report them explicitly.
