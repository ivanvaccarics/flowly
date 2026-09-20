import { useRef, useState } from "react";
import type { Tag, TaggingRule } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Modal } from "../components/Modal.js";
import {
  RuleFields,
  conditionsOf,
  draftFromRule,
  emptyDraft,
  type RuleDraft,
} from "../components/RuleFields.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty, PageHeader } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";

export function RulesView({ csrf }: { csrf: string }) {
  const rules = useCollection<TaggingRule>("tagging-rules", csrf, true);
  const tags = useCollection<Tag>("tags", csrf, true);
  /** The create card has a draft of its own that no edit ever touches. */
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft);
  /** The rule open in the edit dialog, with the draft being changed there. */
  const [editor, setEditor] = useState<{ rule: TaggingRule; draft: RuleDraft } | undefined>(
    undefined,
  );
  const openerRef = useRef<HTMLElement | null>(null);
  const [report, setReport] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [editorError, setEditorError] = useState<string | undefined>(undefined);

  function openEditor(rule: TaggingRule, opener: HTMLElement | null) {
    // Kept so the dialog can hand focus back where the user left it.
    openerRef.current = opener;
    setEditor({ rule, draft: draftFromRule(rule) });
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
    if (draft.tagIds.length === 0) {
      setActionError("Pick at least one tag to apply.");
      return;
    }
    const now = new Date().toISOString();
    const created = await rules.create({
      formatVersion: 1,
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
    }
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setEditorError(undefined);
    if (editor.draft.tagIds.length === 0) {
      setEditorError("Pick at least one tag to apply.");
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
      updatedAt: new Date().toISOString(),
    });
    if (saved) {
      setReport(`Updated "${editor.rule.name}".`);
      closeEditor();
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
          {/* Named so the card stays a landmark of its own next to the dialog. */}
          <form className="card" aria-label="New rule" onSubmit={create}>
            <header>
              <div>
                <h2>New rule</h2>
                <span className="sub">Deterministic matching, evaluated in memory</span>
              </div>
            </header>
            <RuleFields draft={draft} tags={tags.items} onChange={setDraft} />

            <div className="cell-actions" style={{ justifyContent: "flex-start" }}>
              <button type="submit" className="btn primary">
                <Icon name="check" size={16} />
                Save rule
              </button>
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
                        onClick={(event) => openEditor(rule, event.currentTarget)}
                      >
                        <Icon name="edit" size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => {
                          // Deleting the rule the dialog is holding would leave
                          // it saving into a record that no longer exists.
                          if (editor?.rule.id === rule.id) closeEditor();
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

      {editor ? (
        <Modal title={`Edit rule ${editor.rule.name}`} onClose={closeEditor}>
          <form className="stack" onSubmit={saveEdit}>
            <p className="muted">
              Saving replaces the conditions of this rule and keeps its id, its on/off state and its
              place in the order. The card behind keeps building a new one.
            </p>
            <RuleFields
              draft={editor.draft}
              tags={tags.items}
              onChange={(next) => setEditor({ rule: editor.rule, draft: next })}
            />
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
