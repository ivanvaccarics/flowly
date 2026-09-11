import { useState } from "react";
import { api } from "../api/client.js";
import { describeError } from "../hooks/use-workspace.js";

/** Base64 in chunks: spreading a large Uint8Array into btoa overflows the stack. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function DataPanel({ csrf }: { csrf: string }) {
  const [archivePassword, setArchivePassword] = useState("");
  const [csvPreview, setCsvPreview] = useState<
    | {
        rows: number;
        valid: number;
        duplicates: number;
        errors: Array<{ line: number; message: string }>;
        newTags: string[];
        unknownAccounts: string[];
      }
    | undefined
  >(undefined);
  const [csvContent, setCsvContent] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  function download(content: BlobPart, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function run(action: () => Promise<void>) {
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  return (
    <section className="panel" aria-labelledby="data-title">
      <h2 id="data-title">Your data</h2>

      <div className="actions">
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              const csv = await api.exportCsv();
              download(csv, "flowly-transactions.csv", "text/csv");
              setStatus("Transaction CSV exported.");
            })
          }
        >
          Export transactions CSV
        </button>
      </div>

      <div className="row-form">
        <label>
          Archive password
          <input
            type="password"
            value={archivePassword}
            onChange={(event) => setArchivePassword(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={archivePassword.length < 8}
          onClick={() =>
            void run(async () => {
              const archive = await api.exportArchive(csrf, archivePassword);
              download(archive, "flowly-vault.flowly", "application/octet-stream");
              setStatus("Complete portable archive exported.");
            })
          }
        >
          Export complete archive
        </button>
      </div>

      <div className="row-form">
        <label>
          Transaction CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) =>
              void run(async () => {
                const file = event.target.files?.[0];
                if (!file) return;
                const content = await file.text();
                setCsvContent(content);
                setCsvPreview(await api.previewCsv(csrf, content));
              })
            }
          />
        </label>
      </div>

      {csvPreview ? (
        <div role="status">
          <p>
            {csvPreview.valid} valid rows, {csvPreview.duplicates} duplicates,{" "}
            {csvPreview.errors.length} invalid rows.
            {csvPreview.newTags.length > 0 ? ` New tags: ${csvPreview.newTags.join(", ")}.` : ""}
            {csvPreview.unknownAccounts.length > 0
              ? ` Unknown accounts: ${csvPreview.unknownAccounts.length}.`
              : ""}
          </p>
          {csvPreview.errors.slice(0, 5).map((item) => (
            <p key={item.line} className="error">
              line {item.line}: {item.message}
            </p>
          ))}
          <button
            type="button"
            disabled={!csvContent || csvPreview.valid === 0}
            onClick={() =>
              void run(async () => {
                if (!csvContent) return;
                const report = await api.importCsv(csrf, csvContent);
                setStatus(
                  `Imported ${report.created} transactions (${report.skippedDuplicates} duplicates skipped, ${report.tagsCreated} tags created).`,
                );
                setCsvPreview(undefined);
                setCsvContent(undefined);
              })
            }
          >
            Merge into the vault
          </button>
        </div>
      ) : null}

      <div className="row-form">
        <label>
          Complete archive
          <input
            type="file"
            accept=".flowly,application/octet-stream"
            onChange={(event) =>
              void run(async () => {
                const file = event.target.files?.[0];
                if (!file) return;
                const confirmed = window.confirm(
                  "Importing a complete archive replaces every account, transaction and rule in this vault. Continue?",
                );
                if (!confirmed) return;
                const base64 = toBase64(new Uint8Array(await file.arrayBuffer()));
                const report = await api.importArchive(csrf, archivePassword, base64);
                setStatus(
                  `Archive imported: ${report.accounts} accounts, ${report.transactions} transactions, ${report.taggingRules} rules.`,
                );
              })
            }
          />
        </label>
      </div>

      {status ? (
        <p role="status" className="ok">
          {status}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
