/** The bubble that follows a chart point under the pointer or keyboard. */
export function ChartTooltip({
  xPercent,
  topPx,
  below,
  title,
  rows,
  hint,
}: {
  xPercent: number;
  topPx?: number;
  below?: boolean;
  title: string;
  rows: Array<{ label: string; value: string; tone?: string }>;
  hint?: string | undefined;
}) {
  const left = Math.min(88, Math.max(12, xPercent));
  return (
    <div
      className={below ? "chart-tooltip is-below" : "chart-tooltip"}
      style={{ left: `${left}%`, top: topPx === undefined ? undefined : `${topPx}px` }}
      role="presentation"
    >
      <strong>{title}</strong>
      <dl>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>
              <span className={`dot ${row.tone ?? ""}`} />
              {row.label}
            </dt>
            <dd className="mono">{row.value}</dd>
          </div>
        ))}
      </dl>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
