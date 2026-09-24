import type { Tag, TaggingRule } from "@flowly/web-contracts";
import { Icon } from "./icons.js";
import { Chip, tagPillStyle } from "./ui.js";
import { CURRENCIES, minorUnitsFor } from "../lib/money.js";
import { DEFAULT_TAG_COLOR } from "../lib/tags.js";

/** Local builder shape: the contract narrows operators per field. */
export interface Condition {
  field: "userNote" | "description" | "payee" | "amount" | "accountId";
  operator: "contains" | "is" | "greaterThan" | "lessThan" | "equals";
  /** The raw text while the rule is written; `conditionsOf` types it for the API. */
  value: string;
  currency?: string;
}

const DEFAULT_CURRENCY = "EUR";

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

/**
 * The rules this form writes: the tagging kind, with its condition set. A
 * transfer rule reads two movements at once and is built elsewhere, so the
 * builder never holds one.
 */
export type MatchRule = TaggingRule & {
  kind: "match";
  combinator: "and" | "or";
  conditions: NonNullable<TaggingRule["conditions"]>;
};

export function isMatchRule(rule: TaggingRule): rule is MatchRule {
  return rule.kind === "match" && rule.combinator !== undefined && rule.conditions !== undefined;
}

export function emptyDraft(): RuleDraft {
  return { name: "", combinator: "and", conditions: [{ ...EMPTY_CONDITION }], tagIds: [] };
}

/** A stored rule as the builder holds it; the id stays on the rule itself. */
export function draftFromRule(rule: MatchRule): RuleDraft {
  return {
    name: rule.name,
    combinator: rule.combinator,
    conditions: rule.conditions.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: String(condition.value),
      ...(condition.currency ? { currency: condition.currency } : {}),
    })) as Condition[],
    tagIds: [...rule.tagIds],
  };
}

export function conditionsOf(draft: RuleDraft): NonNullable<TaggingRule["conditions"]> {
  return draft.conditions.map((condition) =>
    condition.field === "amount"
      ? {
          field: condition.field,
          operator: condition.operator,
          value: canonicalAmount(condition.value),
          currency: condition.currency ?? DEFAULT_CURRENCY,
        }
      : { field: condition.field, operator: condition.operator, value: condition.value },
  ) as unknown as NonNullable<TaggingRule["conditions"]>;
}

/** A dot separates the decimals in the contract, whatever the person typed. */
function canonicalAmount(value: string): string {
  return value.trim().replace(",", ".");
}

/** The first problem a draft has, phrased for the banner; undefined when it can be sent. */
export function draftProblem(draft: RuleDraft): string | undefined {
  for (const [index, condition] of draft.conditions.entries()) {
    if (condition.field === "amount") {
      const amount = canonicalAmount(condition.value);
      if (!/^-?\d+(\.\d+)?$/.test(amount)) {
        return `Condition ${index + 1}: write the amount as a number, like -5.10.`;
      }
      const currency = condition.currency ?? DEFAULT_CURRENCY;
      const allowed = minorUnitsFor(currency);
      const decimals = amount.split(".")[1]?.length ?? 0;
      if (decimals > allowed) {
        return `Condition ${index + 1}: ${currency} allows at most ${allowed} decimals.`;
      }
    }
  }
  return undefined;
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

  function toggleTag(tagId: string) {
    onChange({
      ...draft,
      tagIds: draft.tagIds.includes(tagId)
        ? draft.tagIds.filter((id) => id !== tagId)
        : [...draft.tagIds, tagId],
    });
  }

  return (
    <div className="rule-fields">
      <div className="rule-fields-head">
        <label>
          Rule name
          <input
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            placeholder="Rent and utilities"
            required
          />
        </label>
        <label>
          Condition logic
          <select
            value={draft.combinator}
            onChange={(event) =>
              onChange({ ...draft, combinator: event.target.value as "and" | "or" })
            }
          >
            <option value="and">AND (all)</option>
            <option value="or">OR (any)</option>
          </select>
        </label>
      </div>

      <section className="condition-set">
        <header className="condition-set-head">
          <span className="eyebrow">Conditions</span>
          <span className="condition-hint">
            <Chip tone="info">{draft.conditions.length} active</Chip>
            Pattern matching: case-insensitive
          </span>
        </header>

        {draft.conditions.map((condition, index) => (
          <div className="condition-row" key={index}>
            <span className="condition-index" aria-hidden="true">
              {index + 1}
            </span>
            <select
              className="condition-field"
              aria-label={`Field ${index + 1}`}
              value={condition.field}
              onChange={(event) => {
                const field = event.target.value as Condition["field"];
                const operator = OPERATORS_BY_FIELD[field][0] as Condition["operator"];
                updateCondition(index, {
                  field,
                  operator,
                  value: "",
                  ...(field === "amount" ? { currency: DEFAULT_CURRENCY } : {}),
                });
              }}
            >
              {FIELDS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
            <select
              className="condition-operator"
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
              className="condition-value"
              aria-label={`Value ${index + 1}`}
              value={condition.value}
              inputMode={condition.field === "amount" ? "decimal" : undefined}
              placeholder={condition.field === "amount" ? "-5.10" : undefined}
              onChange={(event) =>
                updateCondition(index, { ...condition, value: event.target.value })
              }
            />
            {condition.field === "amount" ? (
              <select
                className="condition-currency"
                aria-label={`Currency ${index + 1}`}
                value={condition.currency ?? DEFAULT_CURRENCY}
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
            ) : null}
            {draft.conditions.length > 1 ? (
              <button
                type="button"
                className="condition-remove"
                aria-label={`Remove condition ${index + 1}`}
                onClick={() =>
                  onChange({
                    ...draft,
                    conditions: draft.conditions.filter((_, position) => position !== index),
                  })
                }
              >
                <Icon name="close" size={14} />
              </button>
            ) : (
              <span className="condition-remove placeholder" aria-hidden="true" />
            )}
          </div>
        ))}

        <button
          type="button"
          className="condition-add"
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
      </section>

      <section className="rule-tags">
        <span className="eyebrow">Tags to apply automatically</span>
        {tags.length === 0 ? (
          <span className="sub">Create tags first — rules only apply tags that exist.</span>
        ) : (
          <div className="tag-toggles">
            {tags.map((tag) => {
              const selected = draft.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={selected ? "tag-pill active" : "tag-pill"}
                  style={selected ? undefined : tagPillStyle(tag.color)}
                  aria-pressed={selected}
                  onClick={() => toggleTag(tag.id)}
                >
                  <span className="swatch" style={{ background: tag.color ?? DEFAULT_TAG_COLOR }} />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
