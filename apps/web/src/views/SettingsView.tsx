import { useState } from "react";
import { api } from "../api/client.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip } from "../components/ui.js";
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
      <div className="view-header">
        <div>
          <p className="eyebrow">Settings · passphrase and portable data</p>
          <h1 id="settings-title">Settings</h1>
        </div>
        <Chip tone="vault" icon="shield">
          AES-256-GCM
        </Chip>
      </div>

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
          <h2>Passphrase</h2>
          <span className="sub">Re-wraps the vault key; your data is not re-encrypted</span>
        </header>
        <div className="fieldset">
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
          <h2>Export</h2>
          <span className="sub">Everything stays on your device</span>
        </header>
        <div className="fieldset">
          <button
            type="button"
            className="btn"
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
        </div>
        <div className="fieldset">
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
            className="btn"
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
        </div>
      </div>

      <div className="card">
        <header>
          <h2>Import</h2>
          <span className="sub">A CSV merge is additive; an archive replaces the vault</span>
        </header>

        <div className="fieldset">
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

        <div className="fieldset">
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
      </div>

      {status ? <Banner tone="ok">{status}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </section>
  );
}
