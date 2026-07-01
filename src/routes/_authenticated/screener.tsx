import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { TerminalShell } from "@/components/TerminalShell";
import { screenerData } from "@/lib/screener.functions";
import { computeMetrics, computeCagrs, fmtNum, fmtPct, fmtX, type Statement } from "@/lib/ratios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Filter, ArrowUpDown, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/screener")({
  head: () => ({ meta: [{ title: "Screener — Filter Your Coverage" }] }),
  component: ScreenerPage,
});

type Op = ">=" | "<=";
type FilterKey =
  | "market_cap_crore" | "revenue" | "revenue_5y_cagr" | "pat_5y_cagr"
  | "ebitda_margin" | "net_margin" | "roe" | "roce" | "debt_equity"
  | "fcf_margin" | "interest_coverage" | "piotroski_f" | "altman_z";

const FIELDS: { key: FilterKey; label: string; fmt: (n: number | null) => string; scale?: number }[] = [
  { key: "market_cap_crore", label: "Mkt Cap (Cr)", fmt: (n) => fmtNum(n, 0) },
  { key: "revenue", label: "Revenue (Cr)", fmt: (n) => fmtNum(n, 0) },
  { key: "revenue_5y_cagr", label: "Rev 5Y CAGR", fmt: (n) => fmtPct(n), scale: 100 },
  { key: "pat_5y_cagr", label: "PAT 5Y CAGR", fmt: (n) => fmtPct(n), scale: 100 },
  { key: "ebitda_margin", label: "EBITDA M", fmt: (n) => fmtPct(n), scale: 100 },
  { key: "net_margin", label: "Net M", fmt: (n) => fmtPct(n), scale: 100 },
  { key: "roe", label: "ROE", fmt: (n) => fmtPct(n), scale: 100 },
  { key: "roce", label: "ROCE", fmt: (n) => fmtPct(n), scale: 100 },
  { key: "debt_equity", label: "D/E", fmt: (n) => fmtX(n) },
  { key: "fcf_margin", label: "FCF M", fmt: (n) => fmtPct(n), scale: 100 },
  { key: "interest_coverage", label: "Int. Cov", fmt: (n) => fmtX(n) },
  { key: "piotroski_f", label: "Piotroski F", fmt: (n) => (n == null ? "—" : n.toFixed(0)) },
  { key: "altman_z", label: "Altman Z", fmt: (n) => (n == null ? "—" : n.toFixed(2)) },
];

type Filter = { key: FilterKey; op: Op; value: number };

function ScreenerPage() {
  const fetch = useServerFn(screenerData);
  const { data, isLoading } = useQuery({ queryKey: ["screener"], queryFn: () => fetch() });
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sortKey, setSortKey] = useState<FilterKey>("market_cap_crore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.map((c) => {
      const annuals = (c.statements as Statement[]).slice().sort((a, b) => a.period_end < b.period_end ? -1 : 1);
      const m = computeMetrics(annuals);
      const cagrs = computeCagrs(annuals);
      const latest = m[m.length - 1];
      return {
        id: c.id, symbol: c.symbol, name: c.name, sector: c.sector,
        market_cap_crore: c.market_cap_crore,
        revenue: latest?.revenue ?? null,
        revenue_5y_cagr: cagrs.revenue_5y,
        pat_5y_cagr: cagrs.pat_5y,
        ebitda_margin: latest?.ebitda_margin ?? null,
        net_margin: latest?.net_margin ?? null,
        roe: latest?.roe ?? null,
        roce: latest?.roce ?? null,
        debt_equity: latest?.debt_equity ?? null,
        fcf_margin: latest?.fcf_margin ?? null,
        interest_coverage: latest?.interest_coverage ?? null,
        piotroski_f: latest?.piotroski_f ?? null,
        altman_z: latest?.altman_z ?? null,
      };
    });
  }, [data]);

  const filtered = useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || (r.sector ?? "").toLowerCase().includes(q));
    }
    for (const f of filters) {
      const field = FIELDS.find((x) => x.key === f.key);
      const scale = field?.scale ?? 1;
      out = out.filter((r) => {
        const v = r[f.key];
        if (v == null) return false;
        const cmp = v * scale;
        return f.op === ">=" ? cmp >= f.value : cmp <= f.value;
      });
    }
    out = [...out].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return out;
  }, [rows, filters, search, sortKey, sortDir]);

  const addFilter = () => setFilters([...filters, { key: "roce", op: ">=", value: 15 }]);
  const updateFilter = (i: number, patch: Partial<Filter>) => setFilters(filters.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  const removeFilter = (i: number) => setFilters(filters.filter((_, idx) => idx !== i));

  const setSort = (k: FilterKey) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  return (
    <TerminalShell>
      <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Screener</h1>
          <p className="text-xs text-muted-foreground mt-1 mono uppercase tracking-wider">
            {filtered.length} of {rows.length} companies
          </p>
        </div>

        <div className="panel p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Search symbol / name / sector…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs h-8"
            />
            <Button size="sm" variant="outline" onClick={addFilter}>
              <Filter className="size-3.5 mr-1" /> Add filter
            </Button>
            {filters.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setFilters([])}>Clear all</Button>
            )}
          </div>
          {filters.length > 0 && (
            <div className="space-y-2">
              {filters.map((f, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <select
                    value={f.key}
                    onChange={(e) => updateFilter(i, { key: e.target.value as FilterKey })}
                    className="h-8 bg-secondary/40 border border-border rounded px-2 text-xs mono"
                  >
                    {FIELDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                  <select
                    value={f.op}
                    onChange={(e) => updateFilter(i, { op: e.target.value as Op })}
                    className="h-8 bg-secondary/40 border border-border rounded px-2 text-xs mono"
                  >
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                  </select>
                  <Input
                    type="number"
                    value={f.value}
                    onChange={(e) => updateFilter(i, { value: parseFloat(e.target.value) || 0 })}
                    className="max-w-[120px] h-8 mono text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground mono">
                    {FIELDS.find((x) => x.key === f.key)?.scale === 100 ? "(as %)" : ""}
                  </span>
                  <button onClick={() => removeFilter(i)} className="text-muted-foreground hover:text-red-500">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel overflow-x-auto">
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-background">Symbol</th>
                  <th className="text-left px-3 py-2 font-medium">Sector</th>
                  {FIELDS.map((f) => (
                    <th key={f.key} className="text-right px-3 py-2 font-medium whitespace-nowrap">
                      <button
                        onClick={() => setSort(f.key)}
                        className={`inline-flex items-center gap-0.5 hover:text-foreground ${sortKey === f.key ? "text-primary" : ""}`}
                      >
                        {f.label} <ArrowUpDown className="size-3 opacity-60" />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="mono">
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
                    <td className="px-3 py-2 sticky left-0 bg-background">
                      <Link to="/company/$symbol" params={{ symbol: r.symbol }} className="text-primary hover:underline">
                        {r.symbol}
                      </Link>
                      <div className="text-[10px] text-muted-foreground font-sans normal-case max-w-[180px] truncate">{r.name}</div>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground font-sans">{r.sector ?? "—"}</td>
                    {FIELDS.map((f) => (
                      <td key={f.key} className="text-right px-3 py-2 whitespace-nowrap">{f.fmt(r[f.key])}</td>
                    ))}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={FIELDS.length + 2} className="text-center py-8 text-xs text-muted-foreground">No matches. Loosen filters or add companies.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </TerminalShell>
  );
}
