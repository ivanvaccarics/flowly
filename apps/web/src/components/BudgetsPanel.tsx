import { useCallback, useEffect, useState } from "react";
import type { Budget, Tag } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { CURRENCIES, formatMoney, parseAmountToMinor } from "../lib/money.js";

export function BudgetsPanel({ csrf }: { csrf: string }) {
  const budgets = useCollection<Budget>("budgets", csrf, true);
  const tags = useCollection<Tag>("tags", csrf, true);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [period, setPeriod] = useState("monthly");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [rollover, setRollover] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const loadProgress = useCallback(async () => {
    try {
      const response = await api.budgetConsumption();
      setProgress(
        Object.fromEntries(response.items.map((entry) => [entry.budgetId, entry.percentUsed])),
      );
    } catch (cause) {
      setFormError(describeError(cause));
    }
  }, []);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress, budgets.items.length]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(undefined);
    let amountMinor: number;
    try {
      amountMinor = parseAmountToMinor(amount, currency);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Invalid amount");
      return;
    }
    const now = new Date().toISOString();
    const created = await budgets.create({
      formatVersion: 1,
      revision: 1,
      id: crypto.randomUUID(),
      name,
      amountMinor,
      currency,
      period,
      startDate: new Date().toISOString().slice(0, 10),
      rollover,
      active: true,
      createdAt: now,
      updatedAt: now,
      ...(tagIds.length > 0 ? { tagIds } : {}),
    });
    if (created) {
      setName("");
      setAmount("");
      setTagIds([]);
      await loadProgress();
    }
  }

  return (
    <section className="panel" aria-labelledby="budgets-title">
      <h2 id="budgets-title">Budgets</h2>
      <p className="muted">
        Budgets are denominated in one currency. Transactions in another currency are skipped unless
        they carry an explicit converted amount.
      </p>

      <form className="row-form" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Limit
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="400"
            required
          />
        </label>
        <label>
          Currency
          <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Period
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            {["weekly", "monthly", "quarterly", "yearly"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={rollover}
            onChange={(event) => setRollover(event.target.checked)}
          />
          Roll over the previous surplus
        </label>
        <button type="submit" disabled={name.trim() === "" || amount.trim() === ""}>
          Add budget
        </button>
      </form>

      <fieldset className="tags">
        <legend>Limit to tags</legend>
        {tags.items.map((tag) => (
          <label key={tag.id}>
            <input
              type="checkbox"
              checked={tagIds.includes(tag.id)}
              onChange={(event) =>
                setTagIds((current) =>
                  event.target.checked
                    ? [...current, tag.id]
                    : current.filter((id) => id !== tag.id),
                )
              }
            />
            {tag.name}
          </label>
        ))}
      </fieldset>

      {(budgets.error ?? formError) ? (
        <p role="alert" className="error">
          {budgets.error ?? formError}
        </p>
      ) : null}

      <ul className="list">
        {budgets.items.map((budget) => {
          const percent = progress[budget.id];
          return (
            <li key={budget.id}>
              <span>
                <strong>{budget.name}</strong> · {budget.period} ·{" "}
                {formatMoney(budget.amountMinor, budget.currency)}
                {budget.rollover ? " · rollover" : ""}
                {percent === undefined ? "" : ` · ${percent}% used`}
              </span>
              <span className="actions">
                <button
                  type="button"
                  onClick={() => void budgets.update({ ...budget, active: !budget.active })}
                >
                  {budget.active ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  onClick={() => void budgets.remove(budget.id, budget.revision)}
                >
                  Delete
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {budgets.items.length === 0 ? <p className="muted">No budgets yet.</p> : null}
    </section>
  );
}
