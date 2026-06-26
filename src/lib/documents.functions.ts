// Document upload — accepts pdf/txt files as base64, extracts text via Gemini multimodal.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

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
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
      const gateway = createLovableAiGatewayProvider(apiKey);
      try {
        const result = await generateText({
          model: gateway("google/gemini-3-flash-preview"),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract the full readable text content of this document. Preserve section headings, tables (as plain text), and numeric data. Return ONLY the extracted text, no commentary.",
                },
                {
                  type: "file",
                  data: data.file_base64,
                  mediaType: data.mime_type,
                  filename: data.title,
                } as never,
              ],
            },
          ],
        });
        extracted = result.text;
      } catch (e) {
        console.error("PDF extraction failed", e);
        extracted = "";
      }
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
