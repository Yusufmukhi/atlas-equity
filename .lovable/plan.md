
# AI Equity Research Platform — Build Plan

You picked "Full pipeline" + "User pastes/uploads data" + "Lovable stack". The full Python/FastAPI + scraping pipeline can't run inside Lovable (no Python host, no scrapers for BSE/NSE/concalls). I'll build the most ambitious version that actually works here: a Bloomberg-style TanStack Start app, Lovable Cloud (Postgres) for persistence, and Lovable AI Gateway running the 6 research agents on data you upload or paste.

When you're ready to add real data feeds, you bring an API key (Trendlyne / Tijori / Finnhub / your own scraper) and I wire it in — the app is built around a normalized schema so swapping the source is a single ingestion module.

## What v1 delivers

1. **Bloomberg-style dark UI** — ticker search, company dashboard, multi-tab report, charts (Recharts), interactive tables, PDF export.
2. **Data ingestion (manual for v1)**
   - Paste Screener.in export, or upload: Annual Report PDF, Concall transcript (PDF/TXT), Investor Presentation, quarterly results
   - PDFs parsed server-side (via Lovable AI multimodal — pass file as base64 to Gemini)
   - Structured financials entered via grid (10-yr P&L / BS / CF) with CSV import
3. **Auto-computed ratios & scores** (deterministic, not AI):
   - Revenue/Profit CAGR, all margin metrics, ROE/ROCE/ROA, D/E, Interest Coverage, Current/Quick, CCC, FCF, FCF margin, Altman Z, Piotroski F, Beneish M, Operating Leverage
4. **6 AI Agents** (Lovable AI Gateway, `google/gemini-3-flash-preview`):
   - Business Analyst, Financial Statement Analyst, Management Analyst, Industry Analyst, Risk Analyst, Valuation Analyst
   - Each agent returns structured JSON (zod-validated) with score + reasoning + **source citations** (line refs to uploaded docs / specific ratios)
5. **DCF Engine** (deterministic TS, not AI):
   - 5-yr explicit forecast → terminal value, WACC builder (Rf + β·ERP + size premium), sensitivity grid (WACC × terminal g), bull/base/bear scenarios
6. **Concall Analyzer** — extracts guidance, capex, order book, tone, repeated risks, missed prior guidance (compared against earlier concalls in DB)
7. **Peer Comparison** — user adds peer tickers; side-by-side table of all key metrics
8. **Report Generation** — single multi-section research report page with: Overview, Business, Industry, Financials, Management, Cash Flow, Balance Sheet, Valuation (DCF + comps), Risks, Bull/Base/Bear, Investment Thesis, Recommendation. PDF download via `react-to-print`.
9. **Scorecards** — Business Quality, Financial Strength, Management, Growth, Valuation, Risk, Overall — each with the AI's cited justification.

## Architecture

```text
TanStack Start (SSR React + TS + Tailwind, dark theme)
  ├── routes/index.tsx              Ticker search + recent reports
  ├── routes/_authenticated/...     Auth gate (Lovable Cloud)
  ├── routes/company.$symbol.tsx    Company dashboard (tabs)
  ├── routes/company.$symbol.report.tsx   Full report (printable)
  ├── routes/upload.tsx             Ingest documents/financials
  └── routes/api/...                Server routes (PDF parse stream)

src/lib/
  ├── agents/                       6 agent server fns (gemini-3-flash via Lovable AI Gateway)
  ├── dcf/                          Deterministic DCF + WACC + sensitivity
  ├── ratios/                       Ratio + Altman/Piotroski/Beneish calculators
  └── ingest/                       PDF→text via AI multimodal, CSV parser

Lovable Cloud (Postgres):
  companies, financial_statements (annual+quarterly), ratios,
  documents (PDFs in Storage), concalls, agent_outputs,
  dcf_models, peers, reports, user_roles
```

All tables RLS-protected, scoped to authenticated user. `service_role` only used inside server fns for system writes.

## AI agent contract

Every agent returns:
```ts
{ score: 0-10, summary: string, findings: [{ claim, evidence, source }], risks: [...] }
```
- `evidence` must reference a specific ratio value or document excerpt
- `source` = document ID + page/section, or `computed:ratio_name`
- UI renders every claim with a clickable citation chip — no ungrounded statements

## What's explicitly out of scope for v1

- Automatic scraping of BSE/NSE/Screener (requires paid data or hosted scrapers)
- Real-time prices (add later via your data API)
- Monte Carlo DCF (stub UI; deterministic sensitivity grid ships now)
- Multi-user team workspaces
- Insider/bulk/block deal feeds (no free Indian source)

## Build order

1. Enable Lovable Cloud, schema + RLS, auth pages
2. Design system (Bloomberg dark: near-black bg, amber/cyan accents, JetBrains Mono numerals, Inter UI)
3. Upload flow + financial grid + ratio engine
4. DCF engine + sensitivity UI
5. 6 AI agents (parallel server fns) + scorecard UI
6. Report page + PDF export
7. Peer comparison

This is ~a week of focused build. I'll ship it iteratively; after each phase you'll see working UI in the preview.

Approve and I start with Phase 1 (Cloud + schema + auth + design system).
