import { useState } from "react";
import { api } from "../api/client.js";
import { BankingPanel } from "../components/BankingPanel.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, PageHeader } from "../components/ui.js";
import { describeError } from "../hooks/use-workspace.js";

interface CsvPreview {
  rows: number;
  valid: number;
  duplicates: number;
  errors: Array<{ line: number; message: string }>;
  newTags: string[];
  unknownAccounts: string[];
}

export interface SettingsViewProps {
  csrf: string;
  busy: boolean;
  onChangePassphrase: (current: string, next: string) => Promise<boolean>;
  onClearError: () => void;
}

export function SettingsView({ csrf, busy, onChangePassphrase, onClearError }: SettingsViewProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [passphraseState, setPassphraseState] = useState<"idle" | "ok" | "error">("idle");

  const [archivePassword, setArchivePassword] = useState("");
  const [csvPreview, setCsvPreview] = useState<CsvPreview | undefined>(undefined);
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

  function toBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
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
    <section className="view" aria-labelledby="settings-title">
      <PageHeader
        eyebrow="Settings · bank, passphrase and portable data"
        lead="Connect your bank, protect the local vault with its passphrase, and export or import your ledger without giving up sovereignty."
        facts={
          <>
            <Chip tone="vault" icon="shield">
              AES-256-GCM
            </Chip>
            <Chip tone="income" icon="check">
              zero-cloud
            </Chip>
          </>
        }
      />

      <BankingPanel csrf={csrf} />

      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          onClearError();
          void onChangePassphrase(current, next).then((ok) => {
            setPassphraseState(ok ? "ok" : "error");
            if (ok) {
              setCurrent("");
              setNext("");
            }
          });
        }}
      >
        <header>
          <div>
            <h2>Passphrase</h2>
            <span className="sub">Re-wraps the vault key; your data is not re-encrypted</span>
          </div>
        </header>
        <div className="fieldset framed">
          <label>
            Current passphrase
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </label>
          <label>
            New passphrase
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn primary"
            disabled={busy || current === "" || next === ""}
          >
            <Icon name="lock" size={16} />
            Change passphrase
          </button>
        </div>
        {passphraseState === "ok" ? (
          <Banner tone="ok">Passphrase changed. The vault keeps the same data.</Banner>
        ) : null}
        <p className="muted">
          There is no recovery. If you lose the passphrase, the vault stays locked forever.
        </p>
      </form>

      <div className="card">
        <header>
          <div>
            <h2>Portable export</h2>
            <span className="sub">Everything stays on your device — no upload, no telemetry</span>
          </div>
          <Chip tone="neutral">3 methods</Chip>
        </header>
        <div className="option-grid">
          <section className="option-card">
            <h3>
              <Icon name="download" size={18} />
              Transactions CSV
            </h3>
            <p className="sub">
              Universal tabular format, readable in any spreadsheet tool. Plain text: it is not
              encrypted.
            </p>
            <button
              type="button"
              className="btn block"
              onClick={() =>
                void run(async () => {
                  const csv = await api.exportCsv();
                  download(csv, "flowly-transactions.csv", "text/csv");
                  setStatus("Transaction CSV exported (plain text, not encrypted).");
                })
              }
            >
              <Icon name="download" size={16} />
              Export transactions CSV
            </button>
          </section>

          <section className="option-card">
            <h3>
              <Icon name="archive" size={18} />
              Every table as CSV files
            </h3>
            <p className="sub">
              One CSV per table — accounts, transactions, tags, rules — plus a manifest, packaged in
              a ZIP so you can take your data elsewhere. Plain text: it is not encrypted.
            </p>
            <button
              type="button"
              className="btn block"
              onClick={() =>
                void run(async () => {
                  const confirmed = window.confirm(
                    "This downloads your whole vault as plain, unencrypted CSV files. Anyone who opens the ZIP reads your finances. Continue?",
                  );
                  if (!confirmed) return;
                  const { content, filename } = await api.exportTablesZip();
                  download(content, filename, "application/zip");
                  setStatus("Every table exported as a plain-text ZIP (not encrypted).");
                })
              }
            >
              <Icon name="download" size={16} />
              Download every table (ZIP)
            </button>
          </section>

          <section className="option-card">
            <h3>
              <Icon name="shield" size={18} />
              Complete encrypted archive
            </h3>
            <p className="sub">
              Full snapshot of accounts, ledger, tags and rules in a password-encrypted{" "}
              <span className="mono">.flowly</span> file.
            </p>
            <label>
              Archive password
              <input
                type="password"
                value={archivePassword}
                onChange={(event) => setArchivePassword(event.target.value)}
                placeholder="at least 8 characters"
              />
            </label>
            <button
              type="button"
              className="btn primary block"
              disabled={archivePassword.length < 8}
              onClick={() =>
                void run(async () => {
                  const archive = await api.exportArchive(csrf, archivePassword);
                  download(archive, "flowly-vault.flowly", "application/octet-stream");
                  setStatus("Complete portable archive exported (encrypted).");
                })
              }
            >
              <Icon name="download" size={16} />
              Export complete archive
            </button>
          </section>
        </div>
      </div>

      <div className="card">
        <header>
          <div>
            <h2>Import into the vault</h2>
            <span className="sub">A CSV merge is additive; an archive replaces the vault</span>
          </div>
        </header>

        <div className="option-grid">
          <section className="option-card">
            <h3>
              <Icon name="upload" size={18} />
              Transactions CSV
            </h3>
            <p className="sub">
              Incremental and additive: importing never deletes an existing record.
            </p>
            <div className="dropzone">
              <Icon name="upload" size={22} />
              <span className="sub">Choose a bank or provider CSV export</span>
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
                      setStatus(undefined);
                    })
                  }
                />
              </label>
            </div>
          </section>

          <section className="option-card">
            <h3>
              <Icon name="archive" size={18} />
              Complete archive
            </h3>
            <p className="sub">
              Restoring a snapshot <strong>replaces</strong> what is in the vault right now.
            </p>
            <label>
              Archive password
              <input
                type="password"
                value={archivePassword}
                onChange={(event) => setArchivePassword(event.target.value)}
                placeholder="unlock the archive"
              />
            </label>
            <div className="dropzone">
              <Icon name="lock" size={22} />
              <span className="sub">Choose a .flowly archive</span>
              <label>
                Complete archive (.flowly)
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
                        `Archive imported: ${report.accounts} accounts, ${report.transactions} transactions, ${report.tags} tags, ${report.taggingRules} rules.`,
                      );
                    })
                  }
                />
              </label>
            </div>
          </section>
        </div>

        {csvPreview ? (
          <div className="stack" role="status">
            <p>
              {csvPreview.valid} valid rows · {csvPreview.duplicates} duplicates ·{" "}
              {csvPreview.errors.length} invalid rows
              {csvPreview.newTags.length > 0 ? ` · new tags: ${csvPreview.newTags.join(", ")}` : ""}
              {csvPreview.unknownAccounts.length > 0
                ? ` · unknown accounts: ${csvPreview.unknownAccounts.length}`
                : ""}
            </p>
            {csvPreview.errors.slice(0, 5).map((item) => (
              <p key={item.line} className="muted">
                line {item.line}: {item.message}
              </p>
            ))}
            <div>
              <button
                type="button"
                className="btn primary"
                disabled={!csvContent || csvPreview.valid === 0}
                onClick={() =>
                  void run(async () => {
                    if (!csvContent) return;
                    const report = await api.importCsv(csrf, csvContent);
                    setStatus(
                      `Imported ${report.created} transactions (${report.skippedDuplicates} duplicates skipped, ${report.tagsCreated} tags created, ${report.transactionsTaggedByRules} tagged by rules).`,
                    );
                    setCsvPreview(undefined);
                    setCsvContent(undefined);
                  })
                }
              >
                <Icon name="upload" size={16} />
                Merge into the vault
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {status ? <Banner tone="ok">{status}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </section>
  );
}
