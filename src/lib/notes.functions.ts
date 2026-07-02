import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type NoteKind = "thesis" | "risk" | "catalyst" | "question" | "observation";

const KindEnum = z.enum(["thesis", "risk", "catalyst", "question", "observation"]);

export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid().optional(),
        search: z.string().optional(),
        kind: KindEnum.optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("research_notes")
      .select("id, kind, title, body, tags, created_at, updated_at, company_id, company:companies(id, symbol, name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.company_id) q = q.eq("company_id", data.company_id);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.search && data.search.trim()) {
      const s = data.search.trim().replace(/[%,]/g, " ");
      q = q.or(`title.ilike.%${s}%,body.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        company_id: z.string().uuid().nullable().optional(),
        kind: KindEnum,
        title: z.string().trim().min(1),
        body: z.string().nullable().optional(),
        tags: z.array(z.string()).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      company_id: data.company_id ?? null,
      kind: data.kind,
      title: data.title,
      body: data.body ?? null,
      tags: data.tags,
    };
    if (data.id) {
      const { error } = await context.supabase.from("research_notes").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("research_notes")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("research_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
