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

const KindEnum = z.enum(["annual_report", "concall", "presentation", "quarterly_result", "credit_rating", "other"]);

const Input = z.object({
  company_id: z.string().uuid(),
  kind: KindEnum.optional(),
  title: z.string().min(1).max(300).optional(),
  fiscal_year: z.number().int().optional(),
  period: z.string().max(20).optional(),
  mime_type: z.string().max(100),
  filename: z.string().max(300).optional(),
  file_base64: z.string().min(1),
  auto_classify: z.boolean().default(true),
});

const KIND_LABEL: Record<z.infer<typeof KindEnum>, string> = {
  annual_report: "Annual Report",
  concall: "Concall Transcript",
  presentation: "Investor Presentation",
  quarterly_result: "Quarterly Result",
  credit_rating: "Credit Rating",
  other: "Document",
};

type Classified = {
  kind: z.infer<typeof KindEnum>;
  title: string;
  fiscal_year?: number;
  period?: string;
};

async function classifyDocument(sampleText: string, filename: string): Promise<Classified> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const gateway = createLovableAiGatewayProvider(apiKey);
  const sample = sampleText.slice(0, 4000);
  const prompt = `You classify Indian equity research documents. Given a filename and a text sample, output ONLY compact JSON (no markdown fences) with keys:
- kind: one of ${Object.keys(KIND_LABEL).join(", ")}
- title: short human title (e.g. "Annual Report FY2026", "Concall Transcript Q4 FY26", "Investor Presentation Q2 FY25", "Credit Rating Report")
- fiscal_year: Indian fiscal year end as integer YYYY (e.g. 2026 for FY26) or null
- period: quarter like "Q1", "Q2", "Q3", "Q4", "H1", "H2", or null

Rules:
- Annual reports → kind=annual_report, period=null.
- Concall / earnings call / transcript → kind=concall.
- Investor / analyst deck → kind=presentation.
- Quarterly results / financial results release → kind=quarterly_result.
- Credit rating (CRISIL / ICRA / CARE / India Ratings) → kind=credit_rating.
- Otherwise → kind=other.
- Detect fiscal year from strings like FY2026, FY26, 2025-26, year ended March 31 2026.

FILENAME: ${filename}
SAMPLE:
"""
${sample}
"""`;

  const result = await generateText({
    model: gateway(CHAT_MODEL),
    messages: [{ role: "user", content: prompt }],
  });
  const raw = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  let parsed: Partial<Classified> & { fiscal_year?: number | null; period?: string | null } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const kind = KindEnum.safeParse(parsed.kind).success ? (parsed.kind as z.infer<typeof KindEnum>) : "other";
  const fyRaw = parsed.fiscal_year;
  const fiscal_year = typeof fyRaw === "number" && fyRaw > 1990 && fyRaw < 2100 ? fyRaw : undefined;
  const period = typeof parsed.period === "string" && parsed.period.trim() ? parsed.period.trim() : undefined;
  let title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "";
  if (!title) {
    const label = KIND_LABEL[kind];
    const fyPart = fiscal_year ? ` FY${String(fiscal_year).slice(-2)}` : "";
    const pPart = period ? ` ${period}` : "";
    title = `${label}${pPart}${fyPart}`.trim();
  }
  return { kind, title, fiscal_year, period };
}

export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const isPdf = data.mime_type === "application/pdf";
    const isText = data.mime_type.startsWith("text/") || data.mime_type === "application/json";
    const originalName = data.filename || data.title || "document";

    const bytes = Uint8Array.from(atob(data.file_base64), (c) => c.charCodeAt(0));
    const safeName = originalName.replace(/[^a-z0-9.-]/gi, "_").slice(0, 60);
    const storageName = `${Date.now()}_${safeName}`;
    const filePath = `${userId}/${data.company_id}/${storageName}`;
    const { error: upErr } = await supabase.storage
      .from("research-docs")
      .upload(filePath, bytes, { contentType: data.mime_type, upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    let extracted = "";
    if (isText) extracted = new TextDecoder().decode(bytes);
    else if (isPdf) extracted = await extractPdfText(data.file_base64, data.mime_type, originalName);

    // AI auto-classification when caller didn't provide title/kind
    let kind: z.infer<typeof KindEnum> = data.kind ?? "other";
    let title = data.title ?? "";
    let fiscal_year = data.fiscal_year;
    let period = data.period;
    const shouldClassify = data.auto_classify && (!data.title || !data.kind);
    if (shouldClassify && extracted.trim().length > 30) {
      try {
        const c = await classifyDocument(extracted, originalName);
        if (!data.kind) kind = c.kind;
        if (!data.title) title = c.title;
        if (fiscal_year === undefined) fiscal_year = c.fiscal_year;
        if (period === undefined) period = c.period;
      } catch (e) {
        console.error("Auto-classify failed:", e);
      }
    }
    if (!title) title = originalName;

    const { data: row, error } = await supabase
      .from("documents")
      .insert({
        user_id: userId,
        company_id: data.company_id,
        kind,
        title,
        fiscal_year,
        period,
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
          title,
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
    const { data: doc } = await context.supabase
      .from("documents")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (doc?.file_path) {
      await context.supabase.storage.from("research-docs").remove([doc.file_path]).catch(() => {});
    }
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

    const system = `You are a senior equity research analyst answering questions grounded ONLY in the provided excerpts. Produce a clean, presentable answer.

STRUCTURE (Markdown):
1. Begin with a **TL;DR** — 1–2 sentence direct answer to the question.
2. Then a **Details** section with tight bullets grouped by theme or program. Bold key figures and entity names.
3. End with an **Uncertainty & Gaps** section listing what is NOT disclosed, or where sources disagree/are ambiguous. Omit only if truly nothing is uncertain.

DISAMBIGUATION RULES (critical — do not smooth over):
- NEVER merge figures from what appear to be different named programs, products, subsidiaries, plants, geographies, or contracts. If two excerpts each give a figure and could be talking about different items (e.g. "MIGM order size" vs "MOORED Mine order size", "Explosives division" vs "Defence division"), attribute EACH figure to its specific named program in your answer. If it is unclear which figure belongs to which program, say "unclear which program this figure refers to" — do not pick one.
- Distinguish SPEAKER ROLES rigorously. An analyst's own hypothesis, framing, or numeric guess embedded in a question is NOT a company confirmation, even if management responds. Only treat a figure as confirmed when management explicitly states or agrees to it. Use prefixes: "Management stated:", "Management confirmed:", "Analyst suggested/asked (not confirmed by management):", "Management did not confirm:", "Third-party (rating agency / media) said:".
- When management gives a partial or evasive response to an analyst's specific number, report BOTH the analyst's suggested figure AND management's actual response separately — never present the analyst's number as if management endorsed it.
- Distinguish ACTUALS vs GUIDANCE vs ASPIRATION vs PLAN. Tag figures as (actual), (guidance), (target), or (aspirational) based on the excerpt wording. Never present guidance or targets as actuals.
- Distinguish FISCAL PERIODS. Always attach the period (FY26, Q4FY26, H1FY25, etc.) to every figure. Never blend YoY vs QoQ vs cumulative without labeling.
- Preserve UNITS and CURRENCY exactly as stated (INR crore, USD mn, tons, MW). Do not convert silently.

EVIDENCE RULES:
- Base every claim on the excerpts. If the answer is not in the excerpts, say "Not disclosed in the provided documents." — do not speculate or fill gaps from general knowledge.
- Cite inline as [1], [2] matching the [[n]] source labels. Every numeric claim and every named program must carry at least one citation.
- Quote exact figures. Do not round or paraphrase numbers.
- If two excerpts give different figures for the same item, show BOTH with their citations and flag the discrepancy in Uncertainty & Gaps.
- Do not invent numbers, names, dates, guidance, or acronyms. If an acronym is unclear, keep it verbatim and note it as unresolved.

STYLE:
- Concise, scannable, professional. No filler. No hedging language like "it seems" — either it's cited or it goes under Uncertainty & Gaps.`;


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
