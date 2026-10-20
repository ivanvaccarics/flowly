import type { ReactNode } from "react";
import { DEFAULT_TAG_COLOR } from "../lib/tags.js";
import { tagPillStyle } from "./ui.js";

/** A tag label or toggle with the same colour and fallback across the app. */
export function TagPill({
  children,
  color,
  active = false,
  onClick,
  swatch = false,
  prefix = "",
  title,
}: {
  children: ReactNode;
  color?: string | null | undefined;
  active?: boolean;
  onClick?: () => void;
  swatch?: boolean;
  prefix?: string;
  title?: string;
}) {
  const className = active ? "tag-pill active" : "tag-pill";
  const contents = (
    <>
      {swatch ? (
        <span className="swatch" style={{ background: color ?? DEFAULT_TAG_COLOR }} />
      ) : null}
      {prefix}
      {children}
    </>
  );
  const style = active ? undefined : tagPillStyle(color);

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        aria-pressed={active}
        title={title}
        onClick={onClick}
      >
        {contents}
      </button>
    );
  }
  return (
    <span className={className} style={style} title={title}>
      {contents}
    </span>
  );
}
