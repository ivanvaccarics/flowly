import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons.js";

export function Chip({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: "neutral" | "income" | "expense" | "vault";
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

/**
 * The page header the mockups open every screen with: an eyebrow line, the
 * title, an optional lead paragraph, right-aligned facts and actions, and an
 * optional sunken ribbon of key figures.
 */
export function PageHeader({
  eyebrow,
  title,
  titleId,
  lead,
  facts,
  actions,
  ribbon,
}: {
  eyebrow: string;
  title: string;
  titleId: string;
  lead?: ReactNode;
  facts?: ReactNode;
  actions?: ReactNode;
  ribbon?: ReactNode;
}) {
  return (
    <section className="hero">
      <div className="hero-top">
        <div className="hero-title">
          <p className="eyebrow primary">{eyebrow}</p>
          <h1 id={titleId}>{title}</h1>
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
        <div className="hero-side">
          {facts ? <div className="hero-facts">{facts}</div> : null}
          {actions ? <div className="cell-actions">{actions}</div> : null}
        </div>
      </div>
      {ribbon ? <div className="ribbon">{ribbon}</div> : null}
    </section>
  );
}

/** One figure inside a `PageHeader` ribbon. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "income" | "expense" | "primary";
}) {
  return (
    <span className="ribbon-item">
      <span className="eyebrow">{label}</span>
      <span className={tone ? `value ${tone}` : "value"}>{value}</span>
    </span>
  );
}

export function Money({ minor, currency }: { minor: number; currency: string }) {
  const sign = minor < 0 ? "-" : minor > 0 ? "+" : "";
  const amount = Math.abs(minor);
  const units = ["BHD", "KWD"].includes(currency) ? 3 : ["JPY", "KRW"].includes(currency) ? 0 : 2;
  const text =
    units === 0
      ? String(amount)
      : `${Math.trunc(amount / 10 ** units)}.${String(amount % 10 ** units).padStart(units, "0")}`;
  return (
    <span className={minor < 0 ? "amount negative" : minor > 0 ? "amount positive" : "amount"}>
      {sign}
      {text} {currency}
    </span>
  );
}
