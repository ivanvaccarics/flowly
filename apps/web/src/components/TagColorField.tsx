import { Icon } from "./icons.js";
import { tagPillStyle } from "./ui.js";

/**
 * Tag colours are interface-only, so the picker is a fixed palette built from
 * the Sovereign Ledger tokens plus one free colour tile: no hex text field, and
 * the free colour comes from the browser's own picker, which can still reach any
 * `#rrggbb` value and can sample a pixel off the screen where the platform
 * allows it.
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

function isPaletteColour(color: string): boolean {
  return TAG_COLORS.some((option) => option.value === color.toLowerCase());
}

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
  const custom = HEX_PATTERN.test(color) && !isPaletteColour(color);

  return (
    <div className="colour-control">
      <div className="swatch-picker" role="radiogroup" aria-labelledby={labelId}>
        {TAG_COLORS.map((option) => {
          const selected = !custom && color.toLowerCase() === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${option.label} ${option.value}`}
              title={option.label}
              className={selected ? "swatch-choice selected" : "swatch-choice"}
              style={{ background: option.value }}
              onClick={() => onChange(option.value)}
            >
              {selected ? <Icon name="check" size={15} /> : null}
            </button>
          );
        })}
        <label
          className={custom ? "swatch-choice custom selected" : "swatch-choice custom"}
          style={{ background: custom ? color : undefined }}
          title={custom ? `Custom ${color}` : "Pick any colour"}
        >
          <input
            type="color"
            className="sr-only"
            aria-label="Custom colour"
            value={color}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
          />
          {custom ? <Icon name="check" size={15} /> : <Icon name="eyedropper" size={15} />}
        </label>
      </div>
      {previewLabel ? (
        <span className="colour-preview">
          <span className="eyebrow" style={{ margin: 0 }}>
            Preview
          </span>
          <span className="tag-pill" style={tagPillStyle(color)}>
            {previewLabel}
          </span>
        </span>
      ) : null}
    </div>
  );
}
