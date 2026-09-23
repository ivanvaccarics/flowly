import { useEffect, useMemo, useState } from "react";
import type { Tag } from "@flowly/web-contracts";
import { Icon } from "../components/icons.js";
import { Modal } from "../components/Modal.js";
import { TagColorField } from "../components/TagColorField.js";
import { Banner, Empty, SectionIntro } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { DEFAULT_TAG_COLOR, normalizeTagName } from "../lib/tags.js";
import type { DirectoryTag } from "../api/client.js";

/** How many tags one page of the directory shows. */
const PAGE_SIZE = 8;

type Sort = "usage" | "name" | "recent";
type Scope = "all" | "used" | "unused";

const SORT_LABELS: Record<Sort, string> = {
  usage: "Most used",
  name: "Name (A–Z)",
  recent: "Newest first",
};

/**
 * The listing carries `usage`, which the server computes from the vault and
 * never stores, so a tag that is edited is written back as the plain entity.
 */
function usageOf(tag: Tag) {
  return (tag as DirectoryTag).usage;
}

function entityOf(tag: Tag, name: string, color: string): Tag {
  return {
    formatVersion: 1,
    revision: tag.revision,
    id: tag.id,
    name,
    normalizedName: normalizeTagName(name),
    color,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  };
}

export function TagsView({ csrf }: { csrf: string }) {
  const tags = useCollection<Tag>("tags", csrf, true);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_TAG_COLOR);
  /** The tag open in the edit dialog, with the values being changed there. */
  const [editor, setEditor] = useState<{ tag: Tag; name: string; color: string } | undefined>(
    undefined,
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("usage");
  const [scope, setScope] = useState<Scope>("all");
  const [letter, setLetter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | undefined>(undefined);

  const usageFor = (tag: Tag) => usageOf(tag) ?? { transactions: 0, rules: 0 };
  const usedOf = (tag: Tag) => usageFor(tag).transactions > 0;

  const directory = useMemo(() => {
    const needle = normalizeTagName(query);
    const filtered = tags.items.filter((tag) => {
      if (needle !== "" && !normalizeTagName(tag.name).includes(needle)) return false;
      if (scope === "used" && !usedOf(tag)) return false;
      if (scope === "unused" && usedOf(tag)) return false;
      if (letter && !tag.name.trim().toUpperCase().startsWith(letter)) return false;
      return true;
    });
    const sorted = [...filtered].sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name);
      if (sort === "recent") return right.createdAt.localeCompare(left.createdAt);
      const byUsage = usageFor(right).transactions - usageFor(left).transactions;
      return byUsage !== 0 ? byUsage : left.name.localeCompare(right.name);
    });
    return sorted;
  }, [tags.items, query, scope, letter, sort]);

  const letters = useMemo(() => {
    const seen = new Set<string>();
    for (const tag of tags.items) {
      const first = tag.name.trim().charAt(0).toUpperCase();
      if (first !== "") seen.add(first);
    }
    return [...seen].sort();
  }, [tags.items]);

  const pageCount = Math.max(1, Math.ceil(directory.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstRow = directory.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const visible = directory.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const lastRow = firstRow === 0 ? 0 : firstRow + visible.length - 1;

  // A narrower filter can leave the reader on a page that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [query, scope, letter, sort]);

  const unused = tags.items.filter((tag) => !usedOf(tag)).length;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    const now = new Date().toISOString();
    const created = await tags.create({
      formatVersion: 1,
      revision: 1,
      id: crypto.randomUUID(),
      name: name.trim(),
      normalizedName: normalizeTagName(name),
      color,
      createdAt: now,
      updatedAt: now,
    });
    if (created) setName("");
  }

  async function saveEdit() {
    if (!editor) return;
    const nextName = editor.name.trim();
    if (nextName === "") {
      setError("A tag needs a name.");
      return;
    }
    setError(undefined);
    const updated = await tags.update(entityOf(editor.tag, nextName, editor.color));
    if (updated) setEditor(undefined);
  }

  async function remove(tag: Tag) {
    setError(undefined);
    const confirmed = window.confirm(
      `Delete "${tag.name}"? It will be removed from every transaction and rule that uses it.`,
    );
    if (!confirmed) return;
    const removed = await tags.remove(tag.id, tag.revision, true);
    if (!removed) setError("Could not delete: the tag may have changed.");
  }

  return (
    <section className="view" aria-labelledby="tags-title">
      <SectionIntro
        icon="tags"
        eyebrow="Taxonomy"
        title="Tags that make sense."
        lead="A small, intentional vocabulary keeps your transactions useful without making them feel like admin work. Matching is case-insensitive, and the colour is used by the interface alone."
      />

      {(tags.error ?? error) ? <Banner tone="error">{tags.error ?? error}</Banner> : null}

      <div className="tag-workbench">
        <form className="card" onSubmit={submit}>
          <header>
            <div>
              <h2 className="card-title">New tag</h2>
              <span className="sub">
                Give a tag a clear name. You can always change its colour.
              </span>
            </div>
          </header>
          <div className="field">
            <label htmlFor="tag-name-new">Name</label>
            <span className="name-field">
              <span className="name-field-prefix" aria-hidden="true">
                #
              </span>
              <input
                id="tag-name-new"
                value={name}
                placeholder="e.g. Weekend trips"
                onChange={(event) => setName(event.target.value)}
                required
              />
            </span>
          </div>
          <div className="field colour-field">
            <span id="tag-colour-new">Colour</span>
            <TagColorField
              color={color}
              onChange={setColor}
              labelId="tag-colour-new"
              previewLabel={name.trim() === "" ? "Tag preview" : name.trim()}
            />
          </div>
          <div className="cell-actions">
            <button type="submit" className="btn primary" disabled={name.trim() === ""}>
              <Icon name="plus" size={16} />
              Create tag
            </button>
          </div>
        </form>

        <div className="card tag-directory">
          <header>
            <div>
              <h2 className="card-title">Tag directory</h2>
              <span className="sub">
                {directory.length} visible · {tags.items.length} total · sorted for scanning
              </span>
            </div>
            <div className="directory-tools">
              <span className="search-field">
                <Icon name="search" size={15} />
                <input
                  type="search"
                  aria-label="Search tags"
                  placeholder="Search tags"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </span>
              <select
                aria-label="Sort tags"
                value={sort}
                onChange={(event) => setSort(event.target.value as Sort)}
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <div className="directory-row">
            <div className="segmented" role="group" aria-label="Which tags">
              {(
                [
                  ["all", "All"],
                  ["used", "Used"],
                  ["unused", "Unused"],
                ] as Array<[Scope, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={scope === value ? "segment active" : "segment"}
                  aria-pressed={scope === value}
                  onClick={() => setScope(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {letters.length > 1 ? (
              <div className="jump-strip" role="group" aria-label="Jump to a letter">
                <span className="eyebrow">Jump to</span>
                {letters.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={letter === value ? "jump-letter active" : "jump-letter"}
                    aria-pressed={letter === value}
                    title={letter === value ? "Show every tag" : `Tags starting with ${value}`}
                    onClick={() => setLetter((current) => (current === value ? undefined : value))}
                  >
                    {value}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {visible.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Applied by</th>
                    <th className="cell-amount">Usage</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((tag) => {
                    const usage = usageFor(tag);
                    return (
                      <tr
                        key={tag.id}
                        title={`Edit tag ${tag.name}`}
                        onClick={(event) => {
                          // The row opens the editor; its own controls keep working.
                          if ((event.target as HTMLElement).closest("button, input, select, a")) {
                            return;
                          }
                          setEditor({ tag, name: tag.name, color: tag.color ?? DEFAULT_TAG_COLOR });
                        }}
                      >
                        <td>
                          <span className="tx">
                            <span
                              className="tag-avatar"
                              style={{ background: tag.color ?? DEFAULT_TAG_COLOR }}
                            >
                              #
                            </span>
                            <span className="stack">
                              <strong>{tag.name}</strong>
                              <span className="sub mono">{tag.normalizedName}</span>
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className="sub">
                            {usage.rules === 0
                              ? "no rule applies it"
                              : usage.rules === 1
                                ? "1 rule applies it"
                                : `${usage.rules} rules apply it`}
                          </span>
                        </td>
                        <td className="cell-amount">
                          <span
                            className={usage.transactions > 0 ? "usage-pill" : "usage-pill idle"}
                          >
                            {usage.transactions} used
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn small"
                              aria-label={`Edit tag ${tag.name}`}
                              onClick={() =>
                                setEditor({
                                  tag,
                                  name: tag.name,
                                  color: tag.color ?? DEFAULT_TAG_COLOR,
                                })
                              }
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn small danger"
                              aria-label={`Delete tag ${tag.name}`}
                              onClick={() => void remove(tag)}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              {tags.items.length === 0
                ? "No tags yet. Create the first one on the left."
                : "No tag matches this view."}
            </Empty>
          )}

          <div className="pager">
            <p className="pager-summary">
              <span className="confirm-dot" aria-hidden="true" />
              Destructive actions ask for confirmation
            </p>
            <div className="cell-actions">
              <span className="sub" role="status">
                {firstRow}–{lastRow} of {directory.length}
              </span>
              <button
                type="button"
                className="btn small"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn small"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="tag-notes">
        <div className="card">
          <h2 className="card-title">Taxonomy tip</h2>
          <p className="sub">
            Few and broad beats many and precise: a tag that covers forty movements is doing more
            work than one that covers two.
          </p>
        </div>
        <div className="card">
          <h2 className="card-title">Unused tags</h2>
          <p className="sub">
            {unused === 0
              ? "Every tag is on at least one movement."
              : `${unused} ${unused === 1 ? "tag is" : "tags are"} on no movement yet. A rule can ` +
                "put one to work, or deleting it keeps the list honest."}
          </p>
        </div>
        <div className="card">
          <h2 className="card-title">Case-insensitive</h2>
          <p className="sub">
            Typing <code>Weekend</code> and <code>weekend</code> is the same tag, and the casing you
            typed is the one the interface shows.
          </p>
        </div>
      </div>

      {editor ? (
        <Modal title={`Edit tag ${editor.tag.name}`} onClose={() => setEditor(undefined)}>
          <form
            className="stack-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEdit();
            }}
          >
            <div className="field">
              <label htmlFor="tag-name-edit">Name</label>
              <span className="name-field">
                <span className="name-field-prefix" aria-hidden="true">
                  #
                </span>
                <input
                  id="tag-name-edit"
                  autoFocus
                  value={editor.name}
                  onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                  required
                />
              </span>
            </div>
            <div className="field colour-field">
              <span id={`tag-colour-${editor.tag.id}`}>Colour</span>
              <TagColorField
                color={editor.color}
                onChange={(value) => setEditor({ ...editor, color: value })}
                labelId={`tag-colour-${editor.tag.id}`}
                previewLabel={editor.name.trim() === "" ? editor.tag.name : editor.name.trim()}
              />
            </div>
            {(tags.error ?? error) ? <Banner tone="error">{tags.error ?? error}</Banner> : null}
            <div className="cell-actions">
              <button type="button" className="btn" onClick={() => setEditor(undefined)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={editor.name.trim() === ""}>
                <Icon name="check" size={14} />
                Save tag
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
