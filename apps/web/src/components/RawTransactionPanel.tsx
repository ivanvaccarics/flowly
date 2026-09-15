import { useEffect, useState } from "react";
import type { Transaction } from "@flowly/web-contracts";
import { api, type RawTransactionRecord } from "../api/client.js";
import { Banner, Money } from "./ui.js";
import { describeError } from "../hooks/use-workspace.js";

interface RawField {
  path: string;
  value: string;
}

/** Flattens provider JSON into rows, so the panel reads as a table, not a blob. */
function flatten(value: unknown, prefix = "", depth = 0, out: RawField[] = []): RawField[] {
  if (out.length >= 200 || depth > 6) return out;
  if (value === null) {
    out.push({ path: prefix, value: "null" });
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push({ path: prefix, value: "[]" });
      return out;
    }
    value.forEach((entry, index) => flatten(entry, `${prefix}[${index}]`, depth + 1, out));
    return out;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.push({ path: prefix, value: "{}" });
      return out;
    }
    for (const [key, entry] of entries) {
      flatten(entry, prefix === "" ? key : `${prefix}.${key}`, depth + 1, out);
    }
    return out;
  }
  out.push({ path: prefix, value: typeof value === "string" ? value : String(value) });
  return out;
}

function stamp(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * The provider record behind one transaction, the way the bank sent it: the
 * mapped fields next to the raw ones, with the exact JSON one click away.
 */
export function RawTransactionPanel({ transaction }: { transaction: Transaction }) {
  const [record, setRecord] = useState<RawTransactionRecord | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    void api
      .transactionRaw(transaction.id)
      .then((next) => {
        if (active) setRecord(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [transaction.id]);

  if (loading) return <p className="muted">Loading the provider record…</p>;
  if (error !== undefined) return <Banner>{error}</Banner>;
  if (!record) return null;

  const providerFields = flatten(record.raw);
  const stored: Array<[string, React.ReactNode]> = [
    ["Booking date", transaction.bookingDate],
    [
      "Amount",
      <Money key="amount" minor={transaction.amountMinor} currency={transaction.currency} />,
    ],
    ["Payee", transaction.payee ?? "—"],
    ["Description", transaction.description ?? "—"],
    ["Your note", transaction.userNote ?? "—"],
    ["Status", transaction.status],
    ["Source", transaction.source],
    ["Provider transaction", transaction.providerTransactionId ?? "—"],
  ];

  return (
    <section className="raw-panel" aria-label="Raw provider record">
      <p className="muted">
        From <strong>{record.aspspName || "the bank"}</strong> · fetched {stamp(record.fetchedAt)}
        {record.requestFrom && record.requestTo
          ? ` · window ${record.requestFrom} → ${record.requestTo}`
          : ""}{" "}
        · matched by{" "}
        {record.matchedBy === "provider-transaction-id"
          ? "its provider id"
          : "booking date, amount and currency"}
      </p>

      <div className="raw-panel-grid">
        <div>
          <h4>What Flowly stored</h4>
          <table>
            <tbody>
              {stored.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4>What the bank sent</h4>
          <table>
            <tbody>
              {providerFields.map((field, index) => (
                <tr key={`${field.path}-${index}`}>
                  <th scope="row" className="mono">
                    {field.path}
                  </th>
                  <td>{field.value === "" ? "—" : field.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details>
        <summary>Exact JSON</summary>
        <pre className="raw-json">{JSON.stringify(record.raw, null, 2)}</pre>
      </details>
    </section>
  );
}
