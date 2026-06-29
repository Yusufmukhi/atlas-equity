// Deterministic DCF engine.
// Build 5-year explicit forecast → terminal value via Gordon growth.
// All values in INR crore unless noted.

export type DcfAssumptions = {
  base_revenue: number;          // last actual revenue
  revenue_growth: number[];      // 5 values, decimals (0.12 = 12%)
  ebitda_margin: number[];       // 5 values
  tax_rate: number;              // decimal
  da_pct_revenue: number;        // depreciation as % of revenue
  capex_pct_revenue: number;     // capex as % of revenue
  wc_pct_revenue_delta: number;  // change in WC as % of revenue change
  wacc: number;                  // discount rate (decimal)
  terminal_growth: number;       // decimal
  net_debt: number;              // crore
  shares_outstanding: number;    // crore (Indian convention)
};

export type DcfYear = {
  year: number;
  revenue: number;
  ebitda: number;
  da: number;
  ebit: number;
  tax: number;
  nopat: number;
  capex: number;
  delta_wc: number;
  fcf: number;
  discount_factor: number;
  pv_fcf: number;
};

export type DcfResult = {
  years: DcfYear[];
  terminal_value: number;
  pv_terminal: number;
  enterprise_value: number;
  equity_value: number;
  intrinsic_value_per_share: number;
};

export function runDcf(a: DcfAssumptions): DcfResult {
  const years: DcfYear[] = [];
  let prevRev = a.base_revenue;
  for (let i = 0; i < 5; i++) {
    const t = i + 1;
    const revenue = prevRev * (1 + (a.revenue_growth[i] ?? 0));
    const ebitda = revenue * (a.ebitda_margin[i] ?? 0);
    const da = revenue * a.da_pct_revenue;
    const ebit = ebitda - da;
    const tax = Math.max(0, ebit) * a.tax_rate;
    const nopat = ebit - tax;
    const capex = revenue * a.capex_pct_revenue;
    const delta_wc = (revenue - prevRev) * a.wc_pct_revenue_delta;
    const fcf = nopat + da - capex - delta_wc;
    const discount_factor = 1 / Math.pow(1 + a.wacc, t);
    const pv_fcf = fcf * discount_factor;
    years.push({ year: t, revenue, ebitda, da, ebit, tax, nopat, capex, delta_wc, fcf, discount_factor, pv_fcf });
    prevRev = revenue;
  }
  const lastFcf = years[years.length - 1].fcf;
  const terminal_fcf = lastFcf * (1 + a.terminal_growth);
  const terminal_value = terminal_fcf / (a.wacc - a.terminal_growth);
  const pv_terminal = terminal_value / Math.pow(1 + a.wacc, 5);
  const enterprise_value = years.reduce((s, y) => s + y.pv_fcf, 0) + pv_terminal;
  const equity_value = enterprise_value - a.net_debt;
  const intrinsic_value_per_share = a.shares_outstanding > 0 ? equity_value / a.shares_outstanding : 0;
  return { years, terminal_value, pv_terminal, enterprise_value, equity_value, intrinsic_value_per_share };
}

export function sensitivityGrid(a: DcfAssumptions, waccRange: number[], gRange: number[]) {
  return waccRange.map((w) =>
    gRange.map((g) => {
      const r = runDcf({ ...a, wacc: w, terminal_growth: g });
      return r.intrinsic_value_per_share;
    }),
  );
}

export function defaultAssumptions(baseRevenue: number, sharesOut: number, netDebt = 0): DcfAssumptions {
  return {
    base_revenue: baseRevenue,
    revenue_growth: [0.15, 0.13, 0.11, 0.09, 0.07],
    ebitda_margin: [0.18, 0.18, 0.19, 0.19, 0.2],
    tax_rate: 0.25,
    da_pct_revenue: 0.04,
    capex_pct_revenue: 0.06,
    wc_pct_revenue_delta: 0.15,
    wacc: 0.12,
    terminal_growth: 0.04,
    net_debt: netDebt,
    shares_outstanding: sharesOut,
  };
}
