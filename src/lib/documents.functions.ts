// Document upload — accepts pdf/txt files as base64, extracts text via Gemini multimodal.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

async function extractPdfText(fileBase64: string, mimeType: string, filename: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  // Use OpenAI-compatible chat/completions with a `file` content part (Gemini via Lovable Gateway).
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
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
              file: {
                filename,
                file_data: `data:${mimeType};base64,${fileBase64}`,
              },
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
    const isText =
      data.mime_type.startsWith("text/") || data.mime_type === "application/json";

    // Decode base64 to bytes for storage
    const bytes = Uint8Array.from(atob(data.file_base64), (c) => c.charCodeAt(0));
    const filename = `${Date.now()}_${data.title.replace(/[^a-z0-9.-]/gi, "_").slice(0, 60)}`;
    const filePath = `${userId}/${data.company_id}/${filename}`;
    const { error: upErr } = await supabase.storage
      .from("research-docs")
      .upload(filePath, bytes, { contentType: data.mime_type, upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    // Extract text
    let extracted = "";
    if (isText) {
      extracted = new TextDecoder().decode(bytes);
    } else if (isPdf) {
      extracted = await extractPdfText(data.file_base64, data.mime_type, data.title);
    }


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
    return row;
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
    const { data: docs, error } = await context.supabase
      .from("documents")
      .select("id, title, kind, fiscal_year, period, extracted_text")
      .eq("company_id", data.company_id)
      .in("id", data.document_ids);
    if (error) throw new Error(error.message);
    if (!docs || docs.length === 0) throw new Error("No documents selected");

    // Chunk & simple keyword-based retrieval to fit context window
    const questionWords = data.question
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);

    type Chunk = { docTitle: string; docId: string; idx: number; text: string; score: number };
    const chunks: Chunk[] = [];
    const CHUNK_SIZE = 1500;
    for (const d of docs) {
      const text = d.extracted_text ?? "";
      if (!text) continue;
      const label = `${d.title}${d.period ? ` (${d.period})` : ""}`;
      for (let i = 0, idx = 0; i < text.length; i += CHUNK_SIZE, idx++) {
        const t = text.slice(i, i + CHUNK_SIZE);
        const low = t.toLowerCase();
        let score = 0;
        for (const w of questionWords) if (low.includes(w)) score += 1;
        chunks.push({ docTitle: label, docId: d.id, idx, text: t, score });
      }
    }
    if (chunks.length === 0) throw new Error("Selected documents have no extracted text. Re-upload the PDF.");

    // Top ~20 chunks by score (or first 20 if all zero)
    chunks.sort((a, b) => b.score - a.score);
    const top = chunks.slice(0, 20);

    const context_text = top
      .map((c, i) => `[[${i + 1}]] Source: ${c.docTitle} — chunk ${c.idx}\n${c.text}`)
      .join("\n\n---\n\n");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(apiKey);

    const system = `You are an equity research analyst answering questions grounded ONLY in the provided concall/document excerpts. Rules:
- Base every claim on the excerpts. If the answer is not present, say "Not found in the provided documents."
- Cite excerpts inline using bracket markers like [1], [2] matching the [[n]] source labels.
- Be concise, structured (bullets when useful), and quote exact figures when available.
- Do not invent numbers, guidance, or names.`;

    const result = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Question: ${data.question}\n\n=== SOURCE EXCERPTS ===\n${context_text}`,
        },
      ],
    });

    return {
      answer: result.text,
      sources: top.map((c, i) => ({ n: i + 1, docId: c.docId, title: c.docTitle, chunk: c.idx })),
    };
  });
