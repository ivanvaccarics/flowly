import { useEffect, useId, useState } from "react";
import { Icon } from "./icons.js";
import { tagPillStyle } from "./ui.js";

/**
 * Tag colours are interface-only, so the palette is a fixed set built from the
 * Sovereign Ledger tokens instead of a native colour wheel. The hex field keeps
 * every `#rrggbb` value reachable.
 */
export const TAG_COLORS: Array<{ value: string; label: string }> = [
  { value: "#0f766e", label: "Teal" },
  { value: "#0d9488", label: "Mint" },
  { value: "#1d4ed8", label: "Blue" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#047857", label: "Emerald" },
  { value: "#b45309", label: "Amber" },
  { value: "#dc2626", label: "Red" },
  { value: "#475569", label: "Slate" },
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function TagColorField({
  color,
  onChange,
  labelId,
  previewLabel,
}: {
  color: string;
  onChange: (value: string) => void;
  /** Id of the visible label that names the swatch radiogroup. */
  labelId: string;
  /** Optional tag name, rendered as a pill in the chosen colour. */
  previewLabel?: string | undefined;
}) {
  const [draft, setDraft] = useState(color);
  const hexId = useId();

  // The picked colour can change from outside (a swatch click here, or a reset
  // after saving), so the text field follows it.
  useEffect(() => {
    setDraft(color);
  }, [color]);

  function pick(value: string) {
    setDraft(value);
    onChange(value);
  }

  function type(value: string) {
    setDraft(value);
    if (HEX_PATTERN.test(value)) onChange(value.toLowerCase());
  }

  return (
    <div className="colour-control">
      <div className="swatch-picker" role="radiogroup" aria-labelledby={labelId}>
        {TAG_COLORS.map((option) => {
          const selected = color === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${option.label} ${option.value}`}
              title={`${option.label} ${option.value}`}
              className={selected ? "swatch-choice selected" : "swatch-choice"}
              style={{ background: option.value }}
              onClick={() => pick(option.value)}
            >
              {selected ? <Icon name="check" size={15} /> : null}
            </button>
          );
        })}
      </div>
      <div className="colour-side">
        <label className="hex-field" htmlFor={hexId}>
          Custom hex
          <input
            id={hexId}
            aria-label="Custom hex colour"
            spellCheck={false}
            placeholder="#0f766e"
            value={draft}
            onChange={(event) => type(event.target.value)}
          />
        </label>
        {previewLabel ? (
          <span className="colour-preview">
            <span className="tag-pill" style={tagPillStyle(color)}>
              {previewLabel}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
