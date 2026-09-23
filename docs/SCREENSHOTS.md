# Flowly in pictures

Six sections, one design language, and every figure read from the vault. No
placeholder data anywhere in the app — these are the screens the product ships,
and [README.md](../README.md) is the tour of what they do.

**Dashboard** — balances per currency, monthly cash flow and spending by tag, for
the months you pick.

![Dashboard](./images/dashboard.png)

**Accounts** — one card per account with its real balance and booked-movement
count; archived accounts stay visible and can be restored.

![Accounts](./images/accounts.png)

**Transactions** — the form that writes a movement over the ledger it lands in,
server-side filters, tag pills, and rows that open for editing with one click.

![Transactions](./images/transactions.png)

**Tags** — the taxonomy rules and filters work with: a directory that says how
many movements carry each tag and which rules apply it.

![Tags](./images/tags.png)

**Rules** — the rule composer with live evaluation beside the engine's own
coverage, per rule and per tag.

![Rules](./images/rules.png)

**Settings** — the bank connection, the passphrase and the three export shapes,
all against the local vault.

![Settings](./images/settings.png)

> The screenshots come from a throwaway vault full of invented data: `pnpm
> demo:seed` fills it and `pnpm demo:screenshots` captures the six sections — see
> [RUNNING.md](./RUNNING.md#regenerating-the-screenshots).
