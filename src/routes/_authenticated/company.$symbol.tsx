import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TerminalShell } from "@/components/TerminalShell";
import { getCompanyBySymbol, upsertCompany } from "@/lib/companies.functions";
import { runAgent } from "@/lib/agents.functions";
import { computeMetrics, computeCagrs, computeScores, fmtNum, fmtPct, fmtX, type Statement } from "@/lib/ratios";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart as LineIcon, Sparkles, FileText, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { useState } from "react";
import { ScoreCard } from "@/components/ScoreCard";
import { AgentCard } from "@/components/AgentCard";
import { DcfPanel } from "@/components/DcfPanel";

export const Route = createFileRoute("/_authenticated/company/$symbol")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.symbol} — Research` },
      { name: "description", content: `Equity research file for ${params.symbol}.` },
    ],
  }),
  component: CompanyPage,
});

type AgentType = "business" | "financial" | "management" | "industry" | "risk" | "valuation";
const AGENT_LABELS: Record<AgentType, string> = {
  business: "Business Analyst",
  financial: "Financial Analyst",
  management: "Management Analyst",
  industry: "Industry Analyst",
  risk: "Risk Analyst",
  valuation: "Valuation Analyst",
};

function CompanyPage() {
  const { symbol } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getCompanyBySymbol);
  const upsert = useServerFn(upsertCompany);
  const run = useServerFn(runAgent);

  const { data, isLoading } = useQuery({
    queryKey: ["company", symbol],
    queryFn: () => getFn({ data: { symbol } }),
  });

  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return (
      <TerminalShell>
        <div className="p-6"><Skeleton className="h-32" /></div>
      </TerminalShell>
    );
  }

  if (!data) {
    return (
      <TerminalShell>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="panel p-8 text-center">
            <h2 className="text-lg font-semibold">No coverage for {symbol}</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Add this company to your coverage universe to begin research.
            </p>
            <Button
              disabled={creating}
              onClick={async () => {
                setCreating(true);
                try {
                  await upsert({ data: { symbol, name: symbol } });
                  qc.invalidateQueries({ queryKey: ["company", symbol] });
                  toast.success("Added to coverage");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                } finally {
                  setCreating(false);
                }
              }}
            >
              {creating ? <Loader2 className="size-4 mr-1 animate-spin" /> : null} Add {symbol} to coverage
            </Button>
            <Link to="/dashboard" className="block mt-4 text-xs text-muted-foreground hover:text-primary">
              Back to dashboard
            </Link>
          </div>
        </div>
      </TerminalShell>
    );
  }

  const { company, statements, documents, agent_outputs } = data;
  const annuals = statements.filter((s) => s.period_type === "annual") as Statement[];
  const quarterly = statements
    .filter((s) => s.period_type === "quarterly")
    .sort((a, b) => (a.period_end < b.period_end ? 1 : -1))
    .slice(0, 8) // last 8 quarters
    .reverse();

  const metrics = computeMetrics(annuals);
  const cagrs = computeCagrs(annuals);
  const scores = computeScores(metrics, cagrs);

  const agentMut = useMutation({
    mutationFn: (agent_type: AgentType) => run({ data: { company_id: company.id, agent_type } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company", symbol] });
      toast.success("Analysis complete");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Agent failed"),
  });

  const latestAgents: Record<string, typeof agent_outputs[number] | undefined> = {};
  for (const a of agent_outputs) {
    if (!latestAgents[a.agent_type]) latestAgents[a.agent_type] = a;
  }

  const revChart = metrics.map((m) => ({
    year: `FY${String(m.fiscal_year).slice(-2)}`,
    revenue: m.revenue ?? 0,
    pat: m.pat ?? 0,
  }));

  const marginChart = metrics.map((m) => ({
    year: `FY${String(m.fiscal_year).slice(-2)}`,
    ebitda: m.ebitda_margin ? m.ebitda_margin * 100 : 0,
    net: m.net_margin ? m.net_margin * 100 : 0,
  }));

  return (
    <TerminalShell>
      <div className="border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="ticker-chip">{company.symbol}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mono">
                {company.exchange}
              </span>
              {company.sector && (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  · {company.sector}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-semibold">{company.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/upload", search: { company: company.symbol } })}
            >
              <FileText className="size-4 mr-1" /> Add data
            </Button>
            <Button
              size="sm"
              onClick={() => navigate({ to: "/company/$symbol/report", params: { symbol } })}
            >
              <Sparkles className="size-4 mr-1" /> Full Report
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {annuals.length === 0 ? (
          <div className="panel p-10 text-center">
            <LineIcon className="size-10 mx-auto text-muted-foreground mb-3" strokeWidth={1.5} />
            <h3 className="text-lg font-medium">No financial data yet</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Add annual P&L / Balance Sheet / Cash Flow to compute ratios and run agents.
            </p>
            <Button onClick={() => navigate({ to: "/upload", search: { company: company.symbol } })}>
              <FileText className="size-4 mr-1" /> Add financial statements
            </Button>
          </div>
        ) : (
          <>
            {/* Scorecards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ScoreCard label="Financial Health" score={scores.financial_health} />
              <ScoreCard label="Growth" score={scores.growth} />
              <ScoreCard label="Cash Flow" score={scores.cash_flow} />
              <ScoreCard label="Balance Sheet" score={scores.balance_sheet} />
            </div>

            {/* Charts */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="panel">
                <div className="panel-header"><span>Revenue & PAT (₹ Cr)</span></div>
                <div className="p-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-grid)" />
                      <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                      <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 12 }} />
                      <Bar dataKey="revenue" fill="var(--color-cyan)" name="Revenue" />
                      <Bar dataKey="pat" fill="var(--color-amber)" name="PAT" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header"><span>Margins (%)</span></div>
                <div className="p-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={marginChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-grid)" />
                      <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                      <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 12 }} />
                      <Line type="monotone" dataKey="ebitda" stroke="var(--color-cyan)" name="EBITDA" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="net" stroke="var(--color-amber)" name="Net" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <Tabs defaultValue="ratios" className="w-full">
              <TabsList className="bg-card border border-border">
                <TabsTrigger value="ratios">Ratios</TabsTrigger>
                <TabsTrigger value="agents">AI Agents</TabsTrigger>
                <TabsTrigger value="dcf">DCF</TabsTrigger>
                <TabsTrigger value="docs">Documents ({documents.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="ratios" className="mt-3">
                <div className="panel overflow-x-auto">
                  <div className="panel-header"><span>Key Ratios — Last {metrics.length} Years</span></div>
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Metric</th>
                        {metrics.map((m) => (
                          <th key={m.fiscal_year} className="text-right px-3 py-2 font-medium mono">
                            FY{String(m.fiscal_year).slice(-2)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="mono">
                      <RatioRow label="Revenue (Cr)" values={metrics.map((m) => fmtNum(m.revenue))} />
                      <RatioRow label="EBITDA Margin" values={metrics.map((m) => fmtPct(m.ebitda_margin))} />
                      <RatioRow label="Net Margin" values={metrics.map((m) => fmtPct(m.net_margin))} />
                      <RatioRow label="ROE" values={metrics.map((m) => fmtPct(m.roe))} />
                      <RatioRow label="ROCE" values={metrics.map((m) => fmtPct(m.roce))} />
                      <RatioRow label="D/E" values={metrics.map((m) => fmtX(m.debt_equity))} />
                      <RatioRow label="Int. Coverage" values={metrics.map((m) => fmtX(m.interest_coverage))} />
                      <RatioRow label="Current Ratio" values={metrics.map((m) => fmtX(m.current_ratio))} />
                      <RatioRow label="CCC (days)" values={metrics.map((m) => fmtNum(m.ccc_days, 0))} />
                      <RatioRow label="FCF (Cr)" values={metrics.map((m) => fmtNum(m.fcf))} />
                      <RatioRow label="FCF Margin" values={metrics.map((m) => fmtPct(m.fcf_margin))} />
                      <RatioRow label="Cash Conv." values={metrics.map((m) => fmtX(m.cash_conversion))} />
                      <RatioRow label="Altman Z" values={metrics.map((m) => fmtNum(m.altman_z, 2))} />
                      <RatioRow label="Piotroski F" values={metrics.map((m) => fmtNum(m.piotroski_f, 0))} />
                    </tbody>
                  </table>
                </div>
                <div className="panel mt-3 p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">CAGR</div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Revenue 5Y:</span> <span className="mono text-primary">{fmtPct(cagrs.revenue_5y)}</span></div>
                    <div><span className="text-muted-foreground">Revenue 10Y:</span> <span className="mono text-primary">{fmtPct(cagrs.revenue_10y)}</span></div>
                    <div><span className="text-muted-foreground">PAT 5Y:</span> <span className="mono text-primary">{fmtPct(cagrs.pat_5y)}</span></div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="agents" className="mt-3">
                <div className="grid md:grid-cols-2 gap-3">
                  {(Object.keys(AGENT_LABELS) as AgentType[]).map((t) => {
                    const out = latestAgents[t];
                    return (
                      <AgentCard
                        key={t}
                        title={AGENT_LABELS[t]}
                        output={out}
                        loading={agentMut.isPending && agentMut.variables === t}
                        onRun={() => agentMut.mutate(t)}
                      />
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="dcf" className="mt-3">
                <DcfPanel company={company} statements={annuals} />
              </TabsContent>

              <TabsContent value="docs" className="mt-3">
                {documents.length === 0 ? (
                  <div className="panel p-8 text-center text-sm text-muted-foreground">
                    No documents uploaded. Add annual reports, concall transcripts, or investor presentations to ground AI analysis.
                  </div>
                ) : (
                  <div className="panel">
                    <div className="panel-header"><span>Source Documents</span></div>
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                        <tr>
                          <th className="text-left px-3 py-2">Title</th>
                          <th className="text-left px-3 py-2">Kind</th>
                          <th className="text-right px-3 py-2">FY</th>
                          <th className="text-right px-3 py-2">Added</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((d) => (
                          <tr key={d.id} className="border-b border-border/60 last:border-0">
                            <td className="px-3 py-2">{d.title}</td>
                            <td className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                              {d.kind.replace("_", " ")}
                            </td>
                            <td className="px-3 py-2 text-right mono">{d.fiscal_year ?? "—"}</td>
                            <td className="px-3 py-2 text-right text-xs text-muted-foreground mono">
                              {new Date(d.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </TerminalShell>
  );
}

function RatioRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
      <td className="text-left px-3 py-1.5 text-foreground font-sans text-xs uppercase tracking-wider">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="text-right px-3 py-1.5">{v}</td>
      ))}
    </tr>
  );
}
