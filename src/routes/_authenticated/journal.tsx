import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Plus, Search, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  listNotes,
  upsertNote,
  deleteNote,
  type NoteKind,
} from "@/lib/notes.functions";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({ meta: [{ title: "Research Journal" }] }),
  component: JournalPage,
});

const KINDS: NoteKind[] = ["thesis", "risk", "catalyst", "question", "observation"];

const kindClass: Record<NoteKind, string> = {
  thesis: "bg-primary/15 text-primary border-primary/30",
  risk: "bg-red-500/15 text-red-500 border-red-500/30",
  catalyst: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  question: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  observation: "bg-muted text-muted-foreground border-border",
};

function JournalPage() {
  const list = useServerFn(listNotes);
  const save = useServerFn(upsertNote);
  const del = useServerFn(deleteNote);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<NoteKind | "all">("all");
  const [editing, setEditing] = useState<any | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["notes", search, kindFilter],
    queryFn: () =>
      list({
        data: {
          search: search || undefined,
          kind: kindFilter === "all" ? undefined : kindFilter,
        },
      }),
  });

  const saveMut = useMutation({
    mutationFn: (input: Parameters<typeof save>[0]["data"]) => save({ data: input }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.length };
    for (const k of KINDS) c[k] = 0;
    for (const n of data) c[n.kind] = (c[n.kind] ?? 0) + 1;
    return c;
  }, [data]);

  return (
    <TerminalShell>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h1 className="text-lg mono uppercase tracking-wider text-primary">
              Research Journal
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Timestamped notes across your coverage. Tag as thesis, risk, catalyst, question, observation.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setEditing({ kind: "observation", title: "", body: "", tags: [], company_id: null })
            }
          >
            <Plus className="size-3.5 mr-1" /> New note
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or body…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", ...KINDS] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKindFilter(k as any)}
                className={`px-2 py-1 text-[10px] mono uppercase tracking-wider rounded border ${
                  kindFilter === k
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {k} · {counts[k] ?? 0}
              </button>
            ))}
          </div>
        </div>

        {editing && (
          <div className="border border-primary/30 rounded p-4 mb-4 bg-card/40">
            <NoteEditor
              initial={editing}
              onCancel={() => setEditing(null)}
              onSave={(v) => saveMut.mutate(v)}
              busy={saveMut.isPending}
            />
          </div>
        )}

        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="border border-border rounded p-8 text-center text-xs text-muted-foreground">
            No notes yet. Start writing what you see.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.map((n: any) => (
              <div key={n.id} className="border border-border rounded p-3 bg-card/40">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`${kindClass[n.kind as NoteKind]} text-[10px] uppercase mono`}
                    >
                      {n.kind}
                    </Badge>
                    {n.company?.symbol && (
                      <Link
                        to="/company/$symbol"
                        params={{ symbol: n.company.symbol }}
                        className="text-[10px] mono text-primary hover:underline"
                      >
                        {n.company.symbol}
                      </Link>
                    )}
                    <span className="text-[10px] mono text-muted-foreground">
                      {new Date(n.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      onClick={() =>
                        setEditing({
                          id: n.id,
                          kind: n.kind,
                          title: n.title,
                          body: n.body,
                          tags: n.tags ?? [],
                          company_id: n.company_id,
                        })
                      }
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6 text-red-500"
                      onClick={() => delMut.mutate(n.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
                <div className="text-sm font-medium mb-1">{n.title}</div>
                {n.body && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{n.body}</p>
                )}
                {n.tags?.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {n.tags.map((t: string) => (
                      <span
                        key={t}
                        className="text-[10px] mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </TerminalShell>
  );
}

function NoteEditor({
  initial,
  onCancel,
  onSave,
  busy,
}: {
  initial: {
    id?: string;
    kind: NoteKind;
    title: string;
    body: string | null;
    tags: string[];
    company_id: string | null;
  };
  onCancel: () => void;
  onSave: (v: any) => void;
  busy: boolean;
}) {
  const [kind, setKind] = useState<NoteKind>(initial.kind);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body ?? "");
  const [tags, setTags] = useState((initial.tags ?? []).join(", "));

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase mono tracking-wider text-muted-foreground">
          {initial.id ? "Edit note" : "New note"}
        </span>
        <Button size="icon" variant="ghost" className="size-6" onClick={onCancel}>
          <X className="size-3" />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[160px_1fr]">
        <Select value={kind} onValueChange={(v) => setKind(v as NoteKind)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k} className="text-xs uppercase mono">
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="h-8 text-xs"
        />
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Body… cite ratios or documents where relevant."
        className="text-xs"
      />
      <Input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags (comma separated)"
        className="h-8 text-xs"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={busy || !title.trim()}
          onClick={() =>
            onSave({
              id: initial.id,
              company_id: initial.company_id,
              kind,
              title: title.trim(),
              body: body.trim() || null,
              tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
