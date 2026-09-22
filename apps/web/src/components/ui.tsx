import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./icons.js";
import { formatMinorToAmount } from "../lib/money.js";

export function Chip({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: "neutral" | "income" | "expense" | "vault" | "info";
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={`chip ${tone}`}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

export function Banner({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "error" | "ok";
  children: ReactNode;
}) {
  const role = tone === "error" ? "alert" : "status";
  return (
    <p className={`banner ${tone === "neutral" ? "" : tone}`} role={role}>
      {tone === "error" ? <Icon name="alert" size={16} /> : null}
      {tone === "ok" ? <Icon name="check" size={16} /> : null}
      <span>{children}</span>
    </p>
  );
}

export function Metric({
  label,
  value,
  hint,
  delta,
  deltaTone,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: string;
  deltaTone?: "income" | "expense";
}) {
  return (
    <article className="metric">
      <span className="eyebrow">{label}</span>
      <span className="metric-value">{value}</span>
      {delta ? <Chip tone={deltaTone ?? "neutral"}>{delta}</Chip> : null}
      {hint ? <span className="muted">{hint}</span> : null}
    </article>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

/** One figure a section banner carries, either beside the title or under it. */
export function BannerFigure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "income" | "expense";
}) {
  return (
    <span className="banner-figure">
      <span className="eyebrow">{label}</span>
      <strong className={tone ?? undefined}>{value}</strong>
    </span>
  );
}

/**
 * The tinted strip a section opens with, above its own headline: an icon tile,
 * an optional eyebrow, the section's title with a badge, a description, and
 * whatever the section has to state — state chips on the right, or a row of
 * figures under the text. Every section opens this way, so the pages read as
 * one product instead of six.
 */
export function SectionBanner({
  tone = "vault",
  icon,
  eyebrow,
  title,
  badge,
  lead,
  side,
  figures,
}: {
  tone?: "vault" | "info" | "neutral";
  icon: IconName;
  eyebrow?: string;
  title: string;
  badge?: ReactNode;
  lead?: ReactNode;
  side?: ReactNode;
  figures?: ReactNode;
}) {
  return (
    <section className={`section-banner ${tone}`}>
      <div className="section-banner-top">
        <div className="section-banner-main">
          <span className={`tile ${tone}`}>
            <Icon name={icon} size={20} />
          </span>
          <div className="stack">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <div className="section-banner-title">
              <h2>{title}</h2>
              {badge}
            </div>
            {lead ? <p className="sub">{lead}</p> : null}
          </div>
        </div>
        {side ? <div className="section-banner-side">{side}</div> : null}
      </div>
      {figures ? <div className="section-banner-figures">{figures}</div> : null}
    </section>
  );
}

/**
 * The section's own headline, under the banner: an eyebrow with the section's
 * icon, a sentence worth reading, and the one action the section is for.
 */
export function SectionIntro({
  icon,
  eyebrow,
  title,
  lead,
  actions,
}: {
  icon: IconName;
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="section-intro">
      <div className="section-intro-main">
        <p className="eyebrow primary">
          <Icon name={icon} size={14} />
          {eyebrow}
        </p>
        <h2>{title}</h2>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {actions ? <div className="section-intro-actions">{actions}</div> : null}
    </div>
  );
}

/**
 * The summary block a section opens with, under the top bar's `h1`: an eyebrow
 * line, an optional card heading, a lead paragraph, right-aligned facts and
 * actions. Only the standalone bank callback still uses it: every section
 * inside the shell opens with a `SectionBanner` and a `SectionIntro`.
 */
export function PageHeader({
  eyebrow,
  title,
  titleId,
  titleLevel = 2,
  lead,
  facts,
  actions,
}: {
  eyebrow: string;
  title?: string;
  titleId?: string;
  /** 1 on the screens that render outside the shell (the bank callback). */
  titleLevel?: 1 | 2;
  lead?: ReactNode;
  facts?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="hero">
      <div className="hero-top">
        <div className="hero-title">
          <p className="eyebrow primary">{eyebrow}</p>
          {title && titleLevel === 1 ? <h1 id={titleId}>{title}</h1> : null}
          {title && titleLevel === 2 ? <h2 id={titleId}>{title}</h2> : null}
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
        <div className="hero-side">
          {facts ? <div className="hero-facts">{facts}</div> : null}
          {actions ? <div className="cell-actions">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function Money({ minor, currency }: { minor: number; currency: string }) {
  const sign = minor < 0 ? "-" : minor > 0 ? "+" : "";
  return (
    <span className={minor < 0 ? "amount negative" : minor > 0 ? "amount positive" : "amount"}>
      {sign}
      {formatMinorToAmount(Math.abs(minor), currency)} {currency}
    </span>
  );
}

/**
 * Pills wear the tag's own colour: a pastel tint of it for the surface and a
 * darker mix of the same hue for the text, so a coloured tag stays readable.
 * The `color-mix` needs a current browser; older ones fall back to the token
 * colours in `.tag-pill`.
 */
export function tagPillStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    background: `${color}1f`,
    color: `color-mix(in srgb, ${color} 72%, #0f172a)`,
  };
}

/**
 * A file field that does not look like 1996: the native control is hidden and
 * the label itself is the button, so the browser still opens the picker, the
 * keyboard still reaches it, and the chosen file is named next to it.
 */
export function FileField({
  id,
  label,
  accept,
  onFile,
  fileName,
}: {
  /** Unique DOM id for the field; the visible label points at it. */
  id: string;
  label: string;
  accept: string;
  onFile: (file: File) => void;
  fileName?: string | undefined;
}) {
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const shown = fileName ?? chosen;
  const labelId = `${id}-label`;
  return (
    <div className="file-field">
      <span className="file-label" id={labelId}>
        {label}
      </span>
      <label className="file-button">
        <input
          type="file"
          className="sr-only"
          accept={accept}
          aria-labelledby={labelId}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setChosen(file.name);
            onFile(file);
          }}
        />
        <Icon name="upload" size={14} />
        Choose file
      </label>
      <span className={shown ? "file-name chosen" : "file-name"} title={shown ?? "No file chosen"}>
        {shown ?? "No file chosen"}
      </span>
    </div>
  );
}
