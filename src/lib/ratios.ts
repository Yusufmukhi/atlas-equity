// Deterministic ratio + score engine. Pure TS, runs on client or server.
// Input: array of annual financial_statements rows (sorted oldest -> newest).

export type StatementData = {
  pnl?: {
    revenue?: number;
    other_income?: number;
    cogs?: number;
    employee_cost?: number;
    other_expenses?: number;
    ebitda?: number;
    depreciation?: number;
    ebit?: number;
    interest?: number;
    pbt?: number;
    tax?: number;
    pat?: number;
  };
  bs?: {
    total_assets?: number;
    current_assets?: number;
    inventory?: number;
    receivables?: number;
    cash?: number;
    current_liabilities?: number;
    payables?: number;
    total_debt?: number;
    short_term_debt?: number;
    long_term_debt?: number;
    equity?: number;
    retained_earnings?: number;
    working_capital?: number;
  };
  cf?: {
    cfo?: number;
    cfi?: number;
    cff?: number;
    capex?: number;
    fcf?: number;
  };
};

export type Statement = {
  fiscal_year: number;
  period_end: string;
  data: StatementData;
};

const safeDiv = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null || b === 0 ? null : a / b;

const cagr = (start: number | null | undefined, end: number | null | undefined, years?: number) => {
  if (start == null || end == null || !years || years <= 0 || start <= 0 || end <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
};

export type Metrics = {
  fiscal_year: number;
  revenue: number | null;
  ebitda: number | null;
  pat: number | null;
  ebitda_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  roe: number | null;
  roce: number | null;
  roa: number | null;
  debt_equity: number | null;
  interest_coverage: number | null;
  current_ratio: number | null;
  quick_ratio: number | null;
  ccc_days: number | null;
  fcf: number | null;
  fcf_margin: number | null;
  cash_conversion: number | null;
  altman_z: number | null;
  piotroski_f: number | null;
  piotroski_computable: number; // number of criteria (0-8) that had inputs available
};
  roe: number | null;
  roce: number | null;
  roa: number | null;
  debt_equity: number | null;
  interest_coverage: number | null;
  current_ratio: number | null;
  quick_ratio: number | null;
  ccc_days: number | null;
  fcf: number | null;
  fcf_margin: number | null;
  cash_conversion: number | null;
  altman_z: number | null;
  piotroski_f: number | null;
};

export function computeMetrics(stmts: Statement[]): Metrics[] {
  const sorted = [...stmts].sort((a, b) => a.fiscal_year - b.fiscal_year);
  return sorted.map((s, i) => {
    const p = s.data.pnl ?? {};
    const b = s.data.bs ?? {};
    const c = s.data.cf ?? {};
    const prev = i > 0 ? sorted[i - 1].data : undefined;

    const revenue = p.revenue ?? null;
    const ebitda = p.ebitda ?? null;
    const ebit = p.ebit ?? null;
    const pat = p.pat ?? null;

    const equity = b.equity ?? null;
    const debt = b.total_debt ?? null;
    const avgAssets =
      prev?.bs?.total_assets != null && b.total_assets != null
        ? (prev.bs.total_assets + b.total_assets) / 2
        : b.total_assets ?? null;
    const avgEquity =
      prev?.bs?.equity != null && equity != null ? (prev.bs.equity + equity) / 2 : equity;
    const capitalEmployed =
      equity != null && debt != null ? equity + debt : null;

    const cfo = c.cfo ?? null;
    const capex = c.capex ?? null;
    const fcf = c.fcf ?? (cfo != null && capex != null ? cfo - Math.abs(capex) : null);

    // Cash conversion cycle
    const dso = safeDiv(b.receivables, revenue);
    const dio = safeDiv(b.inventory, p.cogs);
    const dpo = safeDiv(b.payables, p.cogs);
    const ccc =
      dso != null && dio != null && dpo != null
        ? (dso + dio - dpo) * 365
        : null;

    // Altman Z (public manufacturing) — simplified
    const wc = b.working_capital ?? (b.current_assets != null && b.current_liabilities != null ? b.current_assets - b.current_liabilities : null);
    const ta = b.total_assets ?? null;
    const z =
      wc != null && ta != null && b.retained_earnings != null && ebit != null && equity != null && debt != null && revenue != null
        ? 1.2 * (wc / ta) +
          1.4 * (b.retained_earnings / ta) +
          3.3 * (ebit / ta) +
          0.6 * (equity / (debt || 1)) +
          1.0 * (revenue / ta)
        : null;

    // Piotroski F — needs prior; approximate
    let piotroski: number | null = null;
    if (prev) {
      let score = 0;
      const prevP = prev.pnl ?? {};
      const prevB = prev.bs ?? {};
      const prevC = prev.cf ?? {};
      if ((pat ?? 0) > 0) score++;
      if ((cfo ?? 0) > 0) score++;
      const roaNow = safeDiv(pat, b.total_assets);
      const roaPrev = safeDiv(prevP.pat, prevB.total_assets);
      if (roaNow != null && roaPrev != null && roaNow > roaPrev) score++;
      if (cfo != null && pat != null && cfo > pat) score++;
      if (debt != null && prevB.total_debt != null && debt < prevB.total_debt) score++;
      const crNow = safeDiv(b.current_assets, b.current_liabilities);
      const crPrev = safeDiv(prevB.current_assets, prevB.current_liabilities);
      if (crNow != null && crPrev != null && crNow > crPrev) score++;
      // shares dilution not tracked → skip (out of 8)
      const gmNow = revenue && p.cogs != null ? (revenue - p.cogs) / revenue : null;
      const gmPrev = prevP.revenue && prevP.cogs != null ? (prevP.revenue - prevP.cogs) / prevP.revenue : null;
      if (gmNow != null && gmPrev != null && gmNow > gmPrev) score++;
      const atNow = safeDiv(revenue, b.total_assets);
      const atPrev = safeDiv(prevP.revenue, prevB.total_assets);
      if (atNow != null && atPrev != null && atNow > atPrev) score++;
      piotroski = score;
    }

    return {
      fiscal_year: s.fiscal_year,
      revenue,
      ebitda,
      pat,
      ebitda_margin: safeDiv(ebitda, revenue),
      operating_margin: safeDiv(ebit, revenue),
      net_margin: safeDiv(pat, revenue),
      roe: safeDiv(pat, avgEquity),
      roce: safeDiv(ebit, capitalEmployed),
      roa: safeDiv(pat, avgAssets),
      debt_equity: safeDiv(debt, equity),
      interest_coverage: safeDiv(ebit, p.interest),
      current_ratio: safeDiv(b.current_assets, b.current_liabilities),
      quick_ratio:
        b.current_assets != null && b.inventory != null
          ? safeDiv(b.current_assets - b.inventory, b.current_liabilities)
          : null,
      ccc_days: ccc,
      fcf,
      fcf_margin: safeDiv(fcf, revenue),
      cash_conversion: safeDiv(cfo, pat),
      altman_z: z,
      piotroski_f: piotroski,
    };
  });
}

export type Cagrs = {
  revenue_3y: number | null;
  revenue_5y: number | null;
  revenue_10y: number | null;
  pat_3y: number | null;
  pat_5y: number | null;
  pat_10y: number | null;
};

export function computeCagrs(stmts: Statement[]): Cagrs {
  const sorted = [...stmts].sort((a, b) => a.fiscal_year - b.fiscal_year);
  const last = sorted[sorted.length - 1];
  const find = (yrsBack: number) => sorted[sorted.length - 1 - yrsBack];
  const get = (s?: Statement) => ({
    rev: s?.data.pnl?.revenue ?? undefined,
    pat: s?.data.pnl?.pat ?? undefined,
  });
  const l = get(last);
  return {
    revenue_3y: cagr(get(find(3)).rev, l.rev, 3),
    revenue_5y: cagr(get(find(5)).rev, l.rev, 5),
    revenue_10y: cagr(get(find(10)).rev, l.rev, 10),
    pat_3y: cagr(get(find(3)).pat, l.pat, 3),
    pat_5y: cagr(get(find(5)).pat, l.pat, 5),
    pat_10y: cagr(get(find(10)).pat, l.pat, 10),
  };
}

export type Scores = {
  financial_health: number;     // 0-10
  growth: number;
  cash_flow: number;
  balance_sheet: number;
};

export function computeScores(metrics: Metrics[], cagrs: Cagrs): Scores {
  const last = metrics[metrics.length - 1];
  if (!last) return { financial_health: 0, growth: 0, cash_flow: 0, balance_sheet: 0 };
  const clip = (n: number, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, n));

  // Growth: blended revenue + pat CAGR (5y preferred, fallback 3y)
  const g = (cagrs.revenue_5y ?? cagrs.revenue_3y ?? 0) * 100;
  const pg = (cagrs.pat_5y ?? cagrs.pat_3y ?? 0) * 100;
  const growth = clip(((g + pg) / 2) / 3); // 30% blended → 10/10

  // Financial health: ROCE + margin trend
  const fh = clip(((last.roce ?? 0) * 100) / 3 + ((last.ebitda_margin ?? 0) * 100) / 5);

  // Cash flow: cash conversion + fcf margin
  const cf = clip(((last.cash_conversion ?? 0) * 5) + ((last.fcf_margin ?? 0) * 100) / 2);

  // Balance sheet: inverse D/E + interest coverage + Z-score
  const de = last.debt_equity ?? 0;
  const ic = last.interest_coverage ?? 0;
  const z = last.altman_z ?? 0;
  const bs = clip((de < 0.5 ? 5 : de < 1 ? 3 : de < 2 ? 1 : 0) + Math.min(ic / 5, 3) + Math.min(z / 3, 2));

  return {
    financial_health: Math.round(fh * 10) / 10,
    growth: Math.round(growth * 10) / 10,
    cash_flow: Math.round(cf * 10) / 10,
    balance_sheet: Math.round(bs * 10) / 10,
  };
}

export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null || !isFinite(n) ? "—" : `${(n * 100).toFixed(digits)}%`;
export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: digits });
export const fmtX = (n: number | null | undefined, digits = 2) =>
  n == null || !isFinite(n) ? "—" : `${n.toFixed(digits)}x`;
