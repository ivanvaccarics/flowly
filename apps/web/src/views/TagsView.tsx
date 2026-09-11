import { useState } from "react";
import type { Tag } from "@flowly/web-contracts";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty, PageHeader } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";

/**
 * Tag colours are interface-only, so the palette is a fixed set from the
 * Sovereign Ledger tokens instead of a free colour wheel. The hex field next to
 * it keeps every `#rrggbb` value reachable.
 */
const TAG_COLORS: Array<{ value: string; label: string }> = [
  { value: "#4648d4", label: "Indigo" },
  { value: "#2f2ebe", label: "Deep indigo" },
  { value: "#006c49", label: "Emerald" },
  { value: "#0f766e", label: "Teal" },
  { value: "#b90538", label: "Rose" },
  { value: "#dc2c4f", label: "Coral" },
  { value: "#b45309", label: "Amber" },
  { value: "#475569", label: "Slate" },
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function TagsView({ csrf }: { csrf: string }) {
  const tags = useCollection<Tag>("tags", csrf, true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4648d4");
  const [hexDraft, setHexDraft] = useState("#4648d4");
  const [error, setError] = useState<string | undefined>(undefined);

  function chooseColor(value: string) {
    setColor(value);
    setHexDraft(value);
  }

  function typeHex(value: string) {
    setHexDraft(value);
    if (HEX_PATTERN.test(value)) setColor(value.toLowerCase());
  }

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
    if (created) {
      setName("");
      setError(undefined);
    }
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
        title="Tags"
        titleId="tags-title"
        lead="Tags bucket spending and drive the tagging rules. Deleting one removes it from every transaction and rule that used it."
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
          <div className="field">
            <span id="tag-colour-label">Colour</span>
            <div className="swatch-picker" role="radiogroup" aria-labelledby="tag-colour-label">
              {TAG_COLORS.map((option) => {
                const selected = color === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${option.label} ${option.value}`}
                    className={selected ? "swatch-choice selected" : "swatch-choice"}
                    style={{ background: option.value }}
                    onClick={() => chooseColor(option.value)}
                  >
                    {selected ? <Icon name="check" size={13} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <label>
            Custom hex
            <input
              value={hexDraft}
              spellCheck={false}
              placeholder="#4648d4"
              className="hex-field"
              onChange={(event) => typeHex(event.target.value)}
            />
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
          <div>
            <h2>Your tags</h2>
            <span className="sub">Matching is case-insensitive, whatever casing you type</span>
          </div>
          <Chip tone="neutral">{tags.items.length} total</Chip>
        </header>
        {tags.items.length > 0 ? (
          <ul className="tag-list">
            {tags.items.map((tag) => (
              <li key={tag.id}>
                <span>
                  <span className="swatch" style={{ background: tag.color ?? "#4648d4" }} />
                  <strong>{tag.name}</strong>
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
