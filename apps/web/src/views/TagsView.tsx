import { useState } from "react";
import type { Tag } from "@flowly/web-contracts";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";

export function TagsView({ csrf }: { csrf: string }) {
  const tags = useCollection<Tag>("tags", csrf, true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4648d4");
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    const now = new Date().toISOString();
    const created = await tags.create({
      formatVersion: 1,
      revision: 1,
      id: crypto.randomUUID(),
      name,
      normalizedName: name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase(),
      color,
      createdAt: now,
      updatedAt: now,
    });
    if (created) setName("");
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
      <div className="view-header">
        <div>
          <p className="eyebrow">Taxonomy · case-insensitive, Unicode-aware</p>
          <h1 id="tags-title">Tags</h1>
        </div>
      </div>

      <form className="card" onSubmit={submit}>
        <header>
          <h2>New tag</h2>
        </header>
        <div className="fieldset">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Color
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
          <button type="submit" className="btn primary" disabled={name.trim() === ""}>
            <Icon name="plus" size={16} />
            Add tag
          </button>
        </div>
      </form>

      {(tags.error ?? error) ? <Banner tone="error">{tags.error ?? error}</Banner> : null}

      <div className="card">
        <header>
          <h2>Your tags</h2>
          <Chip tone="neutral">{tags.items.length} total</Chip>
        </header>
        {tags.items.length > 0 ? (
          <ul className="tag-list">
            {tags.items.map((tag) => (
              <li key={tag.id}>
                <span>
                  <span className="swatch" style={{ background: tag.color ?? "#4648d4" }} />
                  <strong>{tag.name}</strong> <span className="sub mono">{tag.normalizedName}</span>
                </span>
                <button type="button" className="btn small danger" onClick={() => void remove(tag)}>
                  <Icon name="trash" size={14} />
                  Delete everywhere
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No tags yet. Add the first one above.</Empty>
        )}
      </div>
    </section>
  );
}
