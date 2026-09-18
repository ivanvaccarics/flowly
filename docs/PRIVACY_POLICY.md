# Flowly — Privacy Policy

Version 1.0 · Effective 14 September 2026

Flowly is self-hosted software, not a service we operate. That single fact
decides almost everything below: your financial data stays on hardware you
control, and the maintainer never receives it. This policy explains what Flowly
stores, what leaves your server when you connect a bank, and who is responsible
for what. The technical detail behind it lives in
[security/privacy.md](security/privacy.md) and
[security/threat-model.md](security/threat-model.md).

## 1. Who is responsible for your data

- **The maintainer** (Ivan Vaccari, contact in §12) provides the software and
  runs the project's public channels — the GitHub repository, its issue tracker
  and the contact address. That is the only context in which the maintainer is a
  controller, and it involves no financial data.
- **The operator** of a Flowly instance — the person or organisation that
  installed it and lets people use it — is the controller of the data in that
  instance. If you self-host Flowly for yourself, the operator is you.

Flowly has no account system, so there is nothing to sign up for and no way for
the maintainer to identify, look up, restore or delete anything in your
instance.

## 2. What Flowly stores, and where

Everything is stored on the operator's own host, inside a volume that holds one
encrypted vault file.

| Stored | Where | Notes |
| --- | --- | --- |
| Accounts, transactions, notes, tags, tagging rules and preferences | Encrypted vault | The canonical record of what you entered, imported or synced |
| Raw provider responses from your bank | Encrypted vault | Kept per account so a sync can be replayed or audited; never used to overwrite your notes or tags |
| Enable Banking application credentials (application id, callback URL and private key) | Encrypted vault | Stored only when you connect a bank; never returned by the API and never sent to the browser |
| Vault header | Readable part of the vault file | Argon2id parameters, salt and the wrapped data key. It contains no readable secret and no financial data |
| Snapshots taken before an import or a migration | Encrypted vault | Replaced as you keep using the app |
| Request logs | Operator's host | Method, path without its query string, status code and timestamp. The bank callback is also omitted from the proxy access log. Never payloads, passphrases, keys or transaction content |
| Session cookie | Your browser | One opaque, random session identifier, `HttpOnly` and `SameSite=Strict`. It is used only to keep you signed in to your own server |

Flowly's browser client keeps no vault data in `localStorage`, `sessionStorage`,
IndexedDB or a service-worker cache, and it loads no third-party script, font or
tracker. Files you export — a transaction CSV, the plain-text tables ZIP or the
password-encrypted archive — are written wherever you save them and are your
responsibility from that moment on.

## 3. What reaches the maintainer

**Nothing automatically.** Flowly contains no telemetry, no analytics, no crash
reporting, no advertising SDK and no update check, and it never contacts a
server operated by the maintainer. There is no device identifier, no licence
check and no fingerprinting. Uninstalling Flowly removes the software; your data
disappears when you delete the vault.

The maintainer receives information only when you choose to send it:

- an issue or discussion on the GitHub repository — GitHub Inc. processes it
  under [its own privacy policy](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement),
  including technical metadata such as your GitHub account and IP address;
- an email to the contact address in §12, including whatever you write in it.

Keep bank statements, passphrases, vault files and provider keys out of issues
and emails. If you want the maintainer to delete something you sent, ask and it
will be removed, unless a legal obligation requires keeping it.

## 4. Cookies and local storage

The only cookie Flowly sets is the session cookie on the operator's own server.
It is marked `HttpOnly` and `SameSite=Strict`, carries a random identifier rather
than your identity, and is used solely to keep your browser signed in. There are
no tracking cookies, no third-party cookies and no advertising identifiers, so
there is nothing to consent to and no cookie banner. The CSRF token that
protects write requests is kept in memory and discarded when the page is
closed.

## 5. Bank connections through Enable Banking

A bank connection is entirely optional and off until you set it up. When it is
active, your **own server** talks directly to Enable Banking's API. The
maintainer is not in that path and receives nothing from it.

Sent from your server to Enable Banking:

- your application id and a short-lived JWT signed with the private key stored
  in your vault;
- the bank you selected, its country, the account type you chose (personal or
  business) and the callback URL you registered;
- the period of the access consent you request (balances and transactions);
- the IP address of the device that triggered the request and its browser
  User-Agent, which banks require for the strong customer authentication flow.
  Flowly forwards these only when the address is public: a loopback, LAN or
  Tailscale address is dropped instead of being sent;
- a pseudonymous identifier derived from your random vault id. Flowly sends no
  name, no email address, no account number and no IBAN of its own.

Received back, and stored in your encrypted vault: the identity, balances and
transactions of the accounts you approved at your bank, plus the raw provider
responses.

Your bank and Enable Banking process that data as independent controllers under
their own privacy policies, for their own retention periods and on their own
infrastructure; the maintainer cannot see it and cannot answer requests about
it. To exercise access, rectification, portability or erasure rights over it,
contact your bank and Enable Banking directly.

You stay in control in Flowly: **unlinking a bank** keeps the transactions
already imported but removes the stored consent session, the raw provider
payloads and the link, and **disconnecting Enable Banking** removes the
application credentials as well. Revoking the consent at your bank or in the
Enable Banking control panel stops any further access.

## 6. How long data is kept

Flowly applies no retention limit: your vault keeps what you put in it until you
delete it. In practice that means:

- imported transactions stay until you delete the transaction, its account or
  the vault;
- raw provider payloads and bank links stay until you unlink the bank, unless
  you delete them sooner;
- snapshots are replaced by newer ones as you keep using the app;
- deleting the vault file, or the `data/vault` folder, destroys everything
  irrecoverably, with the explicit confirmation the app asks for.

Exports you created are outside the app and must be deleted by you. The
maintainer holds no copy and therefore has nothing to erase.

## 7. Security

Flowly is built so that a locked vault is unreadable on disk: Argon2id derives
the key material from your passphrase, the vault is a SQLCipher database, the
session cookie is `HttpOnly` and `SameSite=Strict`, mutating requests carry a
CSRF token and an Origin check, and the vault locks itself after a period of
inactivity. None of that removes your own duties: keep the host patched and
private, serve the app over HTTPS, protect the volume and make exports.

Some risks are explicitly out of scope and are documented in the threat model:
malware or a keylogger on the device you use, someone who reads the process
memory while the vault is unlocked, and a disk that is lost together with a
passphrase you wrote next to it. There is no passphrase recovery, no escrow and
no back door, by design.

## 8. Your rights

Because the maintainer holds none of your financial data, there is nothing to
access, correct, export or erase on the maintainer's side. Those rights are
exercised in your own instance, where the operator is the controller:

- **access and portability**: export the transaction CSV, the tables ZIP or the
  password-encrypted archive from Settings;
- **rectification**: edit any record directly in the app;
- **erasure**: delete records, unlink a bank, or delete the vault;
- **objection and restriction**: stop using the connector, or run Flowly without
  a bank connection at all.

If you run an instance that other people use, you are their controller for that
data and these controls are the tools you need to answer their requests.
Requests about the project's own channels (a GitHub issue, an email) can be sent
to the contact address in §12; you may also ask GitHub to remove content under
its own policies.

Flowly performs no profiling and no automated decision-making, and it has no
feature that produces legal or similarly significant effects about you.

## 9. Children

Flowly is not directed at children and is not intended for use by anyone under
16. The maintainer does not knowingly receive personal data from children; if
you believe a child sent personal data through the project's channels, contact
the address in §12 and it will be deleted.

## 10. International transfers

The Flowly project itself transfers nothing: there is no Flowly service, and the
software does not call home. Your instance runs where you host it, and a bank
connection goes from your host to Enable Banking and your bank, whose own
transfer rules apply. If you use GitHub to interact with the project, GitHub
operates and transfers data under its own policy.

## 11. Changes to this policy

This policy is versioned with the software. The version that applies to your
instance is the one contained in the commit you deployed, identified by the date
at the top of this file. Material changes are published as a new version in the
repository rather than rewritten in place, and the git history shows exactly
what changed and when.

## 12. Contact

Privacy questions and requests: **ivan.vaccari91@gmail.com**, or open an issue at
<https://github.com/ivanvaccarics/flowly/issues>. For anything concerning data
your bank or Enable Banking holds, contact them directly. The terms that
accompany this policy are in
[TERMS_OF_SERVICE.md](TERMS_OF_SERVICE.md).
