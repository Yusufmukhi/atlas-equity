import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { TerminalShell } from "@/components/TerminalShell";
import { listCompanies, upsertCompany } from "@/lib/companies.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, ArrowRight, Building2 } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/ratios";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Research Workspace" },
      { name: "description", content: "Your covered companies and active research notes." },
    ],
  }),
  loader: async ({ context }) => {
    const fn = useServerFn(listCompanies);
    void fn;
    return context.queryClient.ensureQueryData({
      queryKey: ["companies"],
      queryFn: () => listCompanies(),
    });
  },
  component: Dashboard,
});

function Dashboard() {
  const { data: companies } = useSuspenseQuery({
    queryKey: ["companies"],
    queryFn: () => listCompanies(),
  });
  const qc = useQueryClient();
  const upsert = useServerFn(upsertCompany);
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");

  const m = useMutation({
    mutationFn: (vars: { symbol: string; name: string; sector?: string }) =>
      upsert({ data: vars }),
    onSuccess: () => {
      toast.success("Company added");
      qc.invalidateQueries({ queryKey: ["companies"] });
      setOpen(false);
      setSymbol("");
      setName("");
      setSector("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <TerminalShell>
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Coverage Universe</h1>
            <p className="text-xs text-muted-foreground mt-1 mono uppercase tracking-wider">
              {companies.length} {companies.length === 1 ? "company" : "companies"} under research
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="mono uppercase tracking-wider">
                <Plus className="size-4 mr-1" /> Add Company
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add company to coverage</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  m.mutate({ symbol, name, sector: sector || undefined });
                }}
                className="space-y-3"
              >
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">NSE Symbol</Label>
                  <Input
                    required
                    maxLength={20}
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="TATASTEEL"
                    className="mono"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Company name</Label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tata Steel Ltd" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sector (optional)</Label>
                  <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Metals & Mining" />
                </div>
                <Button type="submit" className="w-full" disabled={m.isPending}>
                  {m.isPending ? "Adding..." : "Add"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {companies.length === 0 ? (
          <div className="panel p-12 text-center">
            <Building2 className="size-10 mx-auto text-muted-foreground mb-3" strokeWidth={1.5} />
            <h3 className="text-lg font-medium">No companies yet</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Add an NSE/BSE listed company to begin building your research file.
            </p>
            <Button onClick={() => setOpen(true)} variant="outline">
              <Plus className="size-4 mr-1" /> Add first company
            </Button>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="panel-header">
              <span>Coverage</span>
              <span>Updated</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Symbol</th>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Sector</th>
                  <th className="text-right px-4 py-2 font-medium">Mkt Cap (Cr)</th>
                  <th className="text-right px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/60 last:border-0 hover:bg-secondary/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="ticker-chip">{c.symbol}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.sector ?? "—"}</td>
                    <td className="px-4 py-3 text-right mono">{fmtNum(c.market_cap_crore)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to="/company/$symbol"
                        params={{ symbol: c.symbol }}
                        className="text-primary text-xs uppercase tracking-wider inline-flex items-center gap-1 hover:underline"
                      >
                        Open <ArrowRight className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </TerminalShell>
  );
}
