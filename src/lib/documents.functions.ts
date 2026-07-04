// Document upload + RAG (extract → chunk → embed → pgvector → similarity search → LLM).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims (fits pgvector HNSW)
const CHAT_MODEL = "google/gemini-3-flash-preview";
const CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 150;

async function extractPdfText(fileBase64: string, mimeType: string, filename: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the full readable text content of this document. Preserve section headings, tables (as plain text), speaker names and numeric data. Return ONLY the extracted text, no commentary.",
            },
            {
              type: "file",
              file: { filename, file_data: `data:${mimeType};base64,${fileBase64}` },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gateway extraction failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("Gateway returned empty extraction");
  return text;
}

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + CHUNK_CHARS, clean.length);
    // try to end on a paragraph/sentence boundary
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const nl = slice.lastIndexOf("\n\n");
      const dot = slice.lastIndexOf(". ");
      const cut = Math.max(nl, dot);
      if (cut > CHUNK_CHARS * 0.5) end = i + cut + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = Math.max(end - CHUNK_OVERLAP, i + 1);
  }
  return chunks.filter((c) => c.length > 30);
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const out: number[][] = [];
  const BATCH = 64;
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { data?: Array<{ embedding: number[]; index: number }> };
    const rows = (json.data ?? []).sort((a, b) => a.index - b.index).map((r) => r.embedding);
    if (rows.length !== batch.length) throw new Error("Embedding count mismatch");
    out.push(...rows);
  }
  return out;
}

// pgvector wants a string literal like "[0.1,0.2,...]"
function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

async function indexDocument(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  doc: { id: string; company_id: string; user_id: string; title: string; extracted_text: string },
) {
  const chunks = chunkText(doc.extracted_text);
  if (chunks.length === 0) return 0;
  const embeddings = await embedBatch(chunks);
  await supabase.from("document_chunks").delete().eq("document_id", doc.id);
  const rows = chunks.map((content, idx) => ({
    document_id: doc.id,
    company_id: doc.company_id,
    user_id: doc.user_id,
    chunk_index: idx,
    content,
    embedding: toVectorLiteral(embeddings[idx]),
  }));
  const CHUNK_INSERT = 100;
  for (let i = 0; i < rows.length; i += CHUNK_INSERT) {
    const { error } = await supabase.from("document_chunks").insert(rows.slice(i, i + CHUNK_INSERT));
    if (error) throw new Error(`Chunk insert failed: ${error.message}`);
  }
  return chunks.length;
}

const Input = z.object({
  company_id: z.string().uuid(),
  kind: z.enum(["annual_report", "concall", "presentation", "quarterly_result", "credit_rating", "other"]),
  title: z.string().min(1).max(300),
  fiscal_year: z.number().int().optional(),
  period: z.string().max(20).optional(),
  mime_type: z.string().max(100),
  file_base64: z.string().min(1),
});

export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const isPdf = data.mime_type === "application/pdf";
    const isText = data.mime_type.startsWith("text/") || data.mime_type === "application/json";

    const bytes = Uint8Array.from(atob(data.file_base64), (c) => c.charCodeAt(0));
    const filename = `${Date.now()}_${data.title.replace(/[^a-z0-9.-]/gi, "_").slice(0, 60)}`;
    const filePath = `${userId}/${data.company_id}/${filename}`;
    const { error: upErr } = await supabase.storage
      .from("research-docs")
      .upload(filePath, bytes, { contentType: data.mime_type, upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    let extracted = "";
    if (isText) extracted = new TextDecoder().decode(bytes);
    else if (isPdf) extracted = await extractPdfText(data.file_base64, data.mime_type, data.title);

    const { data: row, error } = await supabase
      .from("documents")
      .insert({
        user_id: userId,
        company_id: data.company_id,
        kind: data.kind,
        title: data.title,
        fiscal_year: data.fiscal_year,
        period: data.period,
        file_path: filePath,
        mime_type: data.mime_type,
        extracted_text: extracted,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Build RAG index (chunk + embed + store vectors)
    let chunkCount = 0;
    if (extracted.trim().length > 30) {
      try {
        chunkCount = await indexDocument(supabase, {
          id: row.id,
          company_id: data.company_id,
          user_id: userId,
          title: data.title,
          extracted_text: extracted,
        });
      } catch (e) {
        console.error("Indexing failed:", e);
      }
    }
    return { ...row, chunk_count: chunkCount };
  });

export const listCompanyDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("documents")
      .select("id, kind, title, fiscal_year, period, mime_type, created_at")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AskInput = z.object({
  company_id: z.string().uuid(),
  question: z.string().min(3).max(2000),
  document_ids: z.array(z.string().uuid()).min(1).max(5),
});

export const askConcall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AskInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: docs, error } = await supabase
      .from("documents")
      .select("id, title, kind, fiscal_year, period, extracted_text, file_path, mime_type")
      .eq("company_id", data.company_id)
      .in("id", data.document_ids);
    if (error) throw new Error(error.message);
    if (!docs || docs.length === 0) throw new Error("No documents selected");

    // Lazy backfill: ensure each doc has extracted text AND chunks with embeddings
    for (const d of docs) {
      // 1) Re-extract if extracted_text empty
      if ((!d.extracted_text || d.extracted_text.trim().length < 20) && d.file_path && d.mime_type === "application/pdf") {
        try {
          const { data: blob, error: dlErr } = await supabase.storage.from("research-docs").download(d.file_path);
          if (dlErr || !blob) continue;
          const buf = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
          const b64 = btoa(binary);
          const text = await extractPdfText(b64, d.mime_type, d.title);
          d.extracted_text = text;
          await supabase.from("documents").update({ extracted_text: text }).eq("id", d.id);
        } catch (e) {
          console.error("re-extract failed for", d.id, e);
        }
      }
      // 2) Ensure chunks exist
      const { count } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", d.id);
      if ((count ?? 0) === 0 && d.extracted_text && d.extracted_text.trim().length > 30) {
        try {
          await indexDocument(supabase, {
            id: d.id,
            company_id: data.company_id,
            user_id: userId,
            title: d.title,
            extracted_text: d.extracted_text,
          });
        } catch (e) {
          console.error("index failed for", d.id, e);
        }
      }
    }

    // Embed the question and run vector similarity search
    const [qEmbed] = await embedBatch([data.question]);
    const { data: matches, error: matchErr } = await supabase.rpc("match_document_chunks", {
      query_embedding: toVectorLiteral(qEmbed) as never,
      doc_ids: data.document_ids,
      match_count: 12,
    });
    if (matchErr) throw new Error(`Vector search failed: ${matchErr.message}`);
    if (!matches || matches.length === 0) {
      throw new Error("No indexed content found for selected documents. Try re-uploading the PDF.");
    }

    const titleById = new Map(docs.map((d) => [d.id, `${d.title}${d.period ? ` (${d.period})` : ""}`]));
    const top = matches as Array<{ document_id: string; chunk_index: number; content: string; similarity: number }>;

    const context_text = top
      .map(
        (c, i) =>
          `[[${i + 1}]] Source: ${titleById.get(c.document_id) ?? "Document"} — chunk ${c.chunk_index} (sim ${c.similarity.toFixed(3)})\n${c.content}`,
      )
      .join("\n\n---\n\n");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(apiKey);

    const system = `You are an equity research analyst answering questions grounded ONLY in the provided excerpts. Rules:
- Base every claim on the excerpts. If the answer is not present, say "Not found in the provided documents."
- Cite excerpts inline using bracket markers like [1], [2] matching the [[n]] source labels.
- Be concise, structured (bullets when useful), and quote exact figures when available.
- Do not invent numbers, guidance, or names.`;

    const result = await generateText({
      model: gateway(CHAT_MODEL),
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Question: ${data.question}\n\n=== SOURCE EXCERPTS ===\n${context_text}` },
      ],
    });

    return {
      answer: result.text,
      sources: top.map((c, i) => ({
        n: i + 1,
        docId: c.document_id,
        title: titleById.get(c.document_id) ?? "Document",
        chunk: c.chunk_index,
      })),
    };
  });
