import { useMemo } from "react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { fmtNum, fmtPct } from "@/lib/ratios";

type Stmt = {
  id: string;
  period_end: string;
  data: { pnl?: Record<string, number> } | unknown;
};

function quarterLabel(period_end: string) {
  const d = new Date(period_end);
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const qIdx = m <= 3 ? 4 : m <= 6 ? 1 : m <= 9 ? 2 : 3;
  const fyEnd = m <= 3 ? y : y + 1;
  return { qIdx, fyEnd, label: `Q${qIdx} FY${String(fyEnd).slice(-2)}` };
}

function pnl(s: Stmt, key: string): number | undefined {
  const v = (s.data as { pnl?: Record<string, number> })?.pnl?.[key];
  return typeof v === "number" && isFinite(v) ? v : undefined;
}

function pctChange(curr?: number, prev?: number): number | undefined {
  if (curr == null || prev == null || prev === 0) return undefined;
  return (curr - prev) / Math.abs(prev);
}

export function QuarterlyAnalysis({ quarterly }: { quarterly: Stmt[] }) {
  // Sort ascending by period_end
  const sorted = useMemo(
    () => [...quarterly].sort((a, b) => (a.period_end < b.period_end ? -1 : 1)),
    [quarterly]
  );

  const rows = useMemo(() => {
    return sorted.map((s, i) => {
      const { qIdx, fyEnd, label } = quarterLabel(s.period_end);
      const rev = pnl(s, "revenue");
      const op = pnl(s, "operating_profit");
      const pat = pnl(s, "pat");
      const opm = pnl(s, "opm");
      const prevQ = i > 0 ? sorted[i - 1] : undefined;
      const yoyQ = sorted.find((x) => {
        const q = quarterLabel(x.period_end);
        return q.qIdx === qIdx && q.fyEnd === fyEnd - 1;
      });
      return {
        id: s.id,
        label,
        qIdx,
        fyEnd,
        rev,
        op,
        pat,
        opm,
        revYoY: pctChange(rev, prevQ ? undefined : undefined) ?? pctChange(rev, yoyQ ? pnl(yoyQ, "revenue") : undefined),
        patYoY: pctChange(pat, yoyQ ? pnl(yoyQ, "pat") : undefined),
        opYoY: pctChange(op, yoyQ ? pnl(yoyQ, "operating_profit") : undefined),
        revQoQ: pctChange(rev, prevQ ? pnl(prevQ, "revenue") : undefined),
        patQoQ: pctChange(pat, prevQ ? pnl(prevQ, "pat") : undefined),
      };
    });
  }, [sorted]);

  // Trailing 4-quarter
  const ttm = useMemo(() => {
    if (sorted.length < 4) return null;
    const last4 = sorted.slice(-4);
    const sum = (k: string) => last4.reduce((a, s) => a + (pnl(s, k) ?? 0), 0);
    const rev = sum("revenue");
    const op = sum("operating_profit");
    const pat = sum("pat");
    // prior 4 quarters
    let prevRev: number | undefined, prevPat: number | undefined;
    if (sorted.length >= 8) {
      const prev4 = sorted.slice(-8, -4);
      prevRev = prev4.reduce((a, s) => a + (pnl(s, "revenue") ?? 0), 0);
      prevPat = prev4.reduce((a, s) => a + (pnl(s, "pat") ?? 0), 0);
    }
    return {
      rev, op, pat,
      opm: rev > 0 ? op / rev : undefined,
      patm: rev > 0 ? pat / rev : undefined,
      revYoY: pctChange(rev, prevRev),
      patYoY: pctChange(pat, prevPat),
    };
  }, [sorted]);

  // Seasonality: avg share of annual revenue per Q-slot, using complete FYs
  const seasonality = useMemo(() => {
    const byFy: Record<number, Record<number, number>> = {};
    for (const s of sorted) {
      const { qIdx, fyEnd } = quarterLabel(s.period_end);
      const r = pnl(s, "revenue");
      if (r == null) continue;
      byFy[fyEnd] = byFy[fyEnd] || {};
      byFy[fyEnd][qIdx] = r;
    }
    const slot: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const fy of Object.keys(byFy)) {
      const qs = byFy[Number(fy)];
      if ([1, 2, 3, 4].every((q) => qs[q] != null)) {
        const total = qs[1] + qs[2] + qs[3] + qs[4];
        if (total > 0) {
          [1, 2, 3, 4].forEach((q) => slot[q].push(qs[q] / total));
        }
      }
    }
    const counts = slot[1].length;
    if (counts === 0) return null;
    return [1, 2, 3, 4].map((q) => ({
      quarter: `Q${q}`,
      share: (slot[q].reduce((a, b) => a + b, 0) / slot[q].length) * 100,
    }));
  }, [sorted]);

  const display = rows.slice(-8);
  const chartData = display.map((r) => ({
    label: r.label,
    Revenue: r.rev ?? 0,
    PAT: r.pat ?? 0,
    "Rev YoY %": r.revYoY != null ? r.revYoY * 100 : null,
    "PAT YoY %": r.patYoY != null ? r.patYoY * 100 : null,
  }));

  if (sorted.length === 0) {
    return (
      <div className="panel p-8 text-center text-sm text-muted-foreground">
        No quarterly data yet. Import a Screener.in Excel — quarters are pulled automatically.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ttm && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="TTM Revenue" value={`₹${fmtNum(ttm.rev)} Cr`} sub={ttm.revYoY != null ? `YoY ${fmtPct(ttm.revYoY)}` : undefined} subPositive={ttm.revYoY != null && ttm.revYoY >= 0} />
          <Stat label="TTM PAT" value={`₹${fmtNum(ttm.pat)} Cr`} sub={ttm.patYoY != null ? `YoY ${fmtPct(ttm.patYoY)}` : undefined} subPositive={ttm.patYoY != null && ttm.patYoY >= 0} />
          <Stat label="TTM OPM" value={fmtPct(ttm.opm)} />
          <Stat label="TTM Net Margin" value={fmtPct(ttm.patm)} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="panel">
          <div className="panel-header"><span>Revenue & PAT — Last {display.length}Q (₹ Cr)</span></div>
          <div className="p-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-grid)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Revenue" fill="var(--color-cyan)" />
                <Bar dataKey="PAT" fill="var(--color-amber)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><span>YoY Growth %</span></div>
          <div className="p-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-grid)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Rev YoY %" stroke="var(--color-cyan)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="PAT YoY %" stroke="var(--color-amber)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <div className="panel-header"><span>Quarterly Detail — Last {display.length} Quarters</span></div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Metric</th>
              {display.map((r) => (
                <th key={r.id} className="text-right px-3 py-2 font-medium mono whitespace-nowrap">{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="mono">
            <Row label="Revenue" values={display.map((r) => fmtNum(r.rev))} />
            <Row label="Rev YoY" values={display.map((r) => fmtPctSigned(r.revYoY))} colorize />
            <Row label="Rev QoQ" values={display.map((r) => fmtPctSigned(r.revQoQ))} colorize />
            <Row label="Op. Profit" values={display.map((r) => fmtNum(r.op))} />
            <Row label="OPM %" values={display.map((r) => (r.opm != null ? fmtNum(r.opm, 1) : "—"))} />
            <Row label="Op. YoY" values={display.map((r) => fmtPctSigned(r.opYoY))} colorize />
            <Row label="PAT" values={display.map((r) => fmtNum(r.pat))} />
            <Row label="PAT YoY" values={display.map((r) => fmtPctSigned(r.patYoY))} colorize />
            <Row label="PAT QoQ" values={display.map((r) => fmtPctSigned(r.patQoQ))} colorize />
          </tbody>
        </table>
      </div>

      {seasonality && (
        <div className="panel">
          <div className="panel-header"><span>Seasonality — Avg Share of Annual Revenue by Quarter</span></div>
          <div className="p-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={seasonality}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-grid)" />
                <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} unit="%" />
                <Tooltip
                  contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 12 }}
                  formatter={(v: number) => `${v.toFixed(1)}%`}
                />
                <Bar dataKey="share" fill="var(--color-cyan)" name="Share of Annual Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="px-3 pb-3 text-[11px] text-muted-foreground">
            Computed across complete fiscal years in your dataset. Helps spot a Q4-heavy or H2-heavy business.
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, subPositive }: { label: string; value: string; sub?: string; subPositive?: boolean }) {
  return (
    <div className="panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mono text-lg mt-0.5">{value}</div>
      {sub && (
        <div className={`mono text-xs mt-0.5 ${subPositive ? "text-emerald-500" : "text-red-500"}`}>{sub}</div>
      )}
    </div>
  );
}

function Row({ label, values, colorize }: { label: string; values: string[]; colorize?: boolean }) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-secondary/30">
      <td className="text-left px-3 py-1.5 text-foreground font-sans text-xs uppercase tracking-wider">{label}</td>
      {values.map((v, i) => {
        let cls = "";
        if (colorize && v !== "—") {
          if (v.startsWith("+")) cls = "text-emerald-500";
          else if (v.startsWith("-")) cls = "text-red-500";
        }
        return (
          <td key={i} className={`text-right px-3 py-1.5 ${cls}`}>{v}</td>
        );
      })}
    </tr>
  );
}

function fmtPctSigned(v?: number): string {
  if (v == null || !isFinite(v)) return "—";
  const pct = v * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
