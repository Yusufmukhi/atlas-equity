import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TerminalShell } from "@/components/TerminalShell";
import { getCompanyBySymbol } from "@/lib/companies.functions";
import { computeMetrics, computeCagrs, computeScores, fmtNum, fmtPct, fmtX, type Statement } from "@/lib/ratios";
import { ScoreCard } from "@/components/ScoreCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/company/$symbol/report")({
  head: ({ params }) => ({ meta: [{ title: `${params.symbol} — Research Report` }] }),
  component: ReportPage,
});

type Finding = { claim: string; evidence: string; source: string };
type Risk = { title: string; severity: "low" | "medium" | "high"; detail: string; source: string };

function ReportPage() {
  const { symbol } = Route.useParams();
  const getFn = useServerFn(getCompanyBySymbol);
  const { data, isLoading } = useQuery({ queryKey: ["company", symbol], queryFn: () => getFn({ data: { symbol } }) });

  if (isLoading || !data) {
    return (
      <TerminalShell>
        <div className="p-6"><Skeleton className="h-32" /></div>
      </TerminalShell>
    );
  }

  const { company, statements, agent_outputs } = data;
  const annuals = statements.filter((s) => s.period_type === "annual") as Statement[];
  const metrics = computeMetrics(annuals);
  const cagrs = computeCagrs(annuals);
  const scores = computeScores(metrics, cagrs);
  const overall =
    (scores.financial_health + scores.growth + scores.cash_flow + scores.balance_sheet) / 4;

  const agents: Record<string, typeof agent_outputs[number] | undefined> = {};
  for (const a of agent_outputs) {
    if (!agents[a.agent_type]) agents[a.agent_type] = a;
  }

  const rec =
    overall >= 7.5 ? "BUY" : overall >= 6 ? "ACCUMULATE" : overall >= 4 ? "HOLD" : "REDUCE";
  const recColor = overall >= 6 ? "text-bull" : overall >= 4 ? "text-amber" : "text-bear";

  return (
    <TerminalShell>
      <div className="max-w-5xl mx-auto px-6 py-6 print:py-2">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link to="/company/$symbol" params={{ symbol }} className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="size-3" /> Back to dashboard
          </Link>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4 mr-1" /> Print / PDF
          </Button>
        </div>

        <header className="border-b border-border pb-6 mb-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-primary mono mb-2">
            EQUITY RESEARCH REPORT
          </div>
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-semibold">{company.name}</h1>
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <span className="ticker-chip">{company.symbol}</span>
                <span className="mono">{company.exchange}</span>
                {company.sector && <span>· {company.sector}</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Rating</div>
              <div className={`text-3xl font-bold mono ${recColor}`}>{rec}</div>
              <div className="text-xs text-muted-foreground mono">Score {overall.toFixed(1)}/10</div>
            </div>
          </div>
        </header>

        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-[0.18em] text-primary mb-3">Scorecards</h2>
          <div className="grid grid-cols-4 gap-3">
            <ScoreCard label="Financial Health" score={scores.financial_health} />
            <ScoreCard label="Growth" score={scores.growth} />
            <ScoreCard label="Cash Flow" score={scores.cash_flow} />
            <ScoreCard label="Balance Sheet" score={scores.balance_sheet} />
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-[0.18em] text-primary mb-3">Key Metrics</h2>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <MetricBox label="Revenue 5Y CAGR" value={fmtPct(cagrs.revenue_5y)} />
            <MetricBox label="PAT 5Y CAGR" value={fmtPct(cagrs.pat_5y)} />
            <MetricBox label="Latest ROE" value={fmtPct(metrics.at(-1)?.roe)} />
            <MetricBox label="Latest ROCE" value={fmtPct(metrics.at(-1)?.roce)} />
            <MetricBox label="D/E" value={fmtX(metrics.at(-1)?.debt_equity)} />
            <MetricBox label="Int. Coverage" value={fmtX(metrics.at(-1)?.interest_coverage)} />
            <MetricBox label="EBITDA Margin" value={fmtPct(metrics.at(-1)?.ebitda_margin)} />
            <MetricBox label="FCF (Cr)" value={fmtNum(metrics.at(-1)?.fcf)} />
          </div>
        </section>

        {(["business", "financial", "management", "industry", "risk", "valuation"] as const).map((t) => {
          const a = agents[t];
          if (!a) return null;
          const findings = (a.findings as Finding[] | null) ?? [];
          const risks = (a.risks as Risk[] | null) ?? [];
          return (
            <section key={t} className="mb-8 break-inside-avoid">
              <h2 className="text-sm uppercase tracking-[0.18em] text-primary mb-3 flex items-center justify-between border-b border-border pb-2">
                <span>{labels[t]}</span>
                <span className="mono text-foreground/80">Score {a.score?.toFixed(1) ?? "—"}/10</span>
              </h2>
              {a.summary && <p className="text-sm text-foreground/90 leading-relaxed mb-3 whitespace-pre-line">{a.summary}</p>}
              {findings.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Findings</div>
                  <ul className="space-y-1.5">
                    {findings.map((f, i) => (
                      <li key={i} className="text-sm leading-snug">
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
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Risks</div>
                  <ul className="space-y-1.5">
                    {risks.map((r, i) => (
                      <li key={i} className="text-sm leading-snug">
                        <span className={`mono uppercase text-[10px] mr-1 ${r.severity === "high" ? "text-bear" : r.severity === "medium" ? "text-amber" : "text-muted-foreground"}`}>
                          [{r.severity}]
                        </span>
                        <span className="text-foreground">{r.title}:</span>{" "}
                        <span className="text-muted-foreground">{r.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}

        {Object.keys(agents).length === 0 && (
          <div className="panel p-6 text-center text-sm text-muted-foreground">
            No AI agent analysis yet. Run agents on the company dashboard to populate the full report.
          </div>
        )}

        <footer className="mt-12 pt-4 border-t border-border text-[10px] text-muted-foreground mono uppercase tracking-wider">
          Generated by Equity Research Terminal · {new Date().toISOString().slice(0, 10)} · All claims should be independently verified
        </footer>
      </div>
    </TerminalShell>
  );
}

const labels: Record<string, string> = {
  business: "Business Analysis",
  financial: "Financial Statement Analysis",
  management: "Management Quality",
  industry: "Industry & Competitive Position",
  risk: "Risk Assessment",
  valuation: "Valuation",
};

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mono text-lg text-primary mt-1">{value}</div>
    </div>
  );
}
