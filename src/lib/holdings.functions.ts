import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listHoldings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("holdings")
      .select("id, quantity, avg_cost, buy_date, notes, updated_at, company_id, company:companies(id, symbol, name, sector, current_price)")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertHolding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        quantity: z.number().nonnegative(),
        avg_cost: z.number().nonnegative(),
        buy_date: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("holdings").upsert(
      {
        user_id: context.userId,
        company_id: data.company_id,
        quantity: data.quantity,
        avg_cost: data.avg_cost,
        buy_date: data.buy_date ?? null,
        notes: data.notes ?? null,
      },
      { onConflict: "user_id,company_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteHolding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("holdings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
