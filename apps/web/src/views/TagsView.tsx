import { useState } from "react";
import type { Tag } from "@flowly/web-contracts";
import { Icon } from "../components/icons.js";
import { TagColorField } from "../components/TagColorField.js";
import { Banner, Chip, Empty, PageHeader } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { DEFAULT_TAG_COLOR, normalizeTagName } from "../lib/tags.js";

interface Draft {
  id: string;
  name: string;
  color: string;
}

export function TagsView({ csrf }: { csrf: string }) {
  const tags = useCollection<Tag>("tags", csrf, true);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_TAG_COLOR);
  const [editing, setEditing] = useState<Draft | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

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

  async function saveEdit(tag: Tag) {
    if (!editing) return;
    const nextName = editing.name.trim();
    if (nextName === "") {
      setError("A tag needs a name.");
      return;
    }
    setError(undefined);
    const updated = await tags.update({
      ...tag,
      name: nextName,
      normalizedName: normalizeTagName(nextName),
      color: editing.color,
    });
    if (updated) setEditing(undefined);
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
      <PageHeader
        eyebrow="Taxonomy · case-insensitive, Unicode-aware"
        lead="Tags bucket spending and drive the tagging rules. Renaming one keeps every transaction and rule that uses it."
        facts={<Chip tone="neutral">{tags.items.length} defined</Chip>}
      />

      <form className="card" onSubmit={submit}>
        <header>
          <div>
            <h2>New tag</h2>
            <span className="sub">The colour is only used by the interface</span>
          </div>
        </header>
        <div className="fieldset framed">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <div className="field colour-field">
            <span id="tag-colour-new">Colour</span>
            <TagColorField
              color={color}
              onChange={setColor}
              labelId="tag-colour-new"
              previewLabel={name.trim() === "" ? "Tag preview" : name.trim()}
            />
          </div>
        </div>
        <div className="cell-actions">
          <button type="submit" className="btn primary" disabled={name.trim() === ""}>
            <Icon name="plus" size={16} />
            Add tag
          </button>
        </div>
      </form>

      {(tags.error ?? error) ? <Banner tone="error">{tags.error ?? error}</Banner> : null}

      <div className="card">
        <header>
          <div>
            <h2>Your tags</h2>
            <span className="sub">Matching is case-insensitive, whatever casing you type</span>
          </div>
          <Chip tone="neutral">{tags.items.length} total</Chip>
        </header>
        {tags.items.length > 0 ? (
          <ul className="tag-list">
            {tags.items.map((tag) =>
              editing?.id === tag.id ? (
                <li key={tag.id} className="tag-row editing">
                  <label>
                    Name
                    <input
                      aria-label={`Tag name ${tag.name}`}
                      value={editing.name}
                      onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                    />
                  </label>
                  <div className="field colour-field">
                    <span id={`tag-colour-${tag.id}`}>Colour</span>
                    <TagColorField
                      color={editing.color}
                      onChange={(value) => setEditing({ ...editing, color: value })}
                      labelId={`tag-colour-${tag.id}`}
                      previewLabel={editing.name.trim() === "" ? tag.name : editing.name.trim()}
                    />
                  </div>
                  <div className="cell-actions">
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => setEditing(undefined)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn small primary"
                      onClick={() => void saveEdit(tag)}
                    >
                      <Icon name="check" size={14} />
                      Save
                    </button>
                  </div>
                </li>
              ) : (
                <li key={tag.id} className="tag-row">
                  <span>
                    <span
                      className="swatch"
                      style={{ background: tag.color ?? DEFAULT_TAG_COLOR }}
                    />
                    <strong>{tag.name}</strong>
                  </span>
                  <div className="cell-actions">
                    <button
                      type="button"
                      className="btn small"
                      onClick={() =>
                        setEditing({
                          id: tag.id,
                          name: tag.name,
                          color: tag.color ?? DEFAULT_TAG_COLOR,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => void remove(tag)}
                    >
                      <Icon name="trash" size={14} />
                      Delete everywhere
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        ) : (
          <Empty>No tags yet. Add the first one above.</Empty>
        )}
      </div>
    </section>
  );
}
