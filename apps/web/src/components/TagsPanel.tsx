import { useState } from "react";
import type { Tag } from "@flowly/web-contracts";
import { useCollection } from "../hooks/use-collection.js";
import { formatMoney } from "../lib/money.js";

export function TagsPanel({ csrf }: { csrf: string }) {
  const tags = useCollection<Tag>("tags", csrf, true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8a2be2");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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

  return (
    <section className="panel" aria-labelledby="tags-title">
      <h2 id="tags-title">Tags</h2>
      <form className="row-form" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Color
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <button type="submit" disabled={name.trim() === ""}>
          Add tag
        </button>
      </form>

      {tags.error ? (
        <p role="alert" className="error">
          {tags.error}
        </p>
      ) : null}

      <ul className="list">
        {tags.items.map((tag) => (
          <li key={tag.id}>
            <span>
              <span className="swatch" style={{ background: tag.color ?? "#8a2be2" }} /> {tag.name}
            </span>
            <span className="actions">
              <button type="button" onClick={() => void tags.remove(tag.id, tag.revision, true)}>
                Delete everywhere
              </button>
            </span>
          </li>
        ))}
      </ul>
      {tags.items.length === 0 ? <p className="muted">No tags yet.</p> : null}
      <p className="muted">
        Example formatting helper: {formatMoney(-1230, "EUR")} stays a plain number in exports.
      </p>
    </section>
  );
}
