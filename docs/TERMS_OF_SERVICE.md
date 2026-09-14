# Flowly — Terms of Service

Version 1.0 · Effective 14 September 2026

These terms cover the Flowly software and the Flowly instance you run. They are
deliberately short, because Flowly does almost nothing on our side: it is
software you host yourself, with no Flowly account, no Flowly cloud and no fee.

## 1. Who provides Flowly

Flowly is free, open-source, self-hosted personal finance software created and
distributed by **Ivan Vaccari** ("the maintainer", "we"). The source code lives
at <https://github.com/ivanvaccarics/flowly> and is released under the Apache
License 2.0 — see [LICENSE](../LICENSE).

There is no Flowly-operated service behind the app: no registration, no
subscription, no server that we run for you or on your behalf, and no place
where we hold your data. A Flowly instance is installed and operated by whoever
deploys it ("the operator", "you"). If you install Flowly on your own hardware,
you are the operator. If somebody else installs it, or lets you use their
instance, that person or organisation is the operator and is responsible for
that deployment.

## 2. These terms and the open-source licence

Your rights to use, copy, modify and distribute Flowly's source code are granted
by the Apache License 2.0, which also contains a warranty disclaimer and a
limitation of liability. These terms do not replace that licence, restrict the
rights it grants, or add conditions to them: where the two differ, the licence
governs the code.

What these terms add is the practical framework for *running* an instance and
for connecting it to a bank: what you are responsible for, what the maintainer
is not responsible for, and which third parties are involved.

## 3. What you are responsible for

- **Your host and your network.** You choose the hardware, the network and who
  can reach the instance. Keeping the host patched, serving the app over HTTPS,
  restricting access to your private network or VPN, and protecting the volume
  that holds the vault are your responsibility. Flowly refuses to bind a public
  interface unless you opt in explicitly.
- **Your passphrase and your backups.** The vault is unlocked by a passphrase
  only you know. There is no recovery path, no key escrow and no reset: losing
  the passphrase means losing the data. Complete portable archives are the
  supported backup, and only you can make them. See
  [security/data-loss.md](security/data-loss.md).
- **The accounts you connect.** You may connect only bank accounts that you own
  or that you are lawfully entitled to access, and only where your bank and the
  applicable law allow it.
- **The rules that apply to you.** Your use of a bank connection is also subject
  to the terms of your bank and of Enable Banking, and — if you use Flowly in a
  regulated context — to the financial regulation that applies to you.
- **Keeping the app honest.** You may not present Flowly as a licensed financial
  service, hide from the people using an instance who operates it, or use it to
  access accounts without a lawful mandate.

## 4. Bank connections through Enable Banking

Flowly can read bank account information through **Enable Banking**, an account
information service (AIS) provider. Flowly never initiates payments and never
moves money; the connector requests balances and transactions only.

The connection is entirely yours:

1. You register your own application in the Enable Banking control panel, under
   your own account, and you keep its application id and private key.
2. You store those credentials in your Flowly instance, where they live inside
   the encrypted vault. They never reach the browser or any client bundle.
3. You authorise the consent at your bank, choosing which accounts are shared
   and for how long.
4. Your Flowly server then calls Enable Banking's API directly, with requests
   signed by your key, and receives the account information you approved.

The maintainer is not a party to that arrangement. We do not receive your
credentials, your consent, your bank data or any notification that you connected
a bank, and we cannot revoke a consent or read an instance. Enable Banking and
your bank are independent third parties with their own terms and privacy
policies, which you accept when you use them; requesting or renewing the license
or contractual arrangement they require for production use is your
responsibility. You can end access at any time by revoking the consent at your
bank or in the Enable Banking control panel, or by unlinking the bank in Flowly.

## 5. No financial advice, no guarantee on bank data

Flowly is a record-keeping and reporting tool. It does not provide financial,
investment, tax or legal advice, and it does not verify what a bank sends.
Balances and transactions are only as accurate, complete and timely as the
provider that supplies them: provider data can be delayed, incomplete,
duplicated or corrected by the bank afterwards. Always treat your bank's own
statements as authoritative.

## 6. Availability, support and changes

Flowly is provided **as is**, with no service level, no availability commitment
and no guaranteed support. There is no uptime to promise because there is no
service we operate: if your host is down, or you delete the vault, that is
beyond our control.

Support is community-based, through issues and discussions on the project
repository. Features described as planned — including the native iOS, Android,
macOS and Windows applications — are not part of what ships today and create no
obligation to deliver them.

We may publish a new version of these terms when the product changes. The
version that applies to you is the one contained in the commit you deploy, and
the date at the top of this file identifies it. Continued use of a new version
means you accept it.

## 7. Limitation of liability

To the fullest extent permitted by law, the maintainer is not liable for any
indirect, incidental, special or consequential damage, or for any loss of data,
profits, savings or goodwill, arising from the use of Flowly or from a bank
connection — including loss caused by a forgotten passphrase, a lost or stolen
device, an unprotected host, a failed backup, a bank or provider outage, or
inaccurate provider data. Flowly's code is distributed under the warranty
disclaimer and liability limitation of the Apache License 2.0.

Nothing in these terms excludes liability that cannot lawfully be excluded, or
limits the mandatory rights you have as a consumer under the law that applies to
you.

## 8. Governing law

These terms are governed by the laws of Italy, and disputes about them belong to
the courts of the maintainer's place of residence, without prejudice to any
mandatory consumer protection that applies where you live.

## 9. Contact

Questions, corrections and legal notices: **ivan.vaccari91@gmail.com**, or open
an issue at <https://github.com/ivanvaccarics/flowly/issues>. The privacy policy
for the project is in [PRIVACY_POLICY.md](PRIVACY_POLICY.md).
