import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useCallback, useEffect, useMemo } from "react";
import { z } from "zod";
import * as XLSX from "xlsx";
import { TerminalShell } from "@/components/TerminalShell";
import { listCompanies, upsertFinancialStatement, getCompanyBySymbol } from "@/lib/companies.functions";
import { uploadDocument } from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, X } from "lucide-react";


const search = z.object({ company: z.string().optional() });

export const Route = createFileRoute("/_authenticated/upload")({
  validateSearch: (s) => search.parse(s),
  head: () => ({ meta: [{ title: "Upload Data" }] }),
  component: UploadPage,
});

const FIELDS = [
  // P&L
  { key: "pnl.revenue", label: "Revenue", group: "P&L" },
  { key: "pnl.cogs", label: "COGS", group: "P&L" },
  { key: "pnl.employee_cost", label: "Employee Cost", group: "P&L" },
  { key: "pnl.other_expenses", label: "Other Expenses", group: "P&L" },
  { key: "pnl.ebitda", label: "EBITDA", group: "P&L" },
  { key: "pnl.depreciation", label: "Depreciation", group: "P&L" },
  { key: "pnl.ebit", label: "EBIT", group: "P&L" },
  { key: "pnl.interest", label: "Interest", group: "P&L" },
  { key: "pnl.tax", label: "Tax", group: "P&L" },
  { key: "pnl.pat", label: "PAT", group: "P&L" },
  // BS
  { key: "bs.total_assets", label: "Total Assets", group: "BS" },
  { key: "bs.current_assets", label: "Current Assets", group: "BS" },
  { key: "bs.inventory", label: "Inventory", group: "BS" },
  { key: "bs.receivables", label: "Receivables", group: "BS" },
  { key: "bs.cash", label: "Cash & Eq", group: "BS" },
  { key: "bs.current_liabilities", label: "Current Liab", group: "BS" },
  { key: "bs.payables", label: "Payables", group: "BS" },
  { key: "bs.total_debt", label: "Total Debt", group: "BS" },
  { key: "bs.equity", label: "Shareholders' Equity", group: "BS" },
  { key: "bs.retained_earnings", label: "Retained Earnings", group: "BS" },
  { key: "bs.working_capital", label: "Working Capital", group: "BS" },
  // CF
  { key: "cf.cfo", label: "Cash from Ops", group: "CF" },
  { key: "cf.capex", label: "Capex", group: "CF" },
  { key: "cf.fcf", label: "Free Cash Flow", group: "CF" },
] as const;

// ─── Screener Excel Parser ────────────────────────────────────────────────────

type ParsedPeriod = {
  period_type: "annual" | "quarterly";
  fiscal_year: number;
  period_end: string; // YYYY-MM-DD
  label: string;      // e.g. "FY2026" or "Q3 FY26"
  data: Record<string, Record<string, number>>;
};

type ParseResult = {
  company_name: string;
  years: ParsedPeriod[];     // annual rows
  quarters: ParsedPeriod[];  // quarterly rows
  warnings: string[];
};


function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : null;
}

function parseScreenerExcel(file: ArrayBuffer): ParseResult {
  const wb = XLSX.read(file, { type: "array", cellDates: true });
  const ws = wb.Sheets["Data Sheet"];
  if (!ws) throw new Error('No "Data Sheet" tab found. Is this a Screener.in export?');

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
  const warnings: string[] = [];

  // Row 1 col B = company name
  const company_name = String((raw[0] as unknown[])?.[1] ?? "").trim();
  if (!company_name) warnings.push("Could not read company name from Data Sheet B1");

  // Helper: find a row by label in col A (0-indexed)
  const findRow = (label: string): unknown[] | null => {
    for (const row of raw as unknown[][]) {
      if (String(row[0] ?? "").trim().toLowerCase() === label.toLowerCase()) return row;
    }
    return null;
  };

  // P&L dates are row 16 (index 15), BS dates row 56 (55), CF dates row 81 (80)
  // Columns: data starts at col B (index 1), up to 10 years across B–K
  const pnlDateRow = raw[15] as unknown[];
  const bsDateRow = raw[55] as unknown[];
  const cfDateRow = raw[80] as unknown[];

  // Use P&L dates as primary; fall back to BS
  const dateRow = pnlDateRow ?? bsDateRow;

  // Collect column indices where there's a date
  const colEntries: { colIdx: number; fiscal_year: number; period_end: string }[] = [];
  for (let c = 1; c <= 10; c++) {
    const cell = dateRow?.[c];
    if (!cell) continue;
    // XLSX parses dates as JS Date objects (cellDates:true) or date strings
    let d: Date | null = null;
    if (cell instanceof Date) d = cell;
    else if (typeof cell === "string" && cell.match(/\d{4}/)) {
      const parsed = new Date(cell);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
    if (!d) continue;
    const fy = d.getFullYear(); // March year-end → FY = calendar year of March
    colEntries.push({
      colIdx: c,
      fiscal_year: fy,
      period_end: `${fy}-03-31`,
    });
  }

  if (colEntries.length === 0) throw new Error("No annual date columns found in Data Sheet row 16.");

  // P&L rows (row indices are 0-based, Screener rows are 1-based)
  const salesRow       = raw[16] as unknown[];  // row 17
  const empCostRow     = raw[21] as unknown[];  // row 22
  const otherExpRow    = raw[23] as unknown[];  // row 24
  const otherIncRow    = raw[24] as unknown[];  // row 25
  const deprRow        = raw[25] as unknown[];  // row 26
  const interestRow    = raw[26] as unknown[];  // row 27
  const pbtRow         = raw[27] as unknown[];  // row 28
  const taxRow         = raw[28] as unknown[];  // row 29
  const patRow         = raw[29] as unknown[];  // row 30

  // BS rows
  const equityCapRow   = raw[56] as unknown[];  // row 57
  const reservesRow    = raw[57] as unknown[];  // row 58
  const borrowingsRow  = raw[58] as unknown[];  // row 59
  const otherLiabRow   = raw[59] as unknown[];  // row 60
  const totalAssetsRow = raw[65] as unknown[];  // row 66 (asset total)
  const receivablesRow = raw[66] as unknown[];  // row 67
  const inventoryRow   = raw[67] as unknown[];  // row 68
  const cashRow        = raw[68] as unknown[];  // row 69

  // CF rows
  const cfoRow         = raw[81] as unknown[];  // row 82
  const cfiRow         = raw[82] as unknown[];  // row 83 (investing = capex proxy)

  const years: ParsedYear[] = colEntries.map(({ colIdx, fiscal_year, period_end }) => {
    const c = colIdx;

    const revenue    = num(salesRow?.[c]);
    const empCost    = num(empCostRow?.[c]);
    const otherExp   = num(otherExpRow?.[c]);
    const otherInc   = num(otherIncRow?.[c]);
    const dep        = num(deprRow?.[c]);
    const interest   = num(interestRow?.[c]);
    const tax        = num(taxRow?.[c]);
    const pat        = num(patRow?.[c]);

    // EBITDA = PBT + Tax + Interest + Dep - OtherInc  (Screener style)
    const pbt        = num(pbtRow?.[c]);
    const ebitda     = (pbt ?? 0) + (dep ?? 0) + (interest ?? 0) - (otherInc ?? 0);
    const ebit       = ebitda - (dep ?? 0);

    const eqCap      = num(equityCapRow?.[c]);
    const reserves   = num(reservesRow?.[c]);
    const borrowings = num(borrowingsRow?.[c]);
    const otherLiab  = num(otherLiabRow?.[c]);
    const totalAssets = num(totalAssetsRow?.[c]);
    const receivables = num(receivablesRow?.[c]);
    const inventory  = num(inventoryRow?.[c]);
    const cash       = num(cashRow?.[c]);
    const equity     = (eqCap ?? 0) + (reserves ?? 0);

    const cfo        = num(cfoRow?.[c]);
    const cfi        = num(cfiRow?.[c]);
    // Capex = |cash from investing| (simplified — investing is mostly capex for most cos)
    const capex      = cfi !== null ? Math.abs(cfi) : null;
    const fcf        = cfo !== null && capex !== null ? cfo - capex : null;

    const pnl: Record<string, number> = {};
    const bs: Record<string, number> = {};
    const cf: Record<string, number> = {};

    if (revenue   !== null) pnl.revenue       = revenue;
    if (empCost   !== null) pnl.employee_cost = empCost;
    if (otherExp  !== null) pnl.other_expenses = otherExp;
    if (isFinite(ebitda))   pnl.ebitda        = parseFloat(ebitda.toFixed(2));
    if (dep       !== null) pnl.depreciation  = dep;
    if (isFinite(ebit))     pnl.ebit          = parseFloat(ebit.toFixed(2));
    if (interest  !== null) pnl.interest      = interest;
    if (tax       !== null) pnl.tax           = tax;
    if (pat       !== null) pnl.pat           = pat;

    if (totalAssets !== null) bs.total_assets = totalAssets;
    if (receivables !== null) bs.receivables  = receivables;
    if (inventory   !== null) bs.inventory    = inventory;
    if (cash        !== null) bs.cash         = cash;
    if (borrowings  !== null) bs.total_debt   = borrowings;
    if (equity > 0)           bs.equity       = parseFloat(equity.toFixed(2));
    if (reserves    !== null) bs.retained_earnings = reserves;

    if (cfo   !== null) cf.cfo   = cfo;
    if (capex !== null) cf.capex = capex;
    if (fcf   !== null) cf.fcf   = parseFloat(fcf.toFixed(2));

    return { fiscal_year, period_end, data: { pnl, bs, cf } };
  });

  return { company_name, years, warnings };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function UploadPage() {
  const { company: companyQuery } = Route.useSearch();
  const qc = useQueryClient();
  const listFn   = useServerFn(listCompanies);
  const upFin    = useServerFn(upsertFinancialStatement);
  const upDoc    = useServerFn(uploadDocument);

  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => listFn() });
  const [selected, setSelected] = useState<string | undefined>(
    companies.find((c) => c.symbol === companyQuery)?.id,
  );
  if (companies.length > 0 && !selected) {
    const match = companies.find((c) => c.symbol === companyQuery);
    if (match) setSelected(match.id);
  }

  return (
    <TerminalShell>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <h1 className="text-2xl font-semibold mb-1">Ingest Data</h1>
        <p className="text-xs text-muted-foreground mb-6 mono uppercase tracking-wider">
          Add financial statements and source documents
        </p>

        <div className="panel p-4 mb-6">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Company</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="mt-1 mono"><SelectValue placeholder="Select a company" /></SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id} className="mono">
                  {c.symbol} — {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {companies.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              No companies yet. <Link to="/dashboard" className="text-primary hover:underline">Add one</Link>.
            </p>
          )}
        </div>

        {selected && (
          <Tabs defaultValue="excel">
            <TabsList>
              <TabsTrigger value="excel" className="gap-1.5">
                <FileSpreadsheet className="size-3.5" /> Import from Excel
              </TabsTrigger>
              <TabsTrigger value="financials">Manual Entry</TabsTrigger>
              <TabsTrigger value="document">Document (PDF/TXT)</TabsTrigger>
            </TabsList>

            {/* ── Excel Import Tab ── */}
            <TabsContent value="excel" className="mt-4">
              <ExcelImportForm
                companyId={selected}
                onSaveYear={async (payload) => {
                  await upFin({ data: payload });
                  qc.invalidateQueries({ queryKey: ["company"] });
                }}
              />
            </TabsContent>

            {/* ── Manual Entry Tab ── */}
            <TabsContent value="financials" className="mt-4">
              <FinancialForm
                companyId={selected}
                onSubmit={async (payload) => {
                  await upFin({ data: payload });
                  qc.invalidateQueries({ queryKey: ["company"] });
                  toast.success("Financials saved");
                }}
              />
            </TabsContent>

            {/* ── Document Tab ── */}
            <TabsContent value="document" className="mt-4">
              <DocumentForm
                companyId={selected}
                onSubmit={async (payload) => {
                  await upDoc({ data: payload });
                  qc.invalidateQueries({ queryKey: ["company"] });
                  toast.success("Document uploaded & text extracted");
                }}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </TerminalShell>
  );
}

// ─── Excel Import Form ────────────────────────────────────────────────────────

type SaveYearPayload = {
  company_id: string;
  period_type: "annual";
  fiscal_year: number;
  period_end: string;
  data: Record<string, unknown>;
};

function ExcelImportForm({
  companyId,
  onSaveYear,
}: {
  companyId: string;
  onSaveYear: (p: SaveYearPayload) => Promise<void>;
}) {
  const [parsed, setParsed]       = useState<ParseResult | null>(null);
  const [parseErr, setParseErr]   = useState<string | null>(null);
  const [dragging, setDragging]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState<Set<number>>(new Set());
  const [fileName, setFileName]   = useState<string>("");

  const handleFile = useCallback((file: File) => {
    setParseErr(null);
    setParsed(null);
    setSaved(new Set());
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = e.target?.result as ArrayBuffer;
        const result = parseScreenerExcel(buf);
        setParsed(result);
      } catch (err) {
        setParseErr(err instanceof Error ? err.message : "Failed to parse file");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const saveAll = async () => {
    if (!parsed) return;
    setSaving(true);
    let ok = 0;
    let fail = 0;
    for (const y of parsed.years) {
      try {
        await onSaveYear({
          company_id: companyId,
          period_type: "annual",
          fiscal_year: y.fiscal_year,
          period_end: y.period_end,
          data: y.data,
        });
        setSaved((s) => new Set(s).add(y.fiscal_year));
        ok++;
      } catch {
        fail++;
      }
    }
    setSaving(false);
    if (fail === 0) toast.success(`Saved ${ok} years of financials`);
    else toast.error(`${ok} saved, ${fail} failed`);
  };

  const saveOne = async (y: ParsedYear) => {
    setSaving(true);
    try {
      await onSaveYear({
        company_id: companyId,
        period_type: "annual",
        fiscal_year: y.fiscal_year,
        period_end: y.period_end,
        data: y.data,
      });
      setSaved((s) => new Set(s).add(y.fiscal_year));
      toast.success(`FY${y.fiscal_year} saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <div className="panel p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">How to get the Excel file:</p>
        <p>1. Go to <span className="mono text-primary">screener.in</span> → open any company → click <strong>Export to Excel</strong></p>
        <p>2. Drop the downloaded <span className="mono">.xlsx</span> file below — all years import automatically</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`panel border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
          ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
        onClick={() => document.getElementById("excel-file-input")?.click()}
      >
        <input
          id="excel-file-input"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <FileSpreadsheet className="size-8 mx-auto mb-2 text-muted-foreground" />
        {fileName ? (
          <p className="text-sm font-medium mono">{fileName}</p>
        ) : (
          <>
            <p className="text-sm font-medium">Drop Screener.in Excel here</p>
            <p className="text-xs text-muted-foreground mt-1">or click to browse · .xlsx / .xls</p>
          </>
        )}
      </div>

      {/* Error */}
      {parseErr && (
        <div className="panel p-3 flex items-start gap-2 border border-destructive/40 bg-destructive/5 text-destructive text-xs">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Could not parse file</p>
            <p>{parseErr}</p>
          </div>
        </div>
      )}

      {/* Preview table */}
      {parsed && (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{parsed.company_name}</p>
              <p className="text-xs text-muted-foreground">{parsed.years.length} years found</p>
            </div>
            <Button onClick={saveAll} disabled={saving || parsed.years.every((y) => saved.has(y.fiscal_year))}>
              {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <UploadCloud className="size-4 mr-1.5" />}
              Save All {parsed.years.length} Years
            </Button>
          </div>

          {/* Warnings */}
          {parsed.warnings.length > 0 && (
            <div className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded p-2 space-y-0.5">
              {parsed.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
            </div>
          )}

          {/* Table */}
          <div className="panel overflow-x-auto">
            <table className="w-full text-xs mono">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2 text-muted-foreground font-medium">Metric</th>
                  {parsed.years.map((y) => (
                    <th key={y.fiscal_year} className="text-right p-2 text-muted-foreground font-medium whitespace-nowrap">
                      FY{y.fiscal_year}
                    </th>
                  ))}
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {/* P&L section */}
                <tr className="bg-muted/30">
                  <td colSpan={parsed.years.length + 2} className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Profit & Loss (₹ Cr)
                  </td>
                </tr>
                {(["revenue","ebitda","depreciation","ebit","interest","tax","pat"] as const).map((k) => (
                  <PreviewRow key={k} label={k.toUpperCase()} years={parsed.years} accessor={(y) => y.data.pnl?.[k]} />
                ))}

                {/* BS section */}
                <tr className="bg-muted/30">
                  <td colSpan={parsed.years.length + 2} className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Balance Sheet (₹ Cr)
                  </td>
                </tr>
                {(["total_assets","equity","total_debt","receivables","inventory","cash"] as const).map((k) => (
                  <PreviewRow key={k} label={k.replace(/_/g," ")} years={parsed.years} accessor={(y) => y.data.bs?.[k]} />
                ))}

                {/* CF section */}
                <tr className="bg-muted/30">
                  <td colSpan={parsed.years.length + 2} className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Cash Flow (₹ Cr)
                  </td>
                </tr>
                {(["cfo","capex","fcf"] as const).map((k) => (
                  <PreviewRow key={k} label={k.toUpperCase()} years={parsed.years} accessor={(y) => y.data.cf?.[k]} />
                ))}

                {/* Per-year save buttons row */}
                <tr className="border-t border-border">
                  <td className="p-2 text-muted-foreground">Save year</td>
                  {parsed.years.map((y) => (
                    <td key={y.fiscal_year} className="p-2 text-right">
                      {saved.has(y.fiscal_year) ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="size-3.5" /> Saved
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2"
                          disabled={saving}
                          onClick={() => saveOne(y)}
                        >
                          FY{y.fiscal_year}
                        </Button>
                      )}
                    </td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Reset */}
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => { setParsed(null); setFileName(""); setSaved(new Set()); }}
          >
            <X className="size-3" /> Clear & upload a different file
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewRow({
  label,
  years,
  accessor,
}: {
  label: string;
  years: ParsedYear[];
  accessor: (y: ParsedYear) => number | undefined;
}) {
  return (
    <tr className="border-b border-border/50 hover:bg-muted/20">
      <td className="p-2 text-muted-foreground capitalize">{label}</td>
      {years.map((y) => {
        const v = accessor(y);
        return (
          <td key={y.fiscal_year} className={`p-2 text-right ${v === undefined ? "text-muted-foreground/40" : ""}`}>
            {v !== undefined ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
          </td>
        );
      })}
      <td />
    </tr>
  );
}

// ─── Manual Financial Form (unchanged) ───────────────────────────────────────

function FinancialForm({
  companyId,
  onSubmit,
}: {
  companyId: string;
  onSubmit: (p: {
    company_id: string;
    period_type: "annual";
    fiscal_year: number;
    period_end: string;
    data: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const [fy, setFy]   = useState<number>(new Date().getFullYear());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data: Record<string, Record<string, number>> = {};
      for (const f of FIELDS) {
        const v = vals[f.key];
        if (v === undefined || v === "") continue;
        const n = parseFloat(v);
        if (!isFinite(n)) continue;
        const [group, key] = f.key.split(".");
        data[group] ??= {};
        data[group][key] = n;
      }
      await onSubmit({ company_id: companyId, period_type: "annual", fiscal_year: fy, period_end: `${fy}-03-31`, data });
      setVals({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const grouped: Record<string, typeof FIELDS[number][]> = { "P&L": [], BS: [], CF: [] };
  for (const f of FIELDS) grouped[f.group].push(f);

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="panel p-4 flex items-end gap-3">
        <div className="flex-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fiscal Year (March year-end)</Label>
          <Input
            type="number" min={1990} max={2100} value={fy}
            onChange={(e) => setFy(parseInt(e.target.value) || fy)}
            className="mono mt-1 w-32"
          />
        </div>
        <p className="text-xs text-muted-foreground mb-2">All values in ₹ crore</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {(["P&L", "BS", "CF"] as const).map((g) => (
          <div key={g} className="panel">
            <div className="panel-header"><span>{g}</span></div>
            <div className="p-3 space-y-2">
              {grouped[g].map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <Label className="text-xs flex-1 text-muted-foreground">{f.label}</Label>
                  <Input
                    type="number" step="any"
                    value={vals[f.key] ?? ""}
                    onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="h-7 text-xs mono w-28 text-right"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : null} Save FY{fy} financials
      </Button>
    </form>
  );
}

// ─── Document Form (unchanged) ────────────────────────────────────────────────

function DocumentForm({
  companyId,
  onSubmit,
}: {
  companyId: string;
  onSubmit: (p: {
    company_id: string;
    kind: "annual_report" | "concall" | "presentation" | "quarterly_result" | "credit_rating" | "other";
    title: string;
    fiscal_year?: number;
    mime_type: string;
    file_base64: string;
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<"annual_report" | "concall" | "presentation" | "quarterly_result" | "credit_rating" | "other">("concall");
  const [title, setTitle] = useState("");
  const [fy, setFy]     = useState<number | "">(new Date().getFullYear());
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      await onSubmit({
        company_id: companyId, kind, title: title || file.name,
        fiscal_year: typeof fy === "number" ? fy : undefined,
        mime_type: file.type || "application/octet-stream", file_base64: b64,
      });
      setFile(null); setTitle("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel p-4 space-y-3 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Kind</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="annual_report">Annual Report</SelectItem>
              <SelectItem value="concall">Concall Transcript</SelectItem>
              <SelectItem value="presentation">Investor Presentation</SelectItem>
              <SelectItem value="quarterly_result">Quarterly Result</SelectItem>
              <SelectItem value="credit_rating">Credit Rating</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fiscal Year</Label>
          <Input type="number" value={fy} onChange={(e) => setFy(e.target.value ? parseInt(e.target.value) : "")} className="mono mt-1" />
        </div>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q3 FY26 Earnings Call" className="mt-1" />
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">File (PDF or TXT, ≤ 20 MB)</Label>
        <Input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 mono text-xs" />
      </div>
      <Button type="submit" disabled={!file || busy} className="w-full">
        {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <UploadCloud className="size-4 mr-1" />}
        Upload & extract text
      </Button>
    </form>
  );
}
