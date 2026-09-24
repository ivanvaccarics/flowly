import { useEffect, useRef, useState } from "react";
import type { Tag, TaggingRule } from "@flowly/web-contracts";
import { api, type TaggingRulePreview, type TaggingRuleStats } from "../api/client.js";
import { Modal } from "../components/Modal.js";
import {
  RuleFields,
  TransferRuleFields,
  conditionsOf,
  draftProblem,
  draftFromRule,
  emptyDraft,
  emptyTransferDraft,
  isMatchRule,
  isTransferPairRule,
  transferDraftFromRule,
  transferDraftProblem,
  transferRuleOf,
  type RuleDraft,
  type TransferRuleDraft,
} from "../components/RuleFields.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty, SectionIntro, tagPillStyle } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { DEFAULT_TAG_COLOR } from "../lib/tags.js";

/** The composer re-reads the newest rows shortly after typing stops. */
const PREVIEW_DEBOUNCE_MS = 300;

/** One condition as the registry reads it; amounts carry their currency. */
function describeCondition(condition: NonNullable<TaggingRule["conditions"]>[number]): string {
  const value =
    condition.field === "amount"
      ? `${condition.value} ${condition.currency ?? "EUR"}`
      : String(condition.value);
  return `${condition.field} ${condition.operator.toUpperCase()} "${value}"`;
}

/**
 * A transfer rule in one line: the two sides it pairs, and how far apart their
 * dates may sit. The rule never names an amount — one side carries N and the
 * other -N, whatever N is that day.
 */
function describeTransferRule(rule: TaggingRule): string {
  const side = (set: TaggingRule["outgoing"]) =>
    set ? set.conditions.map(describeCondition).join(` ${set.combinator.toUpperCase()} `) : "?";
  return `${side(rule.outgoing)} ⇄ ${side(rule.incoming)} (±${rule.windowDays ?? 0}d)`;
}

export function RulesView({ csrf }: { csrf: string }) {
  const rules = useCollection<TaggingRule>("tagging-rules", csrf, true);
  const tags = useCollection<Tag>("tags", csrf, true);
  /** The composer has a draft of its own that no edit ever touches. */
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  /** A second draft, for the rule kind that reads two movements at once. */
  const [transferDraft, setTransferDraft] = useState<TransferRuleDraft>(emptyTransferDraft);
  const [kind, setKind] = useState<"match" | "transfer-pair">("match");
  /** The rule open in the edit dialog, with the draft being changed there. */
  type Editor =
    | { rule: TaggingRule; kind: "match"; draft: RuleDraft }
    | { rule: TaggingRule; kind: "transfer-pair"; draft: TransferRuleDraft };
  const [editor, setEditor] = useState<Editor | undefined>(undefined);
  const openerRef = useRef<HTMLElement | null>(null);
  const [report, setReport] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [editorError, setEditorError] = useState<string | undefined>(undefined);
  const [stats, setStats] = useState<TaggingRuleStats | undefined>(undefined);
  const [preview, setPreview] = useState<TaggingRulePreview | undefined>(undefined);
  const [filter, setFilter] = useState<"all" | "active">("all");
  const [busy, setBusy] = useState(false);

  const ruleItems = rules.items;
  const tagItems = tags.items;
  const activeRules = ruleItems.filter((rule) => rule.enabled);
  const visibleRules = filter === "active" ? activeRules : ruleItems;

  // Coverage is derived from the rules and the ledger, so it is read again
  // whenever the rules change: a new, edited, paused or deleted rule moves the
  // numbers. Reading never writes to the vault.
  useEffect(() => {
    let cancelled = false;
    void api
      .ruleStats()
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch(() => {
        if (!cancelled) setStats(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [ruleItems]);

  // Live evaluation: the composer shows what the draft would match on the most
  // recent transactions, shortly after typing stops. A draft the server would
  // refuse is never sent, and a failed preview is simply left blank.
  useEffect(() => {
    // A transfer rule reads two movements at once, so the single-row preview
    // has nothing to answer for it.
    if (kind !== "match") {
      setPreview(undefined);
      return;
    }
    const ready =
      draftProblem(draft) === undefined &&
      draft.conditions.every((condition) => condition.value.trim() !== "");
    if (!ready) {
      setPreview(undefined);
      return;
    }
    const timer = window.setTimeout(() => {
      void api
        .previewRule(csrf, { combinator: draft.combinator, conditions: conditionsOf(draft) })
        .then(setPreview)
        .catch(() => setPreview(undefined));
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [csrf, draft, kind]);

  function updateDraft(next: RuleDraft) {
    setPreview(undefined);
    setDraft(next);
  }

  function openEditor(rule: TaggingRule, opener: HTMLElement | null) {
    // Kept so the dialog can hand focus back where the user left it.
    openerRef.current = opener;
    // Each kind opens in the form that can hold it: the tagging one has a
    // condition set and a tag list, the transfer one has two condition sets.
    if (isTransferPairRule(rule)) {
      setEditor({ rule, kind: "transfer-pair", draft: transferDraftFromRule(rule) });
    } else if (isMatchRule(rule)) {
      setEditor({ rule, kind: "match", draft: draftFromRule(rule) });
    } else {
      return;
    }
    setEditorError(undefined);
    rules.clearError();
    setActionError(undefined);
    setReport(undefined);
  }

  function closeEditor() {
    setEditor(undefined);
    setEditorError(undefined);
    openerRef.current?.focus?.();
    openerRef.current = null;
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setActionError(undefined);
    setReport(undefined);
    const now = new Date().toISOString();

    if (kind === "transfer-pair") {
      const problem = transferDraftProblem(transferDraft);
      if (problem) {
        setActionError(problem);
        return;
      }
      const saved = await rules.create({
        formatVersion: 3,
        kind: "transfer-pair",
        revision: 1,
        id: crypto.randomUUID(),
        name: transferDraft.name,
        enabled: true,
        tagIds: [],
        ...transferRuleOf(transferDraft),
        createdAt: now,
        updatedAt: now,
      });
      if (saved) {
        setReport(
          `Created "${transferDraft.name}". Apply it to all transactions to mark the transfers already in the vault.`,
        );
        setTransferDraft(emptyTransferDraft());
      }
      return;
    }

    if (draft.tagIds.length === 0) {
      setActionError("Pick at least one tag to apply.");
      return;
    }
    const problem = draftProblem(draft);
    if (problem) {
      setActionError(problem);
      return;
    }
    const created = await rules.create({
      formatVersion: 3,
      kind: "match",
      revision: 1,
      id: crypto.randomUUID(),
      name: draft.name,
      enabled: true,
      combinator: draft.combinator,
      conditions: conditionsOf(draft),
      tagIds: draft.tagIds,
      createdAt: now,
      updatedAt: now,
    });
    if (created) {
      setReport(`Created "${draft.name}".`);
      setDraft(emptyDraft());
      setPreview(undefined);
    }
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setEditorError(undefined);
    const now = new Date().toISOString();

    if (editor.kind === "transfer-pair") {
      const problem = transferDraftProblem(editor.draft);
      if (problem) {
        setEditorError(problem);
        return;
      }
      const { outgoing, incoming, windowDays } = transferRuleOf(editor.draft);
      const savedPair = await rules.update({
        // The id, the revision, the on/off state and the createdAt are the
        // stored rule's: editing replaces its sides, never its identity.
        ...editor.rule,
        name: editor.draft.name,
        outgoing,
        incoming,
        windowDays,
        updatedAt: now,
      });
      if (savedPair) {
        setReport(`Updated "${editor.rule.name}". Apply it to all transactions to re-pair.`);
        closeEditor();
      }
      return;
    }

    if (editor.draft.tagIds.length === 0) {
      setEditorError("Pick at least one tag to apply.");
      return;
    }
    const problem = draftProblem(editor.draft);
    if (problem) {
      setEditorError(problem);
      return;
    }
    const saved = await rules.update({
      // The id, the revision, the on/off state and the createdAt are the stored
      // rule's: editing replaces its conditions, never its identity.
      ...editor.rule,
      name: editor.draft.name,
      combinator: editor.draft.combinator,
      conditions: conditionsOf(editor.draft),
      tagIds: editor.draft.tagIds as TaggingRule["tagIds"],
      updatedAt: now,
    });
    if (saved) {
      setReport(`Updated "${editor.rule.name}".`);
      closeEditor();
    }
  }

  async function backfill() {
    setActionError(undefined);
    setBusy(true);
    try {
      const result = await api.backfill(csrf);
      setReport(`Evaluated ${result.evaluated} transactions, tagged ${result.changed}.`);
      await rules.reload();
    } catch (cause) {
      setActionError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAll() {
    const next = !(ruleItems.length > 0 && ruleItems.every((rule) => rule.enabled));
    setBusy(true);
    try {
      for (const rule of ruleItems) {
        if (rule.enabled !== next) await rules.update({ ...rule, enabled: next });
      }
    } finally {
      setBusy(false);
    }
  }

  /** The explicit button: the same read as the live preview, but it reports errors. */
  async function simulateNow() {
    setActionError(undefined);
    const problem = draftProblem(draft);
    if (problem) {
      setActionError(problem);
      return;
    }
    if (draft.conditions.every((condition) => condition.value.trim() === "")) {
      setActionError("Write at least one value to match.");
      return;
    }
    try {
      setPreview(
        await api.previewRule(csrf, {
          combinator: draft.combinator,
          conditions: conditionsOf(draft),
        }),
      );
    } catch (cause) {
      setActionError(describeError(cause));
    }
  }

  // Coverage as the overview reads it: a share of the whole ledger, and a bar
  // per tag the rules would apply, both straight from the engine's own count.
  const evaluated = stats?.evaluated ?? 0;
  const matched = stats?.matched ?? 0;
  const coverage = evaluated === 0 ? 0 : Math.round((matched / evaluated) * 100);
  const matchesByRule = new Map(
    (stats?.byRule ?? []).map((entry) => [entry.ruleId, entry.matches]),
  );
  const segments = (stats?.byTag ?? []).map((entry) => {
    const tag = tagItems.find((candidate) => candidate.id === entry.tagId);
    return {
      tagId: entry.tagId,
      transactions: entry.transactions,
      name: tag?.name ?? "…",
      color: tag?.color ?? DEFAULT_TAG_COLOR,
    };
  });
  const segmentTotal = segments.reduce((sum, segment) => sum + segment.transactions, 0) || 1;

  return (
    <section className="view" aria-labelledby="rules-title">
      <SectionIntro
        icon="rules"
        eyebrow="Deterministic heuristic engine"
        actions={
          <Chip tone={activeRules.length > 0 ? "income" : "neutral"}>
            {activeRules.length > 0 ? `${activeRules.length} active` : "Engine idle"}
          </Chip>
        }
      />

      <div className="dash">
        <div className="dash-main">
          {/* Named so the card stays a landmark of its own next to the dialog. */}
          <form className="card composer" aria-label="New rule" onSubmit={create}>
            <header>
              <div>
                <p className="eyebrow">Composer</p>
                <h2>New {kind === "match" ? "categorisation" : "transfer"} rule</h2>
                <span className="sub">
                  {kind === "match"
                    ? "Configure the matching pattern and assign the tags automatically."
                    : "Describe the two sides of a transfer between your own accounts."}
                </span>
              </div>
              {kind === "match" ? (
                <Chip tone="info">
                  <span className="pulse" />
                  Live evaluation
                </Chip>
              ) : (
                <Chip tone="vault">Pairs two movements</Chip>
              )}
            </header>

            <div className="segmented" role="group" aria-label="Rule kind">
              <button
                type="button"
                className={kind === "match" ? "segment active" : "segment"}
                aria-pressed={kind === "match"}
                onClick={() => setKind("match")}
              >
                Tags
              </button>
              <button
                type="button"
                className={kind === "transfer-pair" ? "segment active" : "segment"}
                aria-pressed={kind === "transfer-pair"}
                onClick={() => setKind("transfer-pair")}
              >
                Transfers
              </button>
            </div>

            {kind === "match" ? (
              <RuleFields draft={draft} tags={tagItems} onChange={updateDraft} />
            ) : (
              <TransferRuleFields
                draft={transferDraft}
                onChange={(next) => {
                  setActionError(undefined);
                  setTransferDraft(next);
                }}
              />
            )}

            {kind === "match" && preview ? (
              <p className="preview-line" role="status">
                <Icon name="check" size={14} />
                {preview.evaluated === 0
                  ? "No transactions to evaluate yet."
                  : `Matches ${preview.matched} of the ${preview.evaluated} most recent transactions.`}
              </p>
            ) : null}

            <div className="composer-footer">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  if (kind === "match") setDraft(emptyDraft());
                  else setTransferDraft(emptyTransferDraft());
                  setPreview(undefined);
                  setActionError(undefined);
                }}
              >
                <Icon name="refresh" size={14} />
                Reset
              </button>
              <div className="cell-actions">
                {kind === "match" ? (
                  <button type="button" className="btn" onClick={() => void simulateNow()}>
                    <Icon name="search" size={14} />
                    Simulate on 100 tx
                  </button>
                ) : null}
                <button type="submit" className="btn primary">
                  <Icon name="check" size={16} />
                  Save rule
                </button>
              </div>
            </div>
          </form>
        </div>

        <aside className="dash-side">
          <div className="card">
            <header>
              <div>
                <p className="eyebrow">Overview</p>
                <h2>Automation metrics</h2>
                <span className="sub">Engine state on this local vault</span>
              </div>
              <Chip tone={activeRules.length > 0 ? "income" : "neutral"}>
                {activeRules.length} active
              </Chip>
            </header>

            <div className="coverage">
              <span className="coverage-figure">
                <span className="eyebrow">Total matches</span>
                <strong>{stats ? matched : "—"}</strong>
              </span>
              <span className="coverage-share">
                <strong>{stats ? `${coverage}%` : "—"}</strong>
                <span className="sub">of {evaluated} transactions covered</span>
              </span>
            </div>

            {segments.length > 0 ? (
              <>
                <div
                  className="coverage-bar"
                  role="img"
                  aria-label={`Transactions covered per tag: ${segments
                    .map((segment) => `${segment.name} ${segment.transactions}`)
                    .join(", ")}`}
                >
                  {segments.map((segment) => (
                    <span
                      key={segment.tagId}
                      className="coverage-segment"
                      style={{
                        width: `${(segment.transactions / segmentTotal) * 100}%`,
                        background: segment.color,
                      }}
                    />
                  ))}
                </div>
                <ul className="coverage-legend">
                  {segments.map((segment) => (
                    <li key={segment.tagId}>
                      <span className="swatch" style={{ background: segment.color }} />#
                      {segment.name}
                      <span className="muted"> ({segment.transactions})</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <div className="coverage-cards">
              <article>
                <span className="eyebrow">Rules</span>
                <strong>{ruleItems.length}</strong>
                <span className="sub">in the local registry</span>
              </article>
              <article>
                <span className="eyebrow">Engine</span>
                <strong>{activeRules.length > 0 ? "On" : "Off"}</strong>
                <span className="sub">new movements are matched as they land</span>
              </article>
            </div>
          </div>
        </aside>
      </div>

      <div className="card">
        <header>
          <div>
            <p className="eyebrow">Registry</p>
            <h2>Local rules</h2>
            <span className="sub">
              {stats
                ? `${matched} transactions covered in this vault`
                : `${ruleItems.length} rules in this vault`}
            </span>
          </div>
          <div className="cell-actions">
            <div className="segmented" role="group" aria-label="Filter rules">
              <button
                type="button"
                className={filter === "all" ? "segment active" : "segment"}
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={filter === "active" ? "segment active" : "segment"}
                aria-pressed={filter === "active"}
                onClick={() => setFilter("active")}
              >
                Active
              </button>
            </div>
            <button
              type="button"
              className="btn small"
              disabled={busy || ruleItems.length === 0}
              onClick={() => void toggleAll()}
            >
              {ruleItems.length > 0 && ruleItems.every((rule) => rule.enabled)
                ? "Disable all"
                : "Enable all"}
            </button>
            <button
              type="button"
              className="btn small"
              disabled={busy || ruleItems.length === 0}
              onClick={() => void backfill()}
            >
              <Icon name="rules" size={14} />
              Apply to all transactions
            </button>
          </div>
        </header>

        {visibleRules.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Condition</th>
                  <th>Tags</th>
                  <th className="cell-amount">Matches</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="rule-row"
                    title={`Edit rule ${rule.name}`}
                    onClick={(event) => {
                      // The row opens the editor; its own controls keep working.
                      if ((event.target as HTMLElement).closest("button, input, select, a")) return;
                      openEditor(rule, event.currentTarget);
                    }}
                  >
                    <td>
                      <span className="tx">
                        <span className={rule.enabled ? "tx-icon income" : "tx-icon"}>
                          <Icon name="rules" size={15} />
                        </span>
                        <span className="stack">
                          <strong>{rule.name}</strong>
                          <span className="sub">{rule.enabled ? "Active" : "Paused"}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      {isMatchRule(rule) ? (
                        <code>
                          IF{" "}
                          {rule.conditions
                            .map(describeCondition)
                            .join(` ${rule.combinator.toUpperCase()} `)}
                        </code>
                      ) : (
                        <code title="A transfer between two of your own accounts">
                          TRANSFER {describeTransferRule(rule)}
                        </code>
                      )}
                    </td>
                    <td>
                      {isMatchRule(rule) ? (
                        rule.tagIds.map((id) => {
                          const tag = tagItems.find((candidate) => candidate.id === id);
                          return (
                            <span
                              key={id}
                              className="tag-pill"
                              style={tagPillStyle(tag?.color ?? DEFAULT_TAG_COLOR)}
                            >
                              #{tag?.name ?? "…"}
                            </span>
                          );
                        })
                      ) : (
                        <span className="chip neutral">transfer</span>
                      )}
                    </td>
                    <td className="cell-amount mono">
                      {matchesByRule.has(rule.id) ? matchesByRule.get(rule.id) : "—"}
                    </td>
                    <td>
                      <div className="row-actions">
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
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          aria-label={`Edit rule ${rule.name}`}
                          onClick={(event) => openEditor(rule, event.currentTarget)}
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn small danger"
                          aria-label={`Delete rule ${rule.name}`}
                          onClick={() => {
                            // Deleting the rule the dialog is holding would leave
                            // it saving into a record that no longer exists.
                            if (editor?.rule.id === rule.id) closeEditor();
                            void rules.remove(rule.id, rule.revision);
                          }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{filter === "active" ? "No active rules." : "No rules yet."}</Empty>
        )}
      </div>

      {editor ? (
        <Modal title={`Edit rule ${editor.rule.name}`} onClose={closeEditor}>
          <form className="stack" onSubmit={saveEdit}>
            <p className="muted">
              Saving replaces what this rule matches on and keeps its id, its on/off state and its
              place in the order. The composer behind keeps building a new one.
            </p>
            {editor.kind === "match" ? (
              <RuleFields
                draft={editor.draft}
                tags={tagItems}
                onChange={(next) => setEditor({ rule: editor.rule, kind: "match", draft: next })}
              />
            ) : (
              <TransferRuleFields
                draft={editor.draft}
                onChange={(next) =>
                  setEditor({ rule: editor.rule, kind: "transfer-pair", draft: next })
                }
              />
            )}
            {(editorError ?? rules.error) ? (
              <Banner tone="error">{editorError ?? rules.error}</Banner>
            ) : null}
            <div className="cell-actions" style={{ justifyContent: "flex-start" }}>
              <button type="submit" className="btn primary">
                <Icon name="check" size={16} />
                Save changes
              </button>
              <button type="button" className="btn" onClick={closeEditor}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {report ? <Banner tone="ok">{report}</Banner> : null}
      {actionError ? <Banner tone="error">{actionError}</Banner> : null}
      {/* While the dialog is open its own banner carries the failure. */}
      {!editor && rules.error ? <Banner tone="error">{rules.error}</Banner> : null}
    </section>
  );
}
