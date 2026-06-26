// Company CRUD + financials server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("companies")
      .select("id, symbol, exchange, name, sector, industry, market_cap_crore, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        symbol: z.string().trim().min(1).max(20).toUpperCase(),
        name: z.string().trim().min(1).max(200),
        exchange: z.enum(["NSE", "BSE", "OTHER"]).default("NSE"),
        sector: z.string().trim().max(100).optional(),
        industry: z.string().trim().max(100).optional(),
        market_cap_crore: z.number().nonnegative().optional(),
        current_price: z.number().nonnegative().optional(),
        shares_outstanding: z.number().nonnegative().optional(),
        description: z.string().max(5000).optional(),
        business_model: z.string().max(5000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("companies")
      .upsert(
        { ...data, user_id: context.userId },
        { onConflict: "user_id,symbol,exchange" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getCompanyBySymbol = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ symbol: z.string().toUpperCase() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: company } = await context.supabase
      .from("companies")
      .select("*")
      .eq("symbol", data.symbol)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!company) return null;
    const [{ data: stmts }, { data: docs }, { data: agents }] = await Promise.all([
      context.supabase
        .from("financial_statements")
        .select("*")
        .eq("company_id", company.id)
        .order("period_end"),
      context.supabase
        .from("documents")
        .select("id, kind, title, fiscal_year, period, page_count, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("agent_outputs")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false }),
    ]);
    return { company, statements: stmts ?? [], documents: docs ?? [], agent_outputs: agents ?? [] };
  });

export const upsertFinancialStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        period_type: z.enum(["annual", "quarterly", "ttm"]).default("annual"),
        fiscal_year: z.number().int().min(1990).max(2100),
        period_end: z.string(),
        data: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("financial_statements")
      .upsert(
        { ...data, data: data.data as never, user_id: context.userId },
        { onConflict: "company_id,period_type,period_end" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("companies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
