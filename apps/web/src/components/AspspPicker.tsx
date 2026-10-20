import { useMemo, useState, type KeyboardEvent } from "react";
import type { AspspSummary } from "@flowly/web-contracts";
import { Icon } from "./icons.js";
import { Chip } from "./ui.js";

const MATCH_LIMIT = 8;

function normalizeBankName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

/**
 * Filters the bank catalogue as the user types. Connecting takes a second,
 * explicit click because it leaves Flowly for the bank's own pages.
 */
export function AspspPicker({
  banks,
  busy,
  onConnect,
}: {
  banks: AspspSummary[];
  busy: boolean;
  onConnect: (aspsp: AspspSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AspspSummary | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = "aspsp-options";

  const matches = useMemo(() => {
    const needle = normalizeBankName(query.trim());
    const filtered = banks.filter((bank) => {
      if (needle === "") return true;
      if (normalizeBankName(bank.name).includes(needle)) return true;
      return bank.bic ? bank.bic.toLowerCase().includes(needle) : false;
    });
    return { total: filtered.length, items: filtered.slice(0, MATCH_LIMIT) };
  }, [banks, query]);

  function choose(bank: AspspSummary | undefined) {
    if (!bank) return;
    setSelected(bank);
    setQuery(bank.name);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return Math.min(Math.max(next, 0), Math.max(matches.items.length - 1, 0));
      });
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      choose(matches.items[active]);
      return;
    }
    if (event.key === "Escape") setOpen(false);
  }

  const showList = open && matches.items.length > 0;

  return (
    <div className="stack">
      <label>
        Search your bank
        <input
          value={query}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Type a name or a BIC"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(undefined);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </label>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching banks"
          className="stack"
          style={{ listStyle: "none", padding: 0, margin: 0 }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {matches.items.map((bank, index) => (
            <li key={`${bank.country}-${bank.name}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? "btn small primary" : "btn small"}
                style={{ justifyContent: "flex-start", width: "100%" }}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(bank)}
              >
                {bank.name}
                {bank.bic ? ` · ${bank.bic}` : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="muted">
        {query.trim() === ""
          ? `${banks.length} ${banks.length === 1 ? "bank" : "banks"} available in ${
              banks[0]?.country ?? "this country"
            }.`
          : matches.total === 0
            ? "No bank matches that name."
            : `${matches.total} ${matches.total === 1 ? "bank matches" : "banks match"}${
                matches.total > matches.items.length
                  ? `, showing the first ${matches.items.length}`
                  : ""
              }.`}
      </p>

      {selected ? (
        <div className="rule-tile">
          <header className="rule-tile-head">
            <div className="stack">
              <strong>{selected.name}</strong>
              <span className="sub">
                {selected.country}
                {selected.bic ? ` · ${selected.bic}` : ""}
                {selected.maximumConsentDays
                  ? ` · consent up to ${selected.maximumConsentDays} days`
                  : ""}
              </span>
            </div>
            <div className="cell-actions">
              {selected.beta ? <Chip tone="neutral">beta</Chip> : null}
              <button
                type="button"
                className="btn small primary"
                disabled={busy}
                onClick={() => onConnect(selected)}
              >
                <Icon name="plus" size={14} />
                Connect
              </button>
            </div>
          </header>
          <p className="muted">
            Flowly starts the consent, then hands you over to {selected.name} to approve it. You
            come back here automatically.
          </p>
        </div>
      ) : null}
    </div>
  );
}
