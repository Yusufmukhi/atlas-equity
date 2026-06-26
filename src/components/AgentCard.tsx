import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";

type Finding = { claim: string; evidence: string; source: string };
type Risk = { title: string; severity: "low" | "medium" | "high"; detail: string; source: string };

type Output = {
  agent_type: string;
  score: number | null;
  summary: string | null;
  findings: unknown;
  risks: unknown;
  created_at: string;
};

export function AgentCard({
  title,
  output,
  loading,
  onRun,
}: {
  title: string;
  output?: Output;
  loading: boolean;
  onRun: () => void;
}) {
  const findings = (output?.findings as Finding[] | undefined) ?? [];
  const risks = (output?.risks as Risk[] | undefined) ?? [];

  return (
    <div className="panel">
      <div className="panel-header">
        <span>{title}</span>
        {output && output.score != null && (
          <span className="mono text-primary">{output.score.toFixed(1)}/10</span>
        )}
      </div>
      <div className="p-3 space-y-3 text-sm">
        {!output ? (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground mb-3">No analysis yet</p>
            <Button size="sm" onClick={onRun} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Sparkles className="size-3.5 mr-1" />}
              Run analysis
            </Button>
          </div>
        ) : (
          <>
            <p className="text-foreground/90 leading-relaxed text-[13px]">{output.summary}</p>
            {findings.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Findings</div>
                <ul className="space-y-1.5">
                  {findings.slice(0, 4).map((f, i) => (
                    <li key={i} className="text-[12px] leading-snug">
                      <span className="text-foreground">{f.claim}</span>{" "}
                      <span className="text-muted-foreground">— {f.evidence}</span>{" "}
                      <span className="ticker-chip ml-1">{f.source}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {risks.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="size-3" /> Risks
                </div>
                <ul className="space-y-1">
                  {risks.slice(0, 3).map((r, i) => (
                    <li key={i} className="text-[12px] leading-snug">
                      <span className={`mono uppercase text-[10px] mr-1 ${
                        r.severity === "high" ? "text-bear" : r.severity === "medium" ? "text-amber" : "text-muted-foreground"
                      }`}>[{r.severity}]</span>
                      <span className="text-foreground">{r.title}:</span>{" "}
                      <span className="text-muted-foreground">{r.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <span className="text-[10px] text-muted-foreground mono">
                {new Date(output.created_at).toLocaleString()}
              </span>
              <Button size="sm" variant="ghost" onClick={onRun} disabled={loading}>
                {loading ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Sparkles className="size-3 mr-1" />}
                Re-run
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
