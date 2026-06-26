export function ScoreCard({ label, score }: { label: string; score: number }) {
  const color =
    score >= 7.5 ? "var(--color-bull)" : score >= 5 ? "var(--color-amber)" : "var(--color-bear)";
  return (
    <div className="panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-3xl font-semibold mono" style={{ color }}>
          {score.toFixed(1)}
        </span>
        <span className="text-xs text-muted-foreground mono">/10</span>
      </div>
      <div className="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${(score / 10) * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}
