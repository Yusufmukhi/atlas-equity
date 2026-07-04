import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCompanyDocuments, askConcall, deleteDocument } from "@/lib/documents.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, MessageSquare, FileText, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";


type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ n: number; title: string; chunk: number }>;
};

export function ConcallChat({ companyId, companySymbol }: { companyId: string; companySymbol: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCompanyDocuments);
  const askFn = useServerFn(askConcall);
  const delFn = useServerFn(deleteDocument);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["documents", companyId],
    queryFn: () => listFn({ data: { company_id: companyId } }),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      setMessages((m) => [...m, { role: "assistant", content: res.answer, sources: res.sources }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to answer");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return <Skeleton className="h-64" />;

  const concalls = (docs ?? []).filter((d) => d.kind === "concall" || d.kind === "annual_report" || d.kind === "presentation");

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4">
      {/* Doc picker */}
      <div className="panel">
        <div className="panel-header"><span>Documents</span></div>
        <div className="p-3 space-y-2 max-h-[520px] overflow-auto">
          {concalls.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">
              <FileText className="size-6 mx-auto mb-2 opacity-50" />
              No concall / annual report PDFs.<br />
              Upload from the <b>Upload</b> page.
            </div>
          ) : (
            concalls.map((d) => (
              <label key={d.id} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-secondary/50 rounded p-2">
                <input
                  type="checkbox"
                  checked={selected.has(d.id)}
                  onChange={() => toggle(d.id)}
                  className="mt-0.5 accent-primary"
                />
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.title}</div>
                  <div className="text-[10px] uppercase text-muted-foreground mt-0.5">
                    {d.kind}
                    {d.fiscal_year ? ` · FY${d.fiscal_year}` : ""}
                    {d.period ? ` · ${d.period}` : ""}
                  </div>
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="panel flex flex-col min-h-[520px]">
        <div className="panel-header">
          <span className="flex items-center gap-2"><MessageSquare className="size-3" /> Q&amp;A · {companySymbol}</span>
          <span className="text-[10px] text-muted-foreground">{selected.size} selected</span>
        </div>
        <div className="flex-1 p-4 space-y-4 overflow-auto">
          {messages.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-10">
              Select concall/annual report documents and ask a question.<br />
              e.g. <i>"What is management's FY26 revenue guidance?"</i>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={
                  m.role === "user"
                    ? "inline-block bg-primary/10 text-primary px-3 py-2 rounded text-sm max-w-[85%]"
                    : "bg-secondary/50 px-3 py-2 rounded text-sm whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 text-[10px] text-muted-foreground space-y-0.5">
                  {m.sources.slice(0, 8).map((s) => (
                    <div key={s.n}>[{s.n}] {s.title} · chunk {s.chunk}</div>
                  ))}
                </div>
              )}
            </div>
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
  );
}
