import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCompanyDocuments, askConcall, deleteDocument, generateDocumentSummary } from "@/lib/documents.functions";
import { upsertNote } from "@/lib/notes.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, MessageSquare, FileText, Send, Trash2, Sparkles, BookmarkPlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Source = { n: number; docId: string; title: string; chunk: number; content: string; similarity: number };

type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  question?: string;
};

type CitePayload = { source: Source; msgQuestion?: string };

export function ConcallChat({ companyId, companySymbol }: { companyId: string; companySymbol: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCompanyDocuments);
  const askFn = useServerFn(askConcall);
  const delFn = useServerFn(deleteDocument);
  const summarizeFn = useServerFn(generateDocumentSummary);
  const noteFn = useServerFn(upsertNote);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["documents", companyId],
    queryFn: () => listFn({ data: { company_id: companyId } }),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [cite, setCite] = useState<CitePayload | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const summarizeMut = useMutation({
    mutationFn: (payload: { id: string; force?: boolean }) => summarizeFn({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", companyId] });
      toast.success("Summary ready");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Summary failed"),
    onSettled: () => setSummarizingId(null),
  });

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This removes the document and its embeddings.`)) return;
    setDeletingId(id);
    try {
      await delFn({ data: { id } });
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      qc.invalidateQueries({ queryKey: ["documents", companyId] });
      toast.success("Document deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = async () => {
    if (!question.trim()) return;
    if (selected.size === 0) {
      toast.error("Select at least one document");
      return;
    }
    const q = question.trim();
    setMessages((m) => [...m, { role: "user", content: q }]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await askFn({
        data: { company_id: companyId, question: q, document_ids: Array.from(selected) },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.answer, sources: res.sources, question: q }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to answer");
    } finally {
      setLoading(false);
    }
  };

  const openCite = (source: Source, msgQuestion?: string) => {
    setCite({ source, msgQuestion });
    setNoteTitle(msgQuestion ? msgQuestion.slice(0, 120) : `Excerpt from ${source.title}`);
  };

  const saveCiteAsNote = async () => {
    if (!cite) return;
    setSavingNote(true);
    try {
      const body = `> ${cite.source.content.replace(/\n/g, "\n> ")}\n\n**Source:** ${cite.source.title} · chunk ${cite.source.chunk} (similarity ${cite.source.similarity.toFixed(3)})${cite.msgQuestion ? `\n\n**Original question:** ${cite.msgQuestion}` : ""}`;
      await noteFn({
        data: {
          company_id: companyId,
          kind: "observation",
          title: noteTitle.trim() || `Excerpt from ${cite.source.title}`,
          body,
          tags: ["citation", cite.source.title.split(" ")[0]].filter(Boolean),
        },
      });
      toast.success("Saved to journal");
      setCite(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  if (isLoading) return <Skeleton className="h-64" />;

  const allDocs = docs ?? [];
  const selectedDocs = allDocs.filter((d) => selected.has(d.id));
  const singleSelected = selectedDocs.length === 1 ? selectedDocs[0] : null;

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4">
      {/* Doc picker */}
      <div className="panel">
        <div className="panel-header">
          <span>Documents</span>
          <span className="text-[10px] text-muted-foreground">{allDocs.length}</span>
        </div>
        <div className="p-3 space-y-2 max-h-[520px] overflow-auto">
          {allDocs.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">
              <FileText className="size-6 mx-auto mb-2 opacity-50" />
              No documents yet.<br />
              Upload from the <b>Upload</b> page.
            </div>
          ) : (
            allDocs.map((d) => (
              <div key={d.id} className="flex items-start gap-2 text-xs hover:bg-secondary/50 rounded p-2 group">
                <input
                  id={`doc-${d.id}`}
                  type="checkbox"
                  checked={selected.has(d.id)}
                  onChange={() => toggle(d.id)}
                  className="mt-0.5 accent-primary cursor-pointer"
                />
                <label htmlFor={`doc-${d.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <div className="font-medium truncate flex items-center gap-1">
                    {d.title}
                    {d.summary && <Sparkles className="size-2.5 text-primary shrink-0" />}
                  </div>
                  <div className="text-[10px] uppercase text-muted-foreground mt-0.5">
                    {d.kind}
                    {d.fiscal_year ? ` · FY${String(d.fiscal_year).slice(-2)}` : ""}
                    {d.period ? ` · ${d.period}` : ""}
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => handleDelete(d.id, d.title)}
                  disabled={deletingId === d.id}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                  aria-label="Delete document"
                >
                  {deletingId === d.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat + Summary */}
      <div className="space-y-3 min-w-0">
        {singleSelected && (
          <SummaryPanel
            doc={singleSelected}
            loading={summarizingId === singleSelected.id || (summarizeMut.isPending && summarizeMut.variables?.id === singleSelected.id)}
            onGenerate={(force) => {
              setSummarizingId(singleSelected.id);
              summarizeMut.mutate({ id: singleSelected.id, force });
            }}
          />
        )}

        <div className="panel flex flex-col min-h-[420px]">
          <div className="panel-header">
            <span className="flex items-center gap-2"><MessageSquare className="size-3" /> Q&amp;A · {companySymbol}</span>
            <span className="text-[10px] text-muted-foreground">{selected.size} selected</span>
          </div>
          <div className="flex-1 p-4 space-y-4 overflow-auto">
            {messages.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-10">
                Select documents and ask a question. Click any [n] citation to save the excerpt to your journal.<br />
                e.g. <i>"What is management's FY26 revenue guidance?"</i>
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} onCite={openCite} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Analyzing excerpts…
              </div>
            )}
          </div>
          <div className="border-t border-border p-3 flex gap-2">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question grounded in the selected documents…"
              className="min-h-[44px] max-h-32 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <Button onClick={submit} disabled={loading || !question.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Citation → Save-as-note dialog */}
      <Dialog open={!!cite} onOpenChange={(o) => !o && setCite(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookmarkPlus className="size-4" /> Save excerpt to journal</DialogTitle>
            <DialogDescription>
              From <b>{cite?.source.title}</b> · chunk {cite?.source.chunk}
            </DialogDescription>
          </DialogHeader>
          {cite && (
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Note title</label>
                <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Excerpt</label>
                <div className="mt-1 p-3 bg-secondary/40 border border-border rounded text-xs leading-relaxed max-h-64 overflow-auto whitespace-pre-wrap font-mono">
                  {cite.source.content}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCite(null)}>Cancel</Button>
            <Button onClick={saveCiteAsNote} disabled={savingNote || !noteTitle.trim()}>
              {savingNote ? <Loader2 className="size-4 mr-1 animate-spin" /> : <BookmarkPlus className="size-4 mr-1" />}
              Save to journal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryPanel({
  doc,
  loading,
  onGenerate,
}: {
  doc: { id: string; title: string; summary: { tldr: string[]; guidance: Array<{ metric: string; value: string; period?: string }>; risks: string[] } | null };
  loading: boolean;
  onGenerate: (force: boolean) => void;
}) {
  if (!doc.summary) {
    return (
      <div className="panel p-4 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          No AI summary yet for <b>{doc.title}</b>. Older uploads don't have one.
        </div>
        <Button size="sm" variant="outline" onClick={() => onGenerate(false)} disabled={loading}>
          {loading ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Sparkles className="size-3 mr-1" />}
          Generate summary
        </Button>
      </div>
    );
  }
  const s = doc.summary;
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="flex items-center gap-2"><Sparkles className="size-3 text-primary" /> AI Summary · {doc.title}</span>
        <button
          type="button"
          onClick={() => onGenerate(true)}
          disabled={loading}
          className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
        >
          {loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Regenerate
        </button>
      </div>
      <div className="p-4 space-y-4 text-sm">
        {s.tldr.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1.5">TL;DR</div>
            <ul className="space-y-1 list-disc list-inside marker:text-muted-foreground">
              {s.tldr.map((b, i) => <li key={i} className="leading-relaxed">{b}</li>)}
            </ul>
          </div>
        )}
        {s.guidance.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1.5">Guidance</div>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="text-left py-1 font-medium">Metric</th>
                  <th className="text-left py-1 font-medium">Value</th>
                  <th className="text-left py-1 font-medium">Period</th>
                </tr>
              </thead>
              <tbody>
                {s.guidance.map((g, i) => (
                  <tr key={i} className="border-b border-border/30 last:border-0">
                    <td className="py-1 pr-2">{g.metric}</td>
                    <td className="py-1 pr-2 mono text-primary">{g.value}</td>
                    <td className="py-1 mono text-muted-foreground">{g.period ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {s.risks.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1.5">Risks</div>
            <ul className="space-y-1 list-disc list-inside marker:text-destructive/70">
              {s.risks.map((r, i) => <li key={i} className="leading-relaxed text-muted-foreground">{r}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg, onCite }: { msg: Msg; onCite: (s: Source, q?: string) => void }) {
  // Parse [n] citations in assistant content -> replace with clickable markers.
  // We render markdown normally, then post-process by injecting a components override for text nodes.
  const sourceMap = useMemo(() => {
    const m = new Map<number, Source>();
    (msg.sources ?? []).forEach((s) => m.set(s.n, s));
    return m;
  }, [msg.sources]);

  if (msg.role === "user") {
    return (
      <div className="text-right">
        <div className="inline-block bg-primary/10 text-primary px-3 py-2 rounded text-sm max-w-[85%]">
          {msg.content}
        </div>
      </div>
    );
  }

  const renderTextWithCitations = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const re = /\[(\d+)\]/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) parts.push(text.slice(last, match.index));
      const n = parseInt(match[1], 10);
      const src = sourceMap.get(n);
      if (src) {
        parts.push(
          <button
            key={`${match.index}-${n}`}
            type="button"
            onClick={() => onCite(src, msg.question)}
            className="inline-flex items-center align-baseline text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded px-1 mx-0.5 cursor-pointer transition"
            title={`Click to save excerpt from ${src.title}`}
          >
            {n}
          </button>,
        );
      } else {
        parts.push(match[0]);
      }
      last = re.lastIndex;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  return (
    <div>
      <div className="bg-secondary/40 border border-border/50 px-4 py-3 rounded-md text-sm max-w-none prose prose-sm prose-invert prose-headings:mt-3 prose-headings:mb-2 prose-headings:font-semibold prose-h3:text-sm prose-h3:uppercase prose-h3:tracking-wide prose-h3:text-primary prose-p:my-1.5 prose-p:leading-relaxed prose-ul:my-1.5 prose-ul:pl-4 prose-li:my-0.5 prose-li:marker:text-muted-foreground prose-strong:text-foreground prose-strong:font-semibold prose-code:text-primary prose-code:bg-secondary prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Wrap raw text nodes to inject citation buttons
            p: ({ children }) => <p>{renderChildren(children, renderTextWithCitations)}</p>,
            li: ({ children }) => <li>{renderChildren(children, renderTextWithCitations)}</li>,
          }}
        >
          {msg.content}
        </ReactMarkdown>
      </div>
      {msg.sources && msg.sources.length > 0 && (
        <div className="mt-2 text-[10px] text-muted-foreground space-y-0.5">
          {msg.sources.slice(0, 8).map((s) => (
            <div key={s.n} className="flex items-start gap-1">
              <button
                type="button"
                onClick={() => onCite(s, msg.question)}
                className="text-primary hover:underline"
              >
                [{s.n}]
              </button>
              <span>{s.title} · chunk {s.chunk}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Recursively walk react children, applying textFn to string nodes.
function renderChildren(children: React.ReactNode, textFn: (t: string) => React.ReactNode): React.ReactNode {
  if (typeof children === "string") return textFn(children);
  if (Array.isArray(children)) {
    return children.map((c, i) => {
      if (typeof c === "string") return <span key={i}>{textFn(c)}</span>;
      return c;
    });
  }
  return children;
}
