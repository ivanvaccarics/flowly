import { useRef, useState } from "react";
import type { Tag, TaggingRule } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty, PageHeader } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { CURRENCIES } from "../lib/money.js";
import { DEFAULT_TAG_COLOR } from "../lib/tags.js";

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
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  /** The rule the builder is editing; absent means it is building a new one. */
  const [editing, setEditing] = useState<TaggingRule | undefined>(undefined);
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

  /** Loads a rule into the builder: fixing a mistake is an edit, not a rebuild. */
  function startEdit(rule: TaggingRule) {
    setEditing(rule);
    setName(rule.name);
    setCombinator(rule.combinator);
    setConditions(rule.conditions as unknown as Condition[]);
    setTagIds([...rule.tagIds]);
    setActionError(undefined);
    setReport(undefined);
    formRef.current?.scrollIntoView?.({ block: "start" });
    nameRef.current?.focus();
  }

  function stopEditing() {
    setEditing(undefined);
    setName("");
    setCombinator("and");
    setConditions([{ ...EMPTY_CONDITION }]);
    setTagIds([]);
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
    if (editing) {
      const saved = await rules.update({
        // The id, the revision, the on/off state and the createdAt are the
        // stored rule's: editing replaces its conditions, never its identity.
        ...editing,
        name,
        combinator,
        conditions: conditions as unknown as TaggingRule["conditions"],
        tagIds: tagIds as TaggingRule["tagIds"],
        updatedAt: now,
      });
      if (saved) {
        setReport(`Updated "${editing.name}".`);
        stopEditing();
      }
      return;
    }
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
      setReport(`Created "${name}".`);
      stopEditing();
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
      <PageHeader
        eyebrow="Automation engine · local rule evaluation"
        tone="info"
        lead="Rules run when a transaction is created or imported, and they only ever add tags. Editing a transaction never re-runs them, so a tag you remove by hand stays removed."
        facts={
          <>
            <Chip tone="info">{rules.items.length} rules</Chip>
            <Chip tone="income">{rules.items.filter((rule) => rule.enabled).length} active</Chip>
          </>
        }
        actions={
          <button type="button" className="btn primary" onClick={() => void backfill()}>
            <Icon name="rules" size={16} />
            Apply to existing transactions
          </button>
        }
      />

      <div className="dash">
        <div className="dash-main">
          <form className="card" ref={formRef} onSubmit={submit}>
            <header>
              <div>
                <h2>{editing ? "Edit rule" : "New rule"}</h2>
                <span className="sub">
                  {editing
                    ? "Saving replaces the conditions of this rule and keeps its id, its state and its place in the order"
                    : "Deterministic matching, evaluated in memory"}
                </span>
              </div>
            </header>
            <div className="fieldset framed">
              <label>
                Rule name
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
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
                    onClick={() =>
                      setConditions((current) => current.filter((_, i) => i !== index))
                    }
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
                    <span
                      className="swatch"
                      style={{ background: tag.color ?? DEFAULT_TAG_COLOR }}
                    />
                    {tag.name}
                  </label>
                ))
              )}
            </fieldset>

            <div className="cell-actions" style={{ justifyContent: "flex-start" }}>
              <button type="submit" className="btn primary">
                <Icon name="check" size={16} />
                {editing ? "Save changes" : "Save rule"}
              </button>
              {editing ? (
                <button type="button" className="btn" onClick={stopEditing}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <aside className="dash-side">
          <div className="card">
            <header>
              <div>
                <h2>Active rules</h2>
                <span className="sub">Higher rules run first</span>
              </div>
              <Chip tone={rules.items.some((rule) => rule.enabled) ? "income" : "neutral"}>
                {rules.items.filter((rule) => rule.enabled).length} on
              </Chip>
            </header>
            {rules.items.length > 0 ? (
              <ul className="rule-list">
                {rules.items.map((rule) => (
                  <li key={rule.id} className="rule-tile">
                    <div className="rule-tile-head">
                      <strong>{rule.name}</strong>
                      <button
                        type="button"
                        className="switch"
                        aria-pressed={rule.enabled}
                        aria-label={`${rule.enabled ? "Pause" : "Resume"} rule ${rule.name}`}
                        onClick={() => void rules.update({ ...rule, enabled: !rule.enabled })}
                      >
                        <span className="switch-track">
                          <span className="switch-knob" />
                        </span>
                        {rule.enabled ? "On" : "Off"}
                      </button>
                    </div>
                    <code>
                      IF{" "}
                      {rule.conditions
                        .map(
                          (condition) =>
                            `${condition.field} ${condition.operator.toUpperCase()} "${condition.value}"`,
                        )
                        .join(` ${rule.combinator.toUpperCase()} `)}
                    </code>
                    <div className="hero-facts" style={{ justifyContent: "flex-start" }}>
                      {rule.tagIds.map((id) => (
                        <span key={id} className="tag-pill">
                          #{tags.items.find((tag) => tag.id === id)?.name ?? "…"}
                        </span>
                      ))}
                      <button
                        type="button"
                        className="btn small"
                        aria-label={`Edit rule ${rule.name}`}
                        onClick={() => startEdit(rule)}
                      >
                        <Icon name="edit" size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => {
                          // Deleting the rule the builder is holding would leave
                          // the form saving into a record that no longer exists.
                          if (editing?.id === rule.id) stopEditing();
                          void rules.remove(rule.id, rule.revision);
                        }}
                      >
                        <Icon name="trash" size={14} />
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No rules yet.</Empty>
            )}
          </div>
        </aside>
      </div>

      {report ? <Banner tone="ok">{report}</Banner> : null}
      {(rules.error ?? actionError) ? (
        <Banner tone="error">{rules.error ?? actionError}</Banner>
      ) : null}
    </section>
  );
}
