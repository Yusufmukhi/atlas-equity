import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPeers, addPeer, removePeer } from "@/lib/peers.functions";
import { computeMetrics, computeCagrs, fmtNum, fmtPct, fmtX, type Statement } from "@/lib/ratios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, X, Users, BarChart3 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

type SelfCompany = { id: string; symbol: string; name: string };
type StmtRow = { fiscal_year: number; period_end: string; data: unknown };

function latestMetrics(stmts: StmtRow[]) {
  const annuals = (stmts as Statement[]).slice().sort((a, b) => a.period_end < b.period_end ? -1 : 1);
  if (annuals.length === 0) return null;
  const m = computeMetrics(annuals);
  const c = computeCagrs(annuals);
  return { latest: m[m.length - 1], cagrs: c };
}

export function PeersPanel({
  company,
  selfStatements,
}: {
  company: SelfCompany;
  selfStatements: StmtRow[];
}) {
  const qc = useQueryClient();
  const list = useServerFn(listPeers);
  const add = useServerFn(addPeer);
  const remove = useServerFn(removePeer);
  const [symbol, setSymbol] = useState("");

  const { data: peers, isLoading } = useQuery({
    queryKey: ["peers", company.id],
    queryFn: () => list({ data: { company_id: company.id } }),
  });

  const addMut = useMutation({
    mutationFn: (s: string) => add({ data: { company_id: company.id, peer_symbol: s } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peers", company.id] });
      setSymbol("");
      toast.success("Peer added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add peer"),
  });

  const removeMut = useMutation({
    mutationFn: (peer_id: string) => remove({ data: { peer_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["peers", company.id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const selfM = latestMetrics(selfStatements);
  const rows = [
    {
      id: company.id,
      symbol: company.symbol,
      name: company.name,
      isSelf: true,
      market_cap_crore: null as number | null,
      m: selfM,
    },
    ...(peers ?? []).map((p) => ({
      id: p.id,
      symbol: p.symbol,
      name: p.name,
      isSelf: false,
      market_cap_crore: p.market_cap_crore,
      m: latestMetrics(p.statements),
      peer_id: p.peer_id,
    })),
  ];

  const chartData = rows
    .filter((r) => r.m?.latest)
    .map((r) => ({
      name: r.symbol,
      "ROCE %": r.m!.latest.roce != null ? r.m!.latest.roce * 100 : 0,
      "ROE %": r.m!.latest.roe != null ? r.m!.latest.roe * 100 : 0,
      "EBITDA %": r.m!.latest.ebitda_margin != null ? r.m!.latest.ebitda_margin * 100 : 0,
    }));

  return (
    <div className="space-y-3">
      <div className="panel p-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Add Peer</span>
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && symbol.trim()) addMut.mutate(symbol.trim());
            }}
            placeholder="NSE symbol e.g. INFY"
            className="max-w-xs h-8 mono text-sm"
          />
          <Button
            size="sm"
            disabled={!symbol.trim() || addMut.isPending}
            onClick={() => addMut.mutate(symbol.trim())}
          >
            <Plus className="size-4 mr-1" /> Add
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Adds the symbol to your coverage if new. Import its Excel from the company page to fill ratios.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <div className="panel overflow-x-auto">
            <div className="panel-header"><span>Peer Comparison — Latest Annual</span></div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Company</th>
                  <th className="text-right px-3 py-2 font-medium">Revenue (Cr)</th>
                  <th className="text-right px-3 py-2 font-medium">Rev 5Y CAGR</th>
                  <th className="text-right px-3 py-2 font-medium">EBITDA M</th>
                  <th className="text-right px-3 py-2 font-medium">Net M</th>
                  <th className="text-right px-3 py-2 font-medium">ROE</th>
                  <th className="text-right px-3 py-2 font-medium">ROCE</th>
                  <th className="text-right px-3 py-2 font-medium">D/E</th>
                  <th className="text-right px-3 py-2 font-medium">FCF M</th>
                  <th className="text-right px-3 py-2 font-medium">Mcap (Cr)</th>
                  <th className="text-right px-3 py-2 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody className="mono">
                {rows.map((r) => {
                  const m = r.m?.latest;
                  return (
                    <tr key={r.id} className={`border-b border-border/40 last:border-0 hover:bg-secondary/30 ${r.isSelf ? "bg-secondary/40" : ""}`}>
                      <td className="px-3 py-2">
                        {r.isSelf ? (
                          <span className="text-foreground font-medium">{r.symbol}</span>
                        ) : (
                          <Link to="/company/$symbol" params={{ symbol: r.symbol }} className="text-primary hover:underline">
                            {r.symbol}
                          </Link>
                        )}
                        <div className="text-[10px] text-muted-foreground font-sans normal-case">{r.name}</div>
                      </td>
                      <td className="text-right px-3 py-2">{m ? fmtNum(m.revenue) : "—"}</td>
                      <td className="text-right px-3 py-2">{r.m ? fmtPct(r.m.cagrs.revenue_5y) : "—"}</td>
                      <td className="text-right px-3 py-2">{m ? fmtPct(m.ebitda_margin) : "—"}</td>
                      <td className="text-right px-3 py-2">{m ? fmtPct(m.net_margin) : "—"}</td>
                      <td className="text-right px-3 py-2">{m ? fmtPct(m.roe) : "—"}</td>
                      <td className="text-right px-3 py-2">{m ? fmtPct(m.roce) : "—"}</td>
                      <td className="text-right px-3 py-2">{m ? fmtX(m.debt_equity) : "—"}</td>
                      <td className="text-right px-3 py-2">{m ? fmtPct(m.fcf_margin) : "—"}</td>
                      <td className="text-right px-3 py-2">{r.market_cap_crore != null ? fmtNum(r.market_cap_crore, 0) : "—"}</td>
                      <td className="text-right px-3 py-1">
                        {!r.isSelf && "peer_id" in r && (
                          <button
                            onClick={() => removeMut.mutate((r as { peer_id: string }).peer_id)}
                            className="text-muted-foreground hover:text-red-500"
                            title="Remove peer"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 1 && (
                  <tr>
                    <td colSpan={11} className="text-center text-xs text-muted-foreground py-6">
                      No peers added yet. Add 3–5 to benchmark.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {chartData.length > 1 && (
            <div className="panel">
              <div className="panel-header"><span className="flex items-center gap-1"><BarChart3 className="size-3.5" /> Profitability Comparison</span></div>
              <div className="p-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-grid)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} unit="%" />
                    <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="ROCE %" fill="var(--color-cyan)" />
                    <Bar dataKey="ROE %" fill="var(--color-amber)" />
                    <Bar dataKey="EBITDA %" fill="var(--color-emerald, #10b981)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
