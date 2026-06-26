import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { TerminalShell } from "@/components/TerminalShell";
import { listCompanies, upsertFinancialStatement } from "@/lib/companies.functions";
import { uploadDocument } from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";

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

function UploadPage() {
  const { company: companyQuery } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listCompanies);
  const upFin = useServerFn(upsertFinancialStatement);
  const upDoc = useServerFn(uploadDocument);

  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => listFn() });
  const [selected, setSelected] = useState<string | undefined>(
    companies.find((c) => c.symbol === companyQuery)?.id,
  );
  // Re-select when companies load
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
          <Tabs defaultValue="financials">
            <TabsList>
              <TabsTrigger value="financials">Financial Statement</TabsTrigger>
              <TabsTrigger value="document">Document (PDF/TXT)</TabsTrigger>
            </TabsList>
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
  const [fy, setFy] = useState<number>(new Date().getFullYear());
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
        const num = parseFloat(v);
        if (!isFinite(num)) continue;
        const [group, key] = f.key.split(".");
        data[group] ??= {};
        data[group][key] = num;
      }
      await onSubmit({
        company_id: companyId,
        period_type: "annual",
        fiscal_year: fy,
        period_end: `${fy}-03-31`,
        data,
      });
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
            type="number"
            min={1990}
            max={2100}
            value={fy}
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
                    type="number"
                    step="any"
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
  const [fy, setFy] = useState<number | "">(new Date().getFullYear());
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
        company_id: companyId,
        kind,
        title: title || file.name,
        fiscal_year: typeof fy === "number" ? fy : undefined,
        mime_type: file.type || "application/octet-stream",
        file_base64: b64,
      });
      setFile(null);
      setTitle("");
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
          <Input
            type="number"
            value={fy}
            onChange={(e) => setFy(e.target.value ? parseInt(e.target.value) : "")}
            className="mono mt-1"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q3 FY26 Earnings Call" className="mt-1" />
      </div>
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">File (PDF or TXT, ≤ 20 MB)</Label>
        <Input
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 mono text-xs"
        />
      </div>
      <Button type="submit" disabled={!file || busy} className="w-full">
        {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <UploadCloud className="size-4 mr-1" />}
        Upload & extract text
      </Button>
    </form>
  );
}
