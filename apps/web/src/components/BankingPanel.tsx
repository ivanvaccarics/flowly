import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account } from "@flowly/web-contracts";
import {
  api,
  type AspspSummary,
  type BankAccountMappingInput,
  type BankLinkSummary,
} from "../api/client.js";
import { useBanking } from "../hooks/use-banking.js";
import { AspspPicker } from "./AspspPicker.js";
import { BankingConnectionForm, BankingConnectionSettings } from "./BankingConnectionForm.js";
import {
  BANK_LINK_STATUS_LABEL,
  BankingLinkCard,
  BankingPendingAuthorization,
} from "./BankingLinkCard.js";
import { parseRedirect, type StartedAuthorization } from "./banking-callback.js";
import { Icon } from "./icons.js";
import { Banner, Chip, Empty } from "./ui.js";
import { describeBankAuthorizationError } from "../lib/banking-errors.js";

export function BankingPanel({ csrf }: { csrf: string }) {
  const banking = useBanking(csrf, true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [aspsps, setAspsps] = useState<AspspSummary[] | undefined>(undefined);
  const [country, setCountry] = useState("IT");
  const [psuType, setPsuType] = useState<"personal" | "business">("personal");
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<StartedAuthorization | undefined>(undefined);

  const loadAccounts = useCallback(async () => {
    try {
      const response = await api.list<Account>("accounts");
      setAccounts(response.items.filter((account) => !account.archivedAt));
    } catch {
      // The mapping form simply offers account creation when the list fails.
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const connection = banking.status?.connection;
    if (connection) {
      setCountry(connection.country);
      setPsuType(connection.psuType);
    }
  }, [banking.status?.connection]);

  const configured = banking.status?.configured ?? false;
  const links = banking.status?.links ?? [];
  const waitingLink = links.find((link) => link.status === "pending");

  async function loadBanks() {
    const response = await banking.run(() => api.listAspsps({ country, psuType }));
    if (response) setAspsps(response.items);
  }

  async function connect(aspsp: AspspSummary) {
    const started = await banking.run(() =>
      api.startBankingAuthorization(csrf, {
        aspspName: aspsp.name,
        aspspCountry: aspsp.country,
        psuType,
      }),
    );
    if (!started) return;
    // The bank takes over in another tab, so this page - and the paste
    // fallback - survive a callback host the browser cannot reach.
    setPending({ ...started, aspspName: aspsp.name });
  }

  /**
   * Completes the authorization from the URL the browser was redirected to.
   * This is the fallback when the registered callback URL is not reachable from
   * the browser, and the only way to surface an Enable Banking error parameter.
   */
  async function completeFromRedirect(raw: string): Promise<boolean> {
    const parsed = parseRedirect(raw);
    if (parsed.error) {
      setNotice(describeBankAuthorizationError(parsed.error, parsed.description));
      return false;
    }
    if (!parsed.code || !parsed.state) {
      setNotice("That URL has no authorization code. Paste the address you were redirected to.");
      return false;
    }
    const { code, state } = { code: parsed.code, state: parsed.state };
    const result = await banking.run(() => api.completeBankingAuthorization(csrf, { code, state }));
    if (!result) return false;
    setPending(undefined);
    setNotice(
      `${result.aspsp.name} is connected. Link its accounts below${
        result.accounts.length > 0 ? ` (${result.accounts.length} shared)` : ""
      }.`,
    );
    return true;
  }

  async function mapAccount(
    link: BankLinkSummary,
    providerAccountUid: string,
    body: BankAccountMappingInput,
  ) {
    const result = await banking.run(() =>
      api.mapBankAccount(csrf, link.id, { providerAccountUid, ...body }),
    );
    if (result) {
      await loadAccounts();
      setNotice(`Bank account ${body.mode === "ignore" ? "ignored" : "linked"}.`);
    }
  }

  /**
   * Drops a pending authorization. Without this the request stays pending in the
   * vault — and the panel keeps waiting for a bank that will never come back.
   */
  async function deleteAuthorization(linkId: string | undefined) {
    const confirmed = window.confirm(
      "Delete this authorization request? Nothing was imported, and you can connect the bank again right away.",
    );
    if (!confirmed) return;
    if (!linkId) {
      setPending(undefined);
      return;
    }
    const result = await banking.run(() => api.unlinkBank(csrf, linkId));
    if (!result) return;
    setPending(undefined);
    setNotice("Authorization request deleted. Nothing was imported.");
  }

  /**
   * The bank page may finish in another tab, or the user may come back to this
   * one: watch the pending link so the panel advances without a pasted URL.
   */
  useEffect(() => {
    if (!pending) return;
    const link = links.find((candidate) => candidate.id === pending.linkId);
    if (!link || link.status === "pending") return;
    setPending(undefined);
    if (link.status === "authorized") {
      setNotice(`${link.aspspName} is connected. Link its accounts below.`);
      void loadAccounts();
    } else {
      setNotice(`${link.aspspName}: ${BANK_LINK_STATUS_LABEL[link.status]}.`);
    }
  }, [pending, links, loadAccounts]);

  const waitingForBank = pending !== undefined || waitingLink !== undefined;
  useEffect(() => {
    if (!waitingForBank) return;
    const timer = window.setInterval(() => void banking.refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [waitingForBank, banking.refresh]);

  const sandboxHint = useMemo(() => {
    const users = aspsps?.flatMap((aspsp) => aspsp.sandboxUsers).filter((user) => user.username);
    return users && users.length > 0 ? users[0] : undefined;
  }, [aspsps]);

  const waiting = pending !== undefined || waitingLink !== undefined;
  const unmappedCount = links
    .flatMap((link) => link.accounts)
    .filter((account) => account.status === "unmapped").length;
  const guidance = !configured
    ? "Register an Enable Banking application, then add its application id, its .pem key and the callback URL here."
    : waiting
      ? "Finish the authorization at your bank: the panel in the next card has the link and the fallback."
      : links.length === 0
        ? "Pick your bank in the next card and press Connect."
        : unmappedCount > 0
          ? `${unmappedCount} shared account${unmappedCount === 1 ? "" : "s"} still need a decision: create, pair or ignore.`
          : `${links.length} bank${links.length === 1 ? "" : "s"} connected. Sync runs when the vault unlocks, and Sync now pulls the latest movements.`;

  return (
    <div className="stack">
      <div className="card">
        <header>
          <div>
            <h2>Connect to Enable Banking</h2>
            <span className="sub">
              Read the accounts and movements your bank shares into this vault. The private key
              stays on this server, encrypted inside the vault.
            </span>
          </div>
          <Chip tone={configured ? "income" : "neutral"} icon="bank">
            {configured ? (banking.status?.connection?.appName ?? "configured") : "not connected"}
          </Chip>
        </header>

        {banking.error ? <Banner tone="error">{banking.error}</Banner> : null}
        {notice ? <Banner tone="ok">{notice}</Banner> : null}
        <Banner>
          <strong>Next:</strong> {guidance}
        </Banner>

        {configured ? (
          <BankingConnectionSettings
            fingerprint={banking.status?.connection?.keyFingerprint ?? ""}
            appId={banking.status?.connection?.appId ?? ""}
            environment={banking.status?.connection?.environment ?? "SANDBOX"}
            redirectUrl={banking.status?.connection?.redirectUrl ?? ""}
            autoSync={banking.status?.connection?.autoSync ?? true}
            busy={banking.busy}
            country={country}
            psuType={psuType}
            onCountry={setCountry}
            onPsuType={setPsuType}
            onSaveRedirectUrl={(url) => {
              void banking
                .run(() =>
                  api.saveBankingConfig(csrf, {
                    appId: banking.status?.connection?.appId ?? "",
                    redirectUrl: url,
                    environment: banking.status?.connection?.environment ?? "SANDBOX",
                    psuType,
                    country,
                    autoSync: banking.status?.connection?.autoSync ?? true,
                  }),
                )
                .then((saved) => {
                  if (saved) setNotice("Callback URL saved and verified against Enable Banking.");
                });
            }}
            onDisconnect={() => {
              const confirmed = window.confirm(
                "Disconnect Enable Banking? The stored application key and every bank link are removed. Imported transactions stay in your vault.",
              );
              if (!confirmed) return;
              void banking
                .run(() => api.deleteBankingConfig(csrf))
                .then((result) => {
                  if (!result) return;
                  setPending(undefined);
                  setAspsps(undefined);
                  setNotice(
                    `Enable Banking disconnected${
                      result.deletedLinks > 0 ? `, ${result.deletedLinks} bank link(s) removed` : ""
                    }. Imported transactions were kept.`,
                  );
                });
            }}
            onToggleAutoSync={(autoSync) =>
              void banking.run(() =>
                api.saveBankingConfig(csrf, {
                  appId: banking.status?.connection?.appId ?? "",
                  redirectUrl: banking.status?.connection?.redirectUrl ?? "",
                  environment: banking.status?.connection?.environment ?? "SANDBOX",
                  psuType,
                  country,
                  autoSync,
                }),
              )
            }
          />
        ) : (
          <BankingConnectionForm
            busy={banking.busy}
            onSave={(input) =>
              void banking
                .run(() => api.saveBankingConfig(csrf, input))
                .then((saved) => {
                  if (saved)
                    setNotice(
                      `Connected to ${saved.connection.appName ?? saved.connection.appId}.`,
                    );
                })
            }
          />
        )}
      </div>

      {configured ? (
        <div className="card">
          <header>
            <div>
              <h3>Connect a bank</h3>
              <span className="sub">
                {waiting
                  ? "Finish the authorization, then decide how the shared accounts map."
                  : "Choose the country and the account type, then find your bank by name or BIC."}
              </span>
            </div>
          </header>

          {waiting ? (
            <BankingPendingAuthorization
              pending={pending}
              link={waitingLink}
              busy={banking.busy}
              onComplete={completeFromRedirect}
              onDelete={() => void deleteAuthorization(pending?.linkId ?? waitingLink?.id)}
            />
          ) : (
            <>
              <div className="fieldset framed">
                <label>
                  Bank country
                  <input
                    value={country}
                    maxLength={2}
                    onChange={(event) => setCountry(event.target.value.toUpperCase())}
                    placeholder="IT"
                  />
                </label>
                <label>
                  Account type
                  <select
                    value={psuType}
                    onChange={(event) => setPsuType(event.target.value as "personal" | "business")}
                  >
                    <option value="personal">personal</option>
                    <option value="business">business</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn small"
                  disabled={banking.busy}
                  onClick={() => void loadBanks()}
                >
                  <Icon name="bank" size={14} />
                  Load available banks
                </button>
              </div>

              {aspsps ? (
                aspsps.length === 0 ? (
                  <Empty>No bank in this country offers account information.</Empty>
                ) : (
                  <AspspPicker
                    key={`${country}-${psuType}-${aspsps.length}`}
                    banks={aspsps}
                    busy={banking.busy}
                    onConnect={(aspsp) => void connect(aspsp)}
                  />
                )
              ) : (
                <Empty>
                  Press <strong>Load available banks</strong> to see the banks Enable Banking
                  supports in this country.
                </Empty>
              )}
              {sandboxHint ? (
                <p className="muted">
                  Sandbox login: <span className="mono">{sandboxHint.username}</span> /{" "}
                  <span className="mono">{sandboxHint.password}</span>
                  {sandboxHint.otp ? (
                    <>
                      {" "}
                      · OTP <span className="mono">{sandboxHint.otp}</span>
                    </>
                  ) : null}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className="card">
          <header>
            <div>
              <h3>Your banks</h3>
              <span className="sub">
                Linked banks refresh when the vault unlocks, and on demand with Sync now.
              </span>
            </div>
            <Chip tone="neutral">{links.length} linked</Chip>
          </header>
          <div className="stack">
            {links.map((link) => (
              <BankingLinkCard
                key={link.id}
                link={link}
                accounts={accounts}
                busy={banking.busy}
                onSync={() =>
                  void banking
                    .run(() => api.syncBanking(csrf, link.id))
                    .then((result) => {
                      if (result) {
                        setNotice(
                          `Sync finished: ${result.report.created} new, ${result.report.updated} updated.`,
                        );
                        void loadAccounts();
                      }
                    })
                }
                onUnlink={() => {
                  const confirmed = window.confirm(
                    `Unlink ${link.aspspName}? Flowly stops refreshing it, the shared accounts and raw responses are removed from the vault, and every imported transaction stays.`,
                  );
                  if (!confirmed) return;
                  void banking
                    .run(() => api.unlinkBank(csrf, link.id))
                    .then((result) => {
                      if (result) setNotice("Bank unlinked. Imported transactions were kept.");
                    });
                }}
                onMap={(uid, body) => mapAccount(link, uid, body).then(() => undefined)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
