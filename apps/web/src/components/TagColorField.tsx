import { useEffect, useState } from "react";
import { Icon } from "./icons.js";

/**
 * Tag colours are interface-only, so the palette is a fixed set built from the
 * Sovereign Ledger tokens instead of a native colour wheel. The hex field keeps
 * every `#rrggbb` value reachable.
 */
export const TAG_COLORS: Array<{ value: string; label: string }> = [
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

export function TagColorField({
  color,
  onChange,
  labelId,
}: {
  color: string;
  onChange: (value: string) => void;
  /** Id of the visible label that names the swatch radiogroup. */
  labelId: string;
}) {
  const [draft, setDraft] = useState(color);

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
              className={selected ? "swatch-choice selected" : "swatch-choice"}
              style={{ background: option.value }}
              onClick={() => pick(option.value)}
            >
              {selected ? <Icon name="check" size={13} /> : null}
            </button>
          );
        })}
      </div>
      <input
        className="hex-field"
        aria-label="Custom hex colour"
        spellCheck={false}
        placeholder="#4648d4"
        value={draft}
        onChange={(event) => type(event.target.value)}
      />
    </div>
  );
}
