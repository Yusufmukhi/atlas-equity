import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bookmark } from "lucide-react";
import {
  listWatchlist,
  upsertWatchlist,
  removeWatchlist,
  type Conviction,
} from "@/lib/watchlist.functions";

const CONVICTIONS: Conviction[] = ["high", "medium", "low", "watch", "avoid"];

const convictionClass: Record<Conviction, string> = {
  high: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  medium: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  low: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  watch: "bg-muted text-muted-foreground border-border",
  avoid: "bg-red-500/15 text-red-500 border-red-500/30",
};

export function WatchlistTag({ companyId }: { companyId: string }) {
  const list = useServerFn(listWatchlist);
  const upsert = useServerFn(upsertWatchlist);
  const remove = useServerFn(removeWatchlist);
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => list(),
  });

  const existing = (data as any[]).find((r) => r.company?.id === companyId);
  const [open, setOpen] = useState(false);
  const [conviction, setConviction] = useState<Conviction>("watch");
  const [target, setTarget] = useState("");
  const [thesis, setThesis] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (existing) {
      setConviction(existing.conviction);
      setTarget(existing.target_price != null ? String(existing.target_price) : "");
      setThesis(existing.thesis ?? "");
      setNotes(existing.notes ?? "");
    }
  }, [existing?.id]);

  const saveMut = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          company_id: companyId,
          conviction,
          target_price: target ? Number(target) : null,
          thesis: thesis || null,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Saved to watchlist");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  const removeMut = useMutation({
    mutationFn: () => remove({ data: { id: existing!.id } }),
    onSuccess: () => {
      toast.success("Removed");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Bookmark className="size-3.5 mr-1.5" />
        {existing ? (
          <Badge
            variant="outline"
            className={`${convictionClass[existing.conviction as Conviction]} text-[10px] uppercase mono border-0 px-1.5`}
          >
            {existing.conviction}
          </Badge>
        ) : (
          "Add to watchlist"
        )}
      </Button>
    );
  }

  return (
    <div className="border border-border rounded-md p-3 bg-card w-80 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase mono text-muted-foreground">
          Watchlist tag
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          close
        </button>
      </div>
      <Select value={conviction} onValueChange={(v) => setConviction(v as Conviction)}>
        <SelectTrigger className="h-8 text-xs">
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
      <Input
        type="number"
        step="0.01"
        placeholder="Target price"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="h-8 text-xs mono"
      />
      <Input
        placeholder="Thesis (one-liner)"
        value={thesis}
        onChange={(e) => setThesis(e.target.value)}
        className="h-8 text-xs"
      />
      <Textarea
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="text-xs"
      />
      <div className="flex gap-2 justify-end">
        {existing && (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-500"
            onClick={() => removeMut.mutate()}
          >
            Remove
          </Button>
        )}
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
