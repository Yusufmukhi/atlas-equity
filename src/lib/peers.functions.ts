import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listPeers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ company_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("peers")
      .select("id, peer_company_id, companies:peer_company_id (id, symbol, name, sector, industry, market_cap_crore)")
      .eq("company_id", data.company_id);
    if (error) throw new Error(error.message);
    const peers = (rows ?? []).map((r) => ({
      peer_id: r.id,
      ...(r.companies as unknown as {
        id: string; symbol: string; name: string; sector: string | null;
        industry: string | null; market_cap_crore: number | null;
      }),
    }));
    if (peers.length === 0) return [];
    const ids = peers.map((p) => p.id);
    const { data: stmts } = await context.supabase
      .from("financial_statements")
      .select("company_id, fiscal_year, period_end, period_type, data")
      .in("company_id", ids)
      .eq("period_type", "annual")
      .order("period_end");
    const grouped: Record<string, typeof stmts> = {};
    for (const s of stmts ?? []) {
      (grouped[s.company_id] ||= []).push(s);
    }
    return peers.map((p) => ({ ...p, statements: grouped[p.id] ?? [] }));
  });

export const addPeer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ company_id: z.string().uuid(), peer_symbol: z.string().trim().min(1).toUpperCase() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    // find or create peer company in user's universe
    let { data: peer } = await context.supabase
      .from("companies")
      .select("id, symbol")
      .eq("user_id", context.userId)
      .eq("symbol", data.peer_symbol)
      .maybeSingle();
    if (!peer) {
      const { data: created, error: cErr } = await context.supabase
        .from("companies")
        .insert({ user_id: context.userId, symbol: data.peer_symbol, name: data.peer_symbol, exchange: "NSE" })
        .select("id, symbol")
        .single();
      if (cErr) throw new Error(cErr.message);
      peer = created;
    }
    if (peer.id === data.company_id) throw new Error("Cannot add a company as its own peer");
    const { error } = await context.supabase
      .from("peers")
      .insert({ user_id: context.userId, company_id: data.company_id, peer_company_id: peer.id });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true, peer_id: peer.id, symbol: peer.symbol };
  });

export const removePeer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ peer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("peers").delete().eq("id", data.peer_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
