import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Conviction = "high" | "medium" | "low" | "watch" | "avoid";

export const listWatchlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("watchlist")
      .select("id, conviction, target_price, thesis, notes, updated_at, company:companies(id, symbol, name, sector, current_price, market_cap_crore)")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    company_id: string;
    conviction: Conviction;
    target_price?: number | null;
    thesis?: string | null;
    notes?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("watchlist").upsert(
      {
        user_id: context.userId,
        company_id: data.company_id,
        conviction: data.conviction,
        target_price: data.target_price ?? null,
        thesis: data.thesis ?? null,
        notes: data.notes ?? null,
      },
      { onConflict: "user_id,company_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const removeWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("watchlist").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
