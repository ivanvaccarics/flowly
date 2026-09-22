import type { Tag, TaggingRule } from "@flowly/web-contracts";
import { Icon } from "./icons.js";
import { CURRENCIES, minorUnitsFor } from "../lib/money.js";
import { DEFAULT_TAG_COLOR } from "../lib/tags.js";

/** Local builder shape: the contract narrows operators per field. */
export interface Condition {
  field: "userNote" | "description" | "payee" | "amount" | "amountMinor" | "accountId";
  operator: "contains" | "is" | "greaterThan" | "lessThan" | "equals";
  value: string | number;
  currency?: string;
}

const FIELDS: Array<Condition["field"]> = [
  "userNote",
  "description",
  "payee",
  "amount",
  "accountId",
];

const OPERATORS_BY_FIELD: Record<Condition["field"], Array<Condition["operator"]>> = {
  userNote: ["contains"],
  description: ["contains"],
  payee: ["is", "contains"],
  amount: ["greaterThan", "lessThan", "equals"],
  amountMinor: ["greaterThan", "lessThan", "equals"],
  accountId: ["is"],
};

const EMPTY_CONDITION: Condition = { field: "userNote", operator: "contains", value: "" };

/** Everything a rule is made of, while it is still being written. */
export interface RuleDraft {
  name: string;
  combinator: "and" | "or";
  conditions: Condition[];
  tagIds: string[];
}

export function emptyDraft(): RuleDraft {
  return { name: "", combinator: "and", conditions: [{ ...EMPTY_CONDITION }], tagIds: [] };
}

/** A stored rule as the builder holds it; the id stays on the rule itself. */
export function draftFromRule(rule: TaggingRule): RuleDraft {
  const conditions = rule.conditions.map((condition) => {
    if (condition.field !== "amountMinor") return condition;
    const currency = condition.currency ?? "EUR";
    return {
      ...condition,
      field: "amount" as const,
      value: Number(condition.value) / 10 ** minorUnitsFor(currency),
      currency,
    };
  });
  return {
    name: rule.name,
    combinator: rule.combinator,
    conditions: conditions as unknown as Condition[],
    tagIds: [...rule.tagIds],
  };
}

export function conditionsOf(draft: RuleDraft): TaggingRule["conditions"] {
  return draft.conditions.map((condition) =>
    condition.field === "amount"
      ? { ...condition, value: Number(condition.value), currency: condition.currency ?? "EUR" }
      : condition,
  ) as unknown as TaggingRule["conditions"];
}

/**
 * The condition builder and the tag picker, with no submit of their own: the
 * create card and the edit dialog are the same form, so a change to one is a
 * change to both.
 */
export function RuleFields({
  draft,
  tags,
  onChange,
}: {
  draft: RuleDraft;
  tags: Tag[];
  onChange: (next: RuleDraft) => void;
}) {
  function updateCondition(index: number, next: Condition) {
    onChange({
      ...draft,
      conditions: draft.conditions.map((condition, position) =>
        position === index ? next : condition,
      ),
    });
  }

  return (
    <>
      <div className="fieldset framed">
        <label>
          Rule name
          <input
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            required
          />
        </label>
        <label>
          Match
          <select
            value={draft.combinator}
            onChange={(event) =>
              onChange({ ...draft, combinator: event.target.value as "and" | "or" })
            }
          >
            <option value="and">all conditions (AND)</option>
            <option value="or">any condition (OR)</option>
          </select>
        </label>
      </div>

      {draft.conditions.map((condition, index) => (
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
                  value: field === "amount" ? 0 : "",
                  ...(field === "amount" ? { currency: "EUR" } : {}),
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
                  value: event.target.value,
                })
              }
            />
          </label>
          {condition.field === "amount" ? (
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
          {draft.conditions.length > 1 ? (
            <button
              type="button"
              className="btn small danger"
              onClick={() =>
                onChange({
                  ...draft,
                  conditions: draft.conditions.filter((_, position) => position !== index),
                })
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
            onChange({
              ...draft,
              conditions: [
                ...draft.conditions,
                { ...EMPTY_CONDITION, field: "payee", operator: "is" },
              ],
            })
          }
        >
          <Icon name="plus" size={14} />
          Add condition
        </button>
      </div>

      <fieldset className="fieldset">
        <legend>Tags to apply</legend>
        {tags.length === 0 ? (
          <span className="sub">Create tags first.</span>
        ) : (
          tags.map((tag) => (
            <label key={tag.id} className="checkline">
              <input
                type="checkbox"
                checked={draft.tagIds.includes(tag.id)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    tagIds: event.target.checked
                      ? [...draft.tagIds, tag.id]
                      : draft.tagIds.filter((id) => id !== tag.id),
                  })
                }
              />
              <span className="swatch" style={{ background: tag.color ?? DEFAULT_TAG_COLOR }} />
              {tag.name}
            </label>
          ))
        )}
      </fieldset>
    </>
  );
}
