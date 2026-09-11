import { useState } from "react";
import type { Tag, TaggingRule } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { CURRENCIES } from "../lib/money.js";

/** Local builder shape: the generated contract type narrows operators per field. */
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

export function RulesPanel({ csrf }: { csrf: string }) {
  const rules = useCollection<TaggingRule>("tagging-rules", csrf, true);
  const tags = useCollection<Tag>("tags", csrf, true);
  const [name, setName] = useState("");
  const [combinator, setCombinator] = useState<"and" | "or">("and");
  const [conditions, setConditions] = useState<Condition[]>([
    { field: "userNote", operator: "contains", value: "" },
  ]);
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
      setConditions([{ field: "userNote", operator: "contains", value: "" }]);
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
    <section className="panel" aria-labelledby="rules-title">
      <h2 id="rules-title">Tagging rules</h2>
      <p className="muted">
        Rules only add tags, and they run when a transaction is created or imported. Use backfill to
        apply them to what already exists.
      </p>

      <form className="stack-form" onSubmit={submit}>
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

        {conditions.map((condition, index) => (
          <fieldset key={index} className="condition">
            <legend>Condition {index + 1}</legend>
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
                } as Condition);
              }}
            >
              {FIELDS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
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
                } as Condition)
              }
            />
            {condition.field === "amountMinor" ? (
              <select
                aria-label={`Currency ${index + 1}`}
                value={condition.currency ?? "EUR"}
                onChange={(event) =>
                  updateCondition(index, {
                    ...condition,
                    currency: event.target.value,
                  } as Condition)
                }
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            ) : null}
            {conditions.length > 1 ? (
              <button
                type="button"
                onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            ) : null}
          </fieldset>
        ))}

        <button
          type="button"
          onClick={() =>
            setConditions((current) => [...current, { field: "payee", operator: "is", value: "" }])
          }
        >
          Add condition
        </button>

        <fieldset className="tags">
          <legend>Tags to apply</legend>
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

        <button type="submit">Save rule</button>
      </form>

      <div className="actions">
        <button type="button" onClick={() => void backfill()}>
          Apply rules to existing transactions
        </button>
      </div>
      {report ? <p role="status">{report}</p> : null}
      {(rules.error ?? actionError) ? (
        <p role="alert" className="error">
          {rules.error ?? actionError}
        </p>
      ) : null}

      <ul className="list">
        {rules.items.map((rule) => (
          <li key={rule.id}>
            <span>
              <strong>{rule.name}</strong> · {rule.combinator.toUpperCase()} ·{" "}
              {rule.conditions
                .map((condition) => `${condition.field} ${condition.operator} ${condition.value}`)
                .join(", ")}{" "}
              →{" "}
              {rule.tagIds
                .map((id) => tags.items.find((tag) => tag.id === id)?.name ?? "…")
                .join(", ")}
            </span>
            <span className="actions">
              <button
                type="button"
                onClick={() => void rules.update({ ...rule, enabled: !rule.enabled })}
              >
                {rule.enabled ? "Pause" : "Resume"}
              </button>
              <button type="button" onClick={() => void rules.remove(rule.id, rule.revision)}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      {rules.items.length === 0 ? <p className="muted">No rules yet.</p> : null}
    </section>
  );
}
