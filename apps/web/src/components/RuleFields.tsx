import type { Tag, TaggingRule } from "@flowly/web-contracts";
import { Icon } from "./icons.js";
import { Chip, tagPillStyle } from "./ui.js";
import { CURRENCIES, minorUnitsFor } from "../lib/money.js";
import { DEFAULT_TAG_COLOR } from "../lib/tags.js";

/** Local builder shape: the contract narrows operators per field. */
export interface Condition {
  field: "userNote" | "description" | "payee" | "counterpartyIban" | "amount" | "accountId";
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
  "counterpartyIban",
  "amount",
  "accountId",
];

const OPERATORS_BY_FIELD: Record<Condition["field"], Array<Condition["operator"]>> = {
  userNote: ["contains"],
  description: ["contains"],
  payee: ["is", "contains"],
  counterpartyIban: ["is", "contains"],
  amount: ["greaterThan", "lessThan", "equals"],
  accountId: ["is"],
};

const EMPTY_CONDITION: Condition = { field: "userNote", operator: "contains", value: "" };

/**
 * The contract's own ceiling on the day window, mirrored so the form can say it
 * before the server does. The server stays the gate.
 */
const TRANSFER_WINDOW_MAX_DAYS = 30;

/** One AND/OR group of conditions: the unit both rule kinds are built from. */
export interface ConditionSetDraft {
  combinator: "and" | "or";
  conditions: Condition[];
}

/** Everything a tagging rule is made of, while it is still being written. */
export interface RuleDraft extends ConditionSetDraft {
  name: string;
  tagIds: string[];
}

/** A transfer rule while it is being written: two sides, and how far apart. */
export interface TransferRuleDraft {
  name: string;
  /** The window as typed; parsed into whole days when the form is sent. */
  windowDays: string;
  outgoing: ConditionSetDraft;
  incoming: ConditionSetDraft;
}

/**
 * The rules the tagging form writes: the tagging kind, with its condition set.
 * A transfer rule reads two movements at once and has a form of its own.
 */
export type MatchRule = TaggingRule & {
  kind: "match";
  combinator: "and" | "or";
  conditions: NonNullable<TaggingRule["conditions"]>;
};

export type TransferPairRule = TaggingRule & {
  kind: "transfer-pair";
  outgoing: NonNullable<TaggingRule["outgoing"]>;
  incoming: NonNullable<TaggingRule["incoming"]>;
  windowDays: number;
};

export function isMatchRule(rule: TaggingRule): rule is MatchRule {
  return rule.kind === "match" && rule.combinator !== undefined && rule.conditions !== undefined;
}

export function isTransferPairRule(rule: TaggingRule): rule is TransferPairRule {
  return (
    rule.kind === "transfer-pair" && rule.outgoing !== undefined && rule.incoming !== undefined
  );
}

export function emptyDraft(): RuleDraft {
  return { name: "", combinator: "and", conditions: [{ ...EMPTY_CONDITION }], tagIds: [] };
}

/** The draft a fresh two-sided form starts from: both sides ready to write. */
export function emptyTransferDraft(): TransferRuleDraft {
  const side = (): ConditionSetDraft => ({
    combinator: "and",
    conditions: [{ ...EMPTY_CONDITION }],
  });
  return { name: "", windowDays: "3", outgoing: side(), incoming: side() };
}

/** A stored condition set as the builder holds it; the id stays on the rule. */
function toDraftConditions(conditions: NonNullable<TaggingRule["conditions"]>): Condition[] {
  return conditions.map((condition) => ({
    field: condition.field,
    operator: condition.operator,
    value: String(condition.value),
    ...(condition.currency ? { currency: condition.currency } : {}),
  })) as Condition[];
}

/** A stored tagging rule as the builder holds it. */
export function draftFromRule(rule: MatchRule): RuleDraft {
  return {
    name: rule.name,
    combinator: rule.combinator,
    conditions: toDraftConditions(rule.conditions),
    tagIds: [...rule.tagIds],
  };
}

/** The stored pair rule, both sides, as the two-sided form holds it. */
export function transferDraftFromRule(rule: TransferPairRule): TransferRuleDraft {
  return {
    name: rule.name,
    windowDays: String(rule.windowDays),
    outgoing: {
      combinator: rule.outgoing.combinator,
      conditions: toDraftConditions(rule.outgoing.conditions),
    },
    incoming: {
      combinator: rule.incoming.combinator,
      conditions: toDraftConditions(rule.incoming.conditions),
    },
  };
}

/** A dot separates the decimals in the contract, whatever the person typed. */
function canonicalAmount(value: string): string {
  return value.trim().replace(",", ".");
}

/** One condition set, typed for the contract. */
export function conditionsOf(draft: {
  conditions: Condition[];
}): NonNullable<TaggingRule["conditions"]> {
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

/** One condition set, typed for the contract. */
function conditionSetOf(set: ConditionSetDraft): {
  combinator: "and" | "or";
  conditions: NonNullable<TaggingRule["conditions"]>;
} {
  return { combinator: set.combinator, conditions: conditionsOf(set) };
}

/** What the API is sent for a transfer rule: both sides, and the day window. */
export function transferRuleOf(draft: TransferRuleDraft): {
  outgoing: ReturnType<typeof conditionSetOf>;
  incoming: ReturnType<typeof conditionSetOf>;
  windowDays: number;
} {
  return {
    outgoing: conditionSetOf(draft.outgoing),
    incoming: conditionSetOf(draft.incoming),
    windowDays: Number(draft.windowDays.trim()),
  };
}

/** The first problem one condition set has; undefined when it can be sent. */
function conditionProblem(conditions: readonly Condition[]): string | undefined {
  for (const [index, condition] of conditions.entries()) {
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

/** The first problem a tagging draft has, phrased for the banner. */
export function draftProblem(draft: RuleDraft): string | undefined {
  return conditionProblem(draft.conditions);
}

/**
 * The first problem a transfer draft has.
 *
 * Both sides match a movement of their own and an empty side is not a rule but a
 * form nobody finished, so each one has to say something. The day window has to
 * be a whole number of days the contract accepts.
 */
export function transferDraftProblem(draft: TransferRuleDraft): string | undefined {
  if (draft.name.trim() === "") return "Give the rule a name.";
  const window = Number(draft.windowDays.trim());
  if (!Number.isSafeInteger(window) || window < 0 || window > TRANSFER_WINDOW_MAX_DAYS) {
    return `The day window is a whole number of days from 0 to ${TRANSFER_WINDOW_MAX_DAYS}.`;
  }
  for (const [side, set] of [
    ["leaving the account", draft.outgoing],
    ["arriving on the other account", draft.incoming],
  ] as const) {
    if (set.conditions.every((condition) => condition.value.trim() === "")) {
      return `Write at least one value for the side ${side}.`;
    }
    const problem = conditionProblem(set.conditions);
    if (problem) return `Side ${side}: ${problem}`;
  }
  return undefined;
}

/** The name both forms ask for, so they read the same way. */
function NameField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (name: string) => void;
}) {
  return (
    <label>
      Rule name
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  );
}

/**
 * One AND/OR group of conditions.
 *
 * A tagging rule has one set and a transfer rule has two, one per side, so the
 * controls carry the side's name in their label: both sets are on the page at
 * once and a screen reader hears which side it is writing.
 */
function ConditionSetFields({
  label,
  hint,
  labelPrefix = "",
  set,
  onChange,
}: {
  label: string;
  hint?: string;
  labelPrefix?: string;
  set: ConditionSetDraft;
  onChange: (next: ConditionSetDraft) => void;
}) {
  const described = (base: string) => `${labelPrefix}${base}`;

  function updateCondition(index: number, next: Condition) {
    onChange({
      ...set,
      conditions: set.conditions.map((condition, position) =>
        position === index ? next : condition,
      ),
    });
  }

  return (
    <section className="condition-set">
      <header className="condition-set-head">
        <span className="eyebrow">{label}</span>
        <span className="condition-hint">
          <label>
            Logic
            <select
              aria-label={described("Condition logic")}
              value={set.combinator}
              onChange={(event) =>
                onChange({ ...set, combinator: event.target.value as "and" | "or" })
              }
            >
              <option value="and">AND (all)</option>
              <option value="or">OR (any)</option>
            </select>
          </label>
          <Chip tone="info">{set.conditions.length} active</Chip>
          {hint ?? "Pattern matching: case-insensitive"}
        </span>
      </header>

      {set.conditions.map((condition, index) => (
        <div className="condition-row" key={index}>
          <span className="condition-index" aria-hidden="true">
            {index + 1}
          </span>
          <select
            className="condition-field"
            aria-label={described(`Field ${index + 1}`)}
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
            aria-label={described(`Operator ${index + 1}`)}
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
            aria-label={described(`Value ${index + 1}`)}
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
              aria-label={described(`Currency ${index + 1}`)}
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
          {set.conditions.length > 1 ? (
            <button
              type="button"
              className="condition-remove"
              aria-label={described(`Remove condition ${index + 1}`)}
              onClick={() =>
                onChange({
                  ...set,
                  conditions: set.conditions.filter((_, position) => position !== index),
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
            ...set,
            conditions: [...set.conditions, { ...EMPTY_CONDITION, field: "payee", operator: "is" }],
          })
        }
      >
        <Icon name="plus" size={14} />
        Add condition
      </button>
    </section>
  );
}

/**
 * The tagging form: one condition set and the tags it applies. The create card
 * and the edit dialog are the same form, so a change to one is a change to both.
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
        <NameField
          value={draft.name}
          placeholder="Rent and utilities"
          onChange={(name) => onChange({ ...draft, name })}
        />
      </div>

      <ConditionSetFields
        label="Conditions"
        set={draft}
        onChange={(next) => onChange({ ...draft, ...next })}
      />

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

/**
 * The two-sided form: what leaves one account, what arrives on another, and the
 * window between the two bookings. The amounts are never written here — the rule
 * is that one side has N and the other -N, whatever N is that day.
 */
export function TransferRuleFields({
  draft,
  onChange,
}: {
  draft: TransferRuleDraft;
  onChange: (next: TransferRuleDraft) => void;
}) {
  return (
    <div className="rule-fields">
      <div className="rule-fields-head">
        <NameField
          value={draft.name}
          placeholder="Monthly savings transfer"
          onChange={(name) => onChange({ ...draft, name })}
        />
        <label>
          Days apart
          <input
            type="number"
            min={0}
            max={TRANSFER_WINDOW_MAX_DAYS}
            value={draft.windowDays}
            onChange={(event) => onChange({ ...draft, windowDays: event.target.value })}
            required
          />
        </label>
      </div>

      <p className="sub">
        Two movements are one transfer when one matches the side that leaves the account, the other
        matches the side that arrives, and the amounts are equal and opposite on two different
        accounts.
      </p>

      <ConditionSetFields
        label="Leaves the account"
        labelPrefix="Outgoing "
        hint="The side that is debited"
        set={draft.outgoing}
        onChange={(outgoing) => onChange({ ...draft, outgoing })}
      />
      <ConditionSetFields
        label="Arrives on another account"
        labelPrefix="Incoming "
        hint="The side that is credited"
        set={draft.incoming}
        onChange={(incoming) => onChange({ ...draft, incoming })}
      />
    </div>
  );
}
