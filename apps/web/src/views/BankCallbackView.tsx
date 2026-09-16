import { useEffect, useRef, useState } from "react";
import type { Account } from "@flowly/web-contracts";
import {
  api,
  type BankAccountMappingInput,
  type BankingAuthorizationResult,
} from "../api/client.js";
import { BankAccountMapping, type DiscoveredAccount } from "../components/BankAccountMapping.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, PageHeader } from "../components/ui.js";
import { describeBankAuthorizationError } from "../lib/banking-errors.js";
import { describeError } from "../hooks/use-workspace.js";

/**
 * Landing point of the Enable Banking redirect. The single-use state in the URL
 * is exchanged for a bank session, then the user decides how the shared
 * accounts map onto Flowly accounts.
 */
export function BankCallbackView({ csrf, onFinished }: { csrf: string; onFinished: () => void }) {
  const [result, setResult] = useState<BankingAuthorizationResult | undefined>(undefined);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  // The authorization code is single-use; never exchange it twice (StrictMode).
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error_ = params.get("error");
    if (error_) {
      setError(
        describeBankAuthorizationError(error_, params.get("error_description") ?? undefined),
      );
      return;
    }
    if (!code || !state) {
      setError("This callback link is missing its authorization code.");
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        const completed = await api.completeBankingAuthorization(csrf, { code, state });
        setResult(completed);
        const list = await api.list<Account>("accounts");
        setAccounts(list.items.filter((account) => !account.archivedAt));
      } catch (cause) {
        setError(describeError(cause));
      } finally {
        setBusy(false);
      }
    })();
  }, [csrf]);

  async function mapAccount(providerAccountUid: string, body: BankAccountMappingInput) {
    if (!result) return;
    setBusy(true);
    try {
      const updated = await api.mapBankAccount(csrf, result.link.id, {
        providerAccountUid,
        ...body,
      });
      setResult({ ...result, link: updated });
      const list = await api.list<Account>("accounts");
      setAccounts(list.items.filter((account) => !account.archivedAt));
      setNotice("Saved. You can link another account or finish.");
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  const discovered: DiscoveredAccount[] =
    result?.link.accounts.map((account) => ({
      providerAccountUid: account.providerAccountUid,
      status: account.status,
      suggestedName: account.providerName ?? `${result.aspsp.name} account`,
      suggestedType: "checking",
      ...(account.currency
        ? { suggestedCurrency: account.currency, currency: account.currency }
        : {}),
      ...(account.maskedIban ? { maskedIban: account.maskedIban } : {}),
      ...(account.providerName ? { providerName: account.providerName } : {}),
      ...(account.cashAccountType ? { cashAccountType: account.cashAccountType } : {}),
    })) ?? [];

  const remaining = discovered.filter((account) => account.status !== "mapped");

  return (
    <section className="view" aria-labelledby="bank-callback-title">
      <PageHeader
        eyebrow="Enable Banking · authorizing your bank"
        title={result ? `${result.aspsp.name} is connected` : "Finishing the bank connection"}
        titleId="bank-callback-title"
        titleLevel={1}
        lead={
          result
            ? "Tell Flowly what to do with each account the bank shared."
            : "Flowly is exchanging the authorization code for a bank session."
        }
        facts={
          <>
            <Chip tone={result ? "income" : "neutral"} icon="bank">
              {result ? "authorized" : busy ? "working" : "waiting"}
            </Chip>
          </>
        }
      />

      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}

      {result ? (
        <div className="card">
          <header>
            <div>
              <h2>Accounts shared by {result.aspsp.name}</h2>
              <span className="sub">
                {result.accessValidUntil
                  ? `Consent valid until ${new Date(result.accessValidUntil).toLocaleString()}`
                  : "Consent validity was not reported"}
              </span>
            </div>
          </header>
          <BankAccountMapping
            link={result.link}
            discovered={remaining}
            accounts={accounts}
            busy={busy}
            onMap={mapAccount}
          />
          <div className="cell-actions">
            <button type="button" className="btn primary" disabled={busy} onClick={onFinished}>
              <Icon name="check" size={16} />
              Finish
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
