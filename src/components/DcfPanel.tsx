import { useMemo, useState } from "react";
import { runDcf, defaultAssumptions, sensitivityGrid, type DcfAssumptions } from "@/lib/dcf";
import { fmtNum, type Statement } from "@/lib/ratios";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Company = { id: string; shares_outstanding: number | null; current_price: number | null };

export function DcfPanel({ company, statements }: { company: Company; statements: Statement[] }) {
  const sorted = [...statements].sort((a, b) => a.fiscal_year - b.fiscal_year);
  const last = sorted[sorted.length - 1];
  const baseRev = last?.data?.pnl?.revenue ?? 1000;
  const netDebt =
    last?.data?.bs?.total_debt != null && last?.data?.bs?.cash != null
      ? last.data.bs.total_debt - last.data.bs.cash
      : 0;
  const sharesOut = company.shares_outstanding ?? 100;

  const [a, setA] = useState<DcfAssumptions>(() => defaultAssumptions(baseRev, sharesOut, netDebt));

  const result = useMemo(() => runDcf(a), [a]);
  const sens = useMemo(
    () =>
      sensitivityGrid(
        a,
        [a.wacc - 0.02, a.wacc - 0.01, a.wacc, a.wacc + 0.01, a.wacc + 0.02],
        [a.terminal_growth - 0.02, a.terminal_growth - 0.01, a.terminal_growth, a.terminal_growth + 0.01, a.terminal_growth + 0.02],
      ),
    [a],
  );

  const upd = (patch: Partial<DcfAssumptions>) => setA((p) => ({ ...p, ...patch }));

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-4">
      <div className="space-y-4">
        <div className="panel">
          <div className="panel-header">
            <span>5-Year FCF Forecast (₹ Cr)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm mono">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Year</th>
                  {result.years.map((y) => (
                    <th key={y.year} className="text-right px-3 py-2">+{y.year}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <DcfRow label="Revenue" values={result.years.map((y) => fmtNum(y.revenue))} />
                <DcfRow label="EBITDA" values={result.years.map((y) => fmtNum(y.ebitda))} />
                <DcfRow label="EBIT" values={result.years.map((y) => fmtNum(y.ebit))} />
                <DcfRow label="NOPAT" values={result.years.map((y) => fmtNum(y.nopat))} />
                <DcfRow label="(-) Capex" values={result.years.map((y) => fmtNum(y.capex))} />
                <DcfRow label="(-) Δ WC" values={result.years.map((y) => fmtNum(y.delta_wc))} />
                <DcfRow label="FCF" values={result.years.map((y) => fmtNum(y.fcf))} accent />
                <DcfRow label="PV(FCF)" values={result.years.map((y) => fmtNum(y.pv_fcf))} />
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <span>Sensitivity — Intrinsic Value per Share</span>
          </div>
          <div className="overflow-x-auto p-3">
            <table className="w-full text-xs mono text-center">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-muted-foreground">WACC ↓ / g →</th>
                  {[-0.02, -0.01, 0, 0.01, 0.02].map((g) => (
                    <th key={g} className="px-2 py-1 text-muted-foreground">
                      {((a.terminal_growth + g) * 100).toFixed(1)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sens.map((row, i) => {
                  const w = a.wacc + (i - 2) * 0.01;
                  return (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-2 py-1 text-muted-foreground">{(w * 100).toFixed(1)}%</td>
                      {row.map((v, j) => {
                        const isBase = i === 2 && j === 2;
                        return (
                          <td
                            key={j}
                            className={`px-2 py-1 ${isBase ? "bg-primary/15 text-primary font-semibold" : ""}`}
                          >
                            ₹{fmtNum(v, 0)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel p-4 space-y-4 h-fit">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Intrinsic Value</div>
          <div className="text-3xl font-semibold mono text-primary">
            ₹{fmtNum(result.intrinsic_value_per_share, 0)}
          </div>
          {company.current_price && (
            <div className="text-xs text-muted-foreground mt-1 mono">
              CMP ₹{company.current_price} · Upside{" "}
              <span className={result.intrinsic_value_per_share > company.current_price ? "text-bull" : "text-bear"}>
                {(((result.intrinsic_value_per_share - company.current_price) / company.current_price) * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Stat label="EV" value={`₹${fmtNum(result.enterprise_value)}`} />
          <Stat label="Equity Value" value={`₹${fmtNum(result.equity_value)}`} />
          <Stat label="PV(Terminal)" value={`₹${fmtNum(result.pv_terminal)}`} />
          <Stat label="Terminal Val" value={`₹${fmtNum(result.terminal_value)}`} />
        </div>
        <div className="space-y-3 pt-2 border-t border-border">
          <Field label="WACC %" value={a.wacc * 100} onChange={(v) => upd({ wacc: v / 100 })} step={0.5} />
          <Field
            label="Terminal Growth %"
            value={a.terminal_growth * 100}
            onChange={(v) => upd({ terminal_growth: v / 100 })}
            step={0.5}
          />
          <Field label="Tax Rate %" value={a.tax_rate * 100} onChange={(v) => upd({ tax_rate: v / 100 })} step={1} />
          <Field
            label="Capex % Revenue"
            value={a.capex_pct_revenue * 100}
            onChange={(v) => upd({ capex_pct_revenue: v / 100 })}
            step={0.5}
          />
          <Field label="Shares Out (Cr)" value={a.shares_outstanding} onChange={(v) => upd({ shares_outstanding: v })} step={1} />
          <Field label="Net Debt (Cr)" value={a.net_debt} onChange={(v) => upd({ net_debt: v })} step={10} />
        </div>
      </div>
    </div>
  );
}

function DcfRow({ label, values, accent }: { label: string; values: string[]; accent?: boolean }) {
  return (
    <tr className={`border-b border-border/40 last:border-0 ${accent ? "bg-secondary/40" : ""}`}>
      <td className="text-left px-3 py-1.5 text-xs uppercase tracking-wider text-muted-foreground font-sans">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`text-right px-3 py-1.5 ${accent ? "text-primary font-semibold" : ""}`}>{v}</td>
      ))}
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mono">{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step ?? 0.1}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-8 mono text-sm mt-1"
      />
    </div>
  );
}
