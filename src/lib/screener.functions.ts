import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const screenerData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: companies, error } = await context.supabase
      .from("companies")
      .select("id, symbol, name, sector, industry, market_cap_crore, current_price")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!companies || companies.length === 0) return [];
    const ids = companies.map((c) => c.id);
    const { data: stmts } = await context.supabase
      .from("financial_statements")
      .select("company_id, fiscal_year, period_end, data")
      .in("company_id", ids)
      .eq("period_type", "annual")
      .order("period_end");
    const grouped: Record<string, typeof stmts> = {};
    for (const s of stmts ?? []) (grouped[s.company_id] ||= []).push(s);
    return companies.map((c) => ({ ...c, statements: grouped[c.id] ?? [] }));
  });
