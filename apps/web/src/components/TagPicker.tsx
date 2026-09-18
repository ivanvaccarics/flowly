import { useEffect, useMemo, useRef, useState } from "react";
import type { Tag } from "@flowly/web-contracts";
import { DEFAULT_TAG_COLOR } from "../lib/tags.js";

export interface TagPickerProps {
  tags: Tag[];
  selected: string[];
  onChange: (tagIds: string[]) => void;
  /** Accessible name for the trigger, e.g. "Edit tags for Bar Centrale". */
  label: string;
  emptyHint?: string;
}

/**
 * Compact tag chooser: the trigger summarises the current selection and the
 * popup holds a searchable checklist. Built for large tag sets, unlike an
 * inline list of checkboxes that would push the row off the screen.
 */
export function TagPicker({ tags, selected, onChange, label, emptyHint }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectedTags = useMemo(
    () => tags.filter((tag) => selected.includes(tag.id)),
    [tags, selected],
  );

  const filtered = useMemo(() => {
    const needle = query.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
    if (needle === "") return tags;
    return tags.filter(
      (tag) =>
        tag.normalizedName.includes(needle) ||
        tag.name.normalize("NFKC").toLowerCase().includes(needle),
    );
  }, [tags, query]);

  function toggle(tagId: string, checked: boolean) {
    onChange(checked ? [...selected, tagId] : selected.filter((id) => id !== tagId));
  }

  const visible = selectedTags.slice(0, 2);
  const overflow = selectedTags.length - visible.length;

  return (
    <div className="picker" ref={wrapper}>
      <button
        type="button"
        className="picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
      >
        {selectedTags.length === 0 ? (
          <span className="sub">Add tags</span>
        ) : (
          <>
            {visible.map((tag) => (
              <span key={tag.id} className="tag-pill">
                <span className="swatch" style={{ background: tag.color ?? DEFAULT_TAG_COLOR }} />
                {tag.name}
              </span>
            ))}
            {overflow > 0 ? <span className="sub mono">+{overflow}</span> : null}
          </>
        )}
      </button>

      {open ? (
        <div className="picker-panel" role="dialog" aria-label={`${label} — select tags`}>
          <div className="picker-search">
            <input
              ref={search}
              value={query}
              placeholder="Search tags…"
              aria-label="Search tags"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // The picker lives inside a form: Enter must not submit it.
                if (event.key === "Enter") event.preventDefault();
              }}
            />
          </div>
          <div className="picker-list">
            {tags.length === 0 ? (
              <p className="muted" style={{ padding: "0.5rem 0.75rem" }}>
                {emptyHint ?? "No tags yet — create them in the Tags section."}
              </p>
            ) : filtered.length === 0 ? (
              <p className="muted" style={{ padding: "0.5rem 0.75rem" }}>
                No tag matches “{query}”.
              </p>
            ) : (
              filtered.map((tag) => (
                <label key={tag.id} className="picker-option">
                  <input
                    type="checkbox"
                    checked={selected.includes(tag.id)}
                    onChange={(event) => toggle(tag.id, event.target.checked)}
                  />
                  <span className="swatch" style={{ background: tag.color ?? DEFAULT_TAG_COLOR }} />
                  <span>{tag.name}</span>
                </label>
              ))
            )}
          </div>
          <footer className="picker-footer">
            <span className="sub mono">{selected.length} selected</span>
            <div className="cell-actions">
              <button
                type="button"
                className="btn small"
                disabled={selected.length === 0}
                onClick={() => onChange([])}
              >
                Clear
              </button>
              <button type="button" className="btn small primary" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
