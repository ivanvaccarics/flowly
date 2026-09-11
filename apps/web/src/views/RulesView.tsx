import { useState } from "react";
import type { Tag, TaggingRule } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { CURRENCIES } from "../lib/money.js";

/** Local builder shape: the contract narrows operators per field. */
interface Condition {
  field: "userNote" | "description" | "payee" | "amountMinor" | "accountId";
  operator: "contains" | "is" | "greaterThan" | "lessThan" | "equals";
  value: string | number;
  currency?: string;
}

const FIELDS: Array<Condition["field"]> = [
  "userNote",
  "description",
  "payee",
  "amountMinor",
  "accountId",
];

const OPERATORS_BY_FIELD: Record<Condition["field"], Array<Condition["operator"]>> = {
  userNote: ["contains"],
  description: ["contains"],
  payee: ["is", "contains"],
  amountMinor: ["greaterThan", "lessThan", "equals"],
  accountId: ["is"],
};

const EMPTY_CONDITION: Condition = { field: "userNote", operator: "contains", value: "" };

export function RulesView({ csrf }: { csrf: string }) {
  const rules = useCollection<TaggingRule>("tagging-rules", csrf, true);
  const tags = useCollection<Tag>("tags", csrf, true);
  const [name, setName] = useState("");
  const [combinator, setCombinator] = useState<"and" | "or">("and");
  const [conditions, setConditions] = useState<Condition[]>([{ ...EMPTY_CONDITION }]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [report, setReport] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  function updateCondition(index: number, next: Condition) {
    setConditions((current) =>
      current.map((condition, position) => (position === index ? next : condition)),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setActionError(undefined);
    setReport(undefined);
    if (tagIds.length === 0) {
      setActionError("Pick at least one tag to apply.");
      return;
    }
    const now = new Date().toISOString();
    const created = await rules.create({
      formatVersion: 1,
      revision: 1,
      id: crypto.randomUUID(),
      name,
      enabled: true,
      combinator,
      conditions: conditions as unknown as TaggingRule["conditions"],
      tagIds,
      createdAt: now,
      updatedAt: now,
    });
    if (created) {
      setName("");
      setConditions([{ ...EMPTY_CONDITION }]);
      setTagIds([]);
    }
  }

  async function backfill() {
    setActionError(undefined);
    try {
      const result = await api.backfill(csrf);
      setReport(`Evaluated ${result.evaluated} transactions, tagged ${result.changed}.`);
      await rules.reload();
    } catch (cause) {
      setActionError(describeError(cause));
    }
  }

  return (
    <section className="view" aria-labelledby="rules-title">
      <div className="view-header">
        <div>
          <p className="eyebrow">Automation · rules only add tags</p>
          <h1 id="rules-title">Tagging rules</h1>
        </div>
        <button type="button" className="btn" onClick={() => void backfill()}>
          <Icon name="rules" size={16} />
          Apply rules to existing transactions
        </button>
      </div>

      <p className="muted">
        Rules run when a transaction is created or imported. Editing a transaction never re-runs
        them, so a tag you remove by hand stays removed.
      </p>

      <form className="card" onSubmit={submit}>
        <header>
          <h2>New rule</h2>
        </header>
        <div className="fieldset">
          <label>
            Rule name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Match
            <select
              value={combinator}
              onChange={(event) => setCombinator(event.target.value as "and" | "or")}
            >
              <option value="and">all conditions (AND)</option>
              <option value="or">any condition (OR)</option>
            </select>
          </label>
        </div>

        {conditions.map((condition, index) => (
          <fieldset key={index} className="condition">
            <legend>Condition {index + 1}</legend>
            <label>
              Field
              <select
                aria-label={`Field ${index + 1}`}
                value={condition.field}
                onChange={(event) => {
                  const field = event.target.value as Condition["field"];
                  const operator = OPERATORS_BY_FIELD[field][0] as Condition["operator"];
                  updateCondition(index, {
                    field,
                    operator,
                    value: field === "amountMinor" ? 0 : "",
                    ...(field === "amountMinor" ? { currency: "EUR" } : {}),
                  });
                }}
              >
                {FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operator
              <select
                aria-label={`Operator ${index + 1}`}
                value={condition.operator}
                onChange={(event) =>
                  updateCondition(index, {
                    ...condition,
                    operator: event.target.value as Condition["operator"],
                  })
                }
              >
                {OPERATORS_BY_FIELD[condition.field].map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Value
              <input
                aria-label={`Value ${index + 1}`}
                value={String(condition.value)}
                onChange={(event) =>
                  updateCondition(index, {
                    ...condition,
                    value:
                      condition.field === "amountMinor"
                        ? Number(event.target.value)
                        : event.target.value,
                  })
                }
              />
            </label>
            {condition.field === "amountMinor" ? (
              <label>
                Currency
                <select
                  aria-label={`Currency ${index + 1}`}
                  value={condition.currency ?? "EUR"}
                  onChange={(event) =>
                    updateCondition(index, { ...condition, currency: event.target.value })
                  }
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {conditions.length > 1 ? (
              <button
                type="button"
                className="btn small danger"
                onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            ) : null}
          </fieldset>
        ))}

        <div className="actions" style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="btn small"
            onClick={() =>
              setConditions((current) => [
                ...current,
                { ...EMPTY_CONDITION, field: "payee", operator: "is" },
              ])
            }
          >
            <Icon name="plus" size={14} />
            Add condition
          </button>
        </div>

        <fieldset className="fieldset">
          <legend>Tags to apply</legend>
          {tags.items.length === 0 ? (
            <span className="sub">Create tags first.</span>
          ) : (
            tags.items.map((tag) => (
              <label key={tag.id} className="checkline">
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
                <span className="swatch" style={{ background: tag.color ?? "#4648d4" }} />
                {tag.name}
              </label>
            ))
          )}
        </fieldset>

        <div>
          <button type="submit" className="btn primary">
            Save rule
          </button>
        </div>
      </form>

      {report ? <Banner tone="ok">{report}</Banner> : null}
      {(rules.error ?? actionError) ? (
        <Banner tone="error">{rules.error ?? actionError}</Banner>
      ) : null}

      <div className="card">
        <header>
          <h2>Your rules</h2>
          <Chip tone="neutral">{rules.items.length} total</Chip>
        </header>
        {rules.items.length > 0 ? (
          <ul className="rule-list">
            {rules.items.map((rule) => (
              <li key={rule.id}>
                <span className="stack">
                  <span>
                    <strong>{rule.name}</strong>{" "}
                    <Chip tone={rule.enabled ? "income" : "neutral"}>
                      {rule.enabled ? "active" : "paused"}
                    </Chip>
                  </span>
                  <span className="sub mono">
                    {rule.combinator.toUpperCase()} ·{" "}
                    {rule.conditions
                      .map(
                        (condition) =>
                          `${condition.field} ${condition.operator} ${condition.value}`,
                      )
                      .join(" · ")}
                  </span>
                  <span className="sub">
                    →{" "}
                    {rule.tagIds
                      .map((id) => tags.items.find((tag) => tag.id === id)?.name ?? "…")
                      .join(", ")}
                  </span>
                </span>
                <div className="cell-actions">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => void rules.update({ ...rule, enabled: !rule.enabled })}
                  >
                    {rule.enabled ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => void rules.remove(rule.id, rule.revision)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No rules yet.</Empty>
        )}
      </div>
    </section>
  );
}
