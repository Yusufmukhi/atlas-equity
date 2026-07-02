import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { TerminalShell } from "@/components/TerminalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  listHoldings,
  upsertHolding,
  deleteHolding,
} from "@/lib/holdings.functions";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio" }] }),
  component: PortfolioPage,
});

function fmt(n: number | null | undefined, d = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function PortfolioPage() {
  const list = useServerFn(listHoldings);
  const save = useServerFn(upsertHolding);
  const del = useServerFn(deleteHolding);
  const qc = useQueryClient();

  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["holdings"],
    queryFn: () => list(),
  });

  const saveMut = useMutation({
    mutationFn: (input: any) => save({ data: input }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["holdings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["holdings"] });
    },
  });

  const totals = useMemo(() => {
    let invested = 0;
    let mkt = 0;
    for (const h of data as any[]) {
      const q = Number(h.quantity) || 0;
      const c = Number(h.avg_cost) || 0;
      const p = Number(h.company?.current_price) || 0;
      invested += q * c;
      mkt += q * p;
    }
    return { invested, mkt, pnl: mkt - invested, pct: invested ? ((mkt - invested) / invested) * 100 : 0 };
  }, [data]);

  return (
    <TerminalShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h1 className="text-lg mono uppercase tracking-wider text-primary">Portfolio</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Holdings vs latest ingested price. Update prices via company page or upload.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setAdding(true)
            }
          >
            <Plus className="size-3.5 mr-1" /> Add position
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Kpi label="Invested" value={fmt(totals.invested)} />
          <Kpi label="Market Value" value={fmt(totals.mkt)} />
          <Kpi
            label="P&L"
            value={fmt(totals.pnl)}
            tone={totals.pnl >= 0 ? "up" : "down"}
          />
          <Kpi
            label="Return %"
            value={`${totals.pct >= 0 ? "+" : ""}${fmt(totals.pct)}%`}
            tone={totals.pct >= 0 ? "up" : "down"}
          />
        </div>

        {adding && (
          <div className="border border-primary/30 rounded p-4 mb-4 bg-card/40">
            <HoldingEditor
              initial={null}
              onCancel={() => setAdding(false)}
              onSave={(v) => saveMut.mutate(v)}
              busy={saveMut.isPending}
            />
          </div>
        )}

        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="border border-border rounded p-8 text-center text-xs text-muted-foreground">
            No positions yet.
          </div>
        ) : (
          <div className="border border-border rounded overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px] uppercase mono tracking-wider">
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Avg Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Invested</TableHead>
                  <TableHead className="text-right">Market</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data as any[]).map((h) => {
                  const q = Number(h.quantity) || 0;
                  const c = Number(h.avg_cost) || 0;
                  const p = Number(h.company?.current_price) || 0;
                  const inv = q * c;
                  const mkt = q * p;
                  const pnl = mkt - inv;
                  const pct = inv ? (pnl / inv) * 100 : 0;
                  const isEd = editing?.id === h.id;
                  const up = pnl >= 0;
                  return (
                    <>
                      <TableRow key={h.id} className="text-xs">
                        <TableCell className="mono">
                          <Link
                            to="/company/$symbol"
                            params={{ symbol: h.company?.symbol }}
                            className="text-primary hover:underline"
                          >
                            {h.company?.symbol}
                          </Link>
                          <div className="text-[10px] text-muted-foreground">
                            {h.company?.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right mono">{fmt(q, 0)}</TableCell>
                        <TableCell className="text-right mono">{fmt(c)}</TableCell>
                        <TableCell className="text-right mono">{p ? fmt(p) : "—"}</TableCell>
                        <TableCell className="text-right mono">{fmt(inv)}</TableCell>
                        <TableCell className="text-right mono">{p ? fmt(mkt) : "—"}</TableCell>
                        <TableCell
                          className={`text-right mono ${!p ? "" : up ? "text-emerald-500" : "text-red-500"}`}
                        >
                          {p ? fmt(pnl) : "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right mono ${!p ? "" : up ? "text-emerald-500" : "text-red-500"}`}
                        >
                          {p ? `${up ? "+" : ""}${fmt(pct)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() =>
                              setEditing(
                                isEd
                                  ? null
                                  : {
                                      id: h.id,
                                      company_id: h.company_id,
                                      symbol: h.company?.symbol,
                                      quantity: q,
                                      avg_cost: c,
                                      buy_date: h.buy_date,
                                      notes: h.notes,
                                    },
                              )
                            }
                          >
                            {isEd ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-red-500"
                            onClick={() => delMut.mutate(h.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isEd && (
                        <TableRow key={`${h.id}-edit`}>
                          <TableCell colSpan={9} className="bg-muted/20">
                            <HoldingEditor
                              initial={editing}
                              onCancel={() => setEditing(null)}
                              onSave={(v) => saveMut.mutate(v)}
                              busy={saveMut.isPending}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </TerminalShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="border border-border rounded p-3 bg-card/40">
      <div className="text-[10px] uppercase mono tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-lg mono mt-1 ${tone === "up" ? "text-emerald-500" : tone === "down" ? "text-red-500" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function HoldingEditor({
  initial,
  onCancel,
  onSave,
  busy,
}: {
  initial: any | null;
  onCancel: () => void;
  onSave: (v: any) => void;
  busy: boolean;
}) {
  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [companyId, setCompanyId] = useState(initial?.company_id ?? "");
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? ""));
  const [avgCost, setAvgCost] = useState(String(initial?.avg_cost ?? ""));
  const [buyDate, setBuyDate] = useState(initial?.buy_date ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lookupErr, setLookupErr] = useState<string | null>(null);

  const isEdit = !!initial?.id;

  async function resolveSymbol() {
    setLookupErr(null);
    const sym = symbol.trim().toUpperCase();
    if (!sym) return null;
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.user?.id ?? "")
      .eq("symbol", sym)
      .maybeSingle();
    if (error) {
      setLookupErr(error.message);
      return null;
    }
    if (!data) {
      setLookupErr("Not in coverage. Add it via Upload first.");
      return null;
    }
    return data.id as string;
  }

  return (
    <div className="grid gap-3 p-3 md:grid-cols-5">
      <div>
        <label className="text-[10px] uppercase mono text-muted-foreground">Symbol</label>
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          disabled={isEdit}
          className="h-8 text-xs mono mt-1"
        />
        {lookupErr && <p className="text-[10px] text-red-500 mt-1">{lookupErr}</p>}
      </div>
      <div>
        <label className="text-[10px] uppercase mono text-muted-foreground">Quantity</label>
        <Input
          type="number"
          step="0.01"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-8 text-xs mono mt-1"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase mono text-muted-foreground">Avg Cost</label>
        <Input
          type="number"
          step="0.01"
          value={avgCost}
          onChange={(e) => setAvgCost(e.target.value)}
          className="h-8 text-xs mono mt-1"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase mono text-muted-foreground">Buy Date</label>
        <Input
          type="date"
          value={buyDate ?? ""}
          onChange={(e) => setBuyDate(e.target.value)}
          className="h-8 text-xs mono mt-1"
        />
      </div>
      <div className="md:col-span-1 flex items-end gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          disabled={busy || !quantity || !avgCost}
          onClick={async () => {
            let cid = companyId;
            if (!cid) {
              const resolved = await resolveSymbol();
              if (!resolved) return;
              cid = resolved;
            }
            onSave({
              company_id: cid,
              quantity: Number(quantity),
              avg_cost: Number(avgCost),
              buy_date: buyDate || null,
              notes: notes || null,
            });
          }}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className="md:col-span-5">
        <label className="text-[10px] uppercase mono text-muted-foreground">Notes</label>
        <Input
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          className="h-8 text-xs mt-1"
        />
      </div>
    </div>
  );
}
