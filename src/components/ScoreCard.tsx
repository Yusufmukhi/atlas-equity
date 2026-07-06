import { Info } from "lucide-react";

export function ScoreCard({
  label,
  score,
  hint,
  tooltip,
}: {
  label: string;
  score: number;
  hint?: string;      // small line under the score (e.g. "48.2% blended CAGR")
  tooltip?: string;   // methodology note surfaced on hover of the info icon
}) {
  const color =
    score >= 7.5 ? "var(--color-bull)" : score >= 5 ? "var(--color-amber)" : "var(--color-bear)";
  return (
    <div className="panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <span>{label}</span>
        {tooltip && (
          <span title={tooltip} className="cursor-help text-muted-foreground/70">
            <Info className="size-3" />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-3xl font-semibold mono" style={{ color }}>
          {score.toFixed(1)}
        </span>
        <span className="text-xs text-muted-foreground mono">/10</span>
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mono mt-0.5">{hint}</div>}
      <div className="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${(score / 10) * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}
