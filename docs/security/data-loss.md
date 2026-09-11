# Data-loss warning

> **There is no passphrase recovery.** No account, no Flowly service and no key
> escrow exists. If you lose the passphrase, the vault cannot be opened — not by
> you, not by anyone.

Read this before trusting Flowly with data you care about.

- **Exports are your safety net.** A complete portable archive is only useful if
  you also remember its password. Store both, separately.
- **The server is not a backup.** A broken disk, a lost container or a deleted
  volume means a lost vault. Copy archives off the host.
- **Plain exports are not encrypted.** The transaction CSV and the "every table"
  ZIP are readable by anyone who opens them: treat them like a printed bank
  statement, and prefer the encrypted archive for backups.
- **A restore replaces the vault.** Importing a complete archive overwrites the
  destination vault after an explicit confirmation; an encrypted snapshot of the
  previous content is written first, but the import itself is not reversible
  from within the app.
- **Cascade deletes are real.** Deleting an account with `cascade` removes its
  transactions; deleting a tag with `cascade` removes it from transactions and
  rules. Both actions report how many records they will touch.
- **Automatic backups do not exist yet.** They are planned for Phase 12. Until
  then, export manually and regularly.

If any of that is unacceptable for your data, keep a copy of everything you put
into Flowly somewhere you already trust.
