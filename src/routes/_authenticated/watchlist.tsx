import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { TerminalShell } from "@/components/TerminalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Pencil, Trash2, X } from "lucide-react";
import {
  listWatchlist,
  upsertWatchlist,
  removeWatchlist,
  type Conviction,
} from "@/lib/watchlist.functions";

export const Route = createFileRoute("/_authenticated/watchlist")({
  head: () => ({ meta: [{ title: "Watchlist" }] }),
  component: WatchlistPage,
});

const CONVICTIONS: Conviction[] = ["high", "medium", "low", "watch", "avoid"];

const convictionClass: Record<Conviction, string> = {
  high: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  medium: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  low: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  watch: "bg-muted text-muted-foreground border-border",
  avoid: "bg-red-500/15 text-red-500 border-red-500/30",
};

function WatchlistPage() {
  const list = useServerFn(listWatchlist);
  const upsert = useServerFn(upsertWatchlist);
  const remove = useServerFn(removeWatchlist);
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => list(),
  });

  const [editing, setEditing] = useState<string | null>(null);

  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  const saveMut = useMutation({
    mutationFn: (input: Parameters<typeof upsert>[0]["data"]) =>
      upsert({ data: input }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  return (
    <TerminalShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h1 className="text-lg mono uppercase tracking-wider text-primary">
            Watchlist
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Conviction-tagged positions with target price & thesis.
          </p>
        </div>

        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="border border-border rounded p-8 text-center text-xs text-muted-foreground">
            No watchlist entries yet. Open a company page and tag it.
          </div>
        ) : (
          <div className="border border-border rounded overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px] uppercase mono tracking-wider">
                  <TableHead>Symbol</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Conviction</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Upside</TableHead>
                  <TableHead>Thesis</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row: any) => {
                  const price = row.company?.current_price;
                  const tgt = row.target_price;
                  const upside = price && tgt ? ((tgt - price) / price) * 100 : null;
                  const isEditing = editing === row.id;
                  return (
                    <>
                      <TableRow key={row.id} className="text-xs">
                        <TableCell className="mono">
                          <Link
                            to="/company/$symbol"
                            params={{ symbol: row.company?.symbol }}
                            className="text-primary hover:underline"
                          >
                            {row.company?.symbol}
                          </Link>
                          <div className="text-[10px] text-muted-foreground">
                            {row.company?.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.company?.sector ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${convictionClass[row.conviction as Conviction]} text-[10px] uppercase mono`}
                          >
                            {row.conviction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right mono">
                          {price ? price.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-right mono">
                          {tgt ? Number(tgt).toFixed(2) : "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right mono ${upside == null ? "" : upside >= 0 ? "text-emerald-500" : "text-red-500"}`}
                        >
                          {upside == null ? "—" : `${upside.toFixed(1)}%`}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {row.thesis ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => setEditing(isEditing ? null : row.id)}
                          >
                            {isEditing ? (
                              <X className="size-3.5" />
                            ) : (
                              <Pencil className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-red-500"
                            onClick={() => removeMut.mutate(row.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isEditing && (
                        <TableRow key={`${row.id}-edit`}>
                          <TableCell colSpan={8} className="bg-muted/20">
                            <EditRow
                              initial={{
                                company_id: row.company?.id,
                                conviction: row.conviction,
                                target_price: row.target_price,
                                thesis: row.thesis,
                                notes: row.notes,
                              }}
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

function EditRow({
  initial,
  onSave,
  busy,
}: {
  initial: {
    company_id: string;
    conviction: Conviction;
    target_price: number | null;
    thesis: string | null;
    notes: string | null;
  };
  onSave: (v: {
    company_id: string;
    conviction: Conviction;
    target_price?: number | null;
    thesis?: string | null;
    notes?: string | null;
  }) => void;
  busy: boolean;
}) {
  const [conviction, setConviction] = useState<Conviction>(initial.conviction);
  const [target, setTarget] = useState<string>(
    initial.target_price != null ? String(initial.target_price) : "",
  );
  const [thesis, setThesis] = useState<string>(initial.thesis ?? "");
  const [notes, setNotes] = useState<string>(initial.notes ?? "");

  return (
    <div className="grid gap-3 p-3 md:grid-cols-4">
      <div>
        <label className="text-[10px] uppercase mono text-muted-foreground">
          Conviction
        </label>
        <Select value={conviction} onValueChange={(v) => setConviction(v as Conviction)}>
          <SelectTrigger className="h-8 text-xs mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONVICTIONS.map((c) => (
              <SelectItem key={c} value={c} className="text-xs uppercase mono">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-[10px] uppercase mono text-muted-foreground">
          Target Price
        </label>
        <Input
          type="number"
          step="0.01"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="h-8 text-xs mt-1 mono"
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-[10px] uppercase mono text-muted-foreground">
          Thesis
        </label>
        <Input
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          className="h-8 text-xs mt-1"
        />
      </div>
      <div className="md:col-span-4">
        <label className="text-[10px] uppercase mono text-muted-foreground">
          Notes
        </label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="text-xs mt-1"
        />
      </div>
      <div className="md:col-span-4 flex justify-end">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            onSave({
              company_id: initial.company_id,
              conviction,
              target_price: target ? Number(target) : null,
              thesis: thesis || null,
              notes: notes || null,
            })
          }
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
