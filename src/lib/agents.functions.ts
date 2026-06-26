// AI agent server functions. One per agent type. All grounded with explicit
// citations: each finding must cite either a computed ratio or a document.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { computeMetrics, computeCagrs, computeScores, type Statement } from "./ratios";

const MODEL = "google/gemini-3-flash-preview";

const AgentInput = z.object({
  company_id: z.string().uuid(),
  agent_type: z.enum(["business", "financial", "management", "industry", "risk", "valuation"]),
});

const FindingSchema = z.object({
  claim: z.string(),
  evidence: z.string(),
  source: z.string(),
});

const RiskSchema = z.object({
  title: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  detail: z.string(),
  source: z.string(),
});

const OutputSchema = z.object({
  score: z.number().min(0).max(10),
  summary: z.string(),
  findings: z.array(FindingSchema),
  risks: z.array(RiskSchema),
});

const SYSTEM_BY_AGENT: Record<string, string> = {
  business:
    "You are a senior equity research analyst writing the BUSINESS section. Analyze business model, revenue segments, customers, suppliers, moat, growth drivers. Every claim MUST cite either a specific document excerpt or a computed financial metric. Cite as source: doc:<id>#<page> or computed:<metric>.",
  financial:
    "You are a financial statement analyst. Analyze 10-yr P&L, BS, CF trends, margins, returns, leverage, working capital, FCF quality. Every claim cites a computed metric (computed:roe, computed:cagr_5y, etc.) or financial statement value.",
  management:
    "You are a management quality analyst. Read concall transcripts, annual reports, management interviews. Extract guidance, capital allocation, execution, tone, repeated risks, missed prior guidance. Every claim cites doc:<id>#<page>.",
  industry:
    "You are an industry analyst. Analyze industry growth, competitive position, market share, policy tailwinds, cyclicality. Cite documents or external context provided.",
  risk:
    "You are a risk analyst. Identify debt, customer concentration, supplier concentration, execution, commodity, policy, currency, governance, accounting red flags (Beneish, related-party). Cite computed metrics or document excerpts.",
  valuation:
    "You are a valuation analyst. Triangulate PE, PEG, EV/EBITDA, DCF, comparable, historical multiples. Cite computed metrics and ratio history.",
};

export const runAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AgentInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load company + statements + documents
    const [{ data: company }, { data: stmts }, { data: docs }] = await Promise.all([
      supabase.from("companies").select("*").eq("id", data.company_id).eq("user_id", userId).maybeSingle(),
      supabase
        .from("financial_statements")
        .select("fiscal_year, period_end, data")
        .eq("company_id", data.company_id)
        .eq("period_type", "annual")
        .order("fiscal_year"),
      supabase
        .from("documents")
        .select("id, kind, title, fiscal_year, extracted_text")
        .eq("company_id", data.company_id)
        .order("fiscal_year", { ascending: false })
        .limit(8),
    ]);

    if (!company) throw new Error("Company not found");

    const statements = (stmts ?? []) as Statement[];
    const metrics = computeMetrics(statements);
    const cagrs = computeCagrs(statements);
    const scores = computeScores(metrics, cagrs);

    const computedCtx = {
      company: {
        symbol: company.symbol,
        name: company.name,
        sector: company.sector,
        industry: company.industry,
        market_cap_crore: company.market_cap_crore,
        business_model: company.business_model,
      },
      metrics_last: metrics[metrics.length - 1] ?? null,
      metrics_10y: metrics,
      cagrs,
      scores,
    };

    const docCtx = (docs ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      fiscal_year: d.fiscal_year,
      excerpt: (d.extracted_text ?? "").slice(0, 6000),
    }));

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const gateway = createLovableAiGatewayProvider(apiKey);

    const prompt = `Company: ${company.name} (${company.symbol})

COMPUTED FINANCIAL CONTEXT:
${JSON.stringify(computedCtx, null, 2)}

DOCUMENTS:
${JSON.stringify(docCtx, null, 2)}

Produce STRICT JSON matching this schema:
{
  "score": number 0-10,
  "summary": "2-3 paragraph analyst summary",
  "findings": [{ "claim": "...", "evidence": "specific numbers or quote", "source": "computed:<metric>|doc:<id>#section" }],
  "risks": [{ "title": "...", "severity": "low|medium|high", "detail": "...", "source": "..." }]
}

Return ONLY valid JSON. No markdown fences. Every claim must cite a source.`;

    let parsed: z.infer<typeof OutputSchema>;
    try {
      const result = await generateText({
        model: gateway(MODEL),
        system: SYSTEM_BY_AGENT[data.agent_type],
        prompt,
      });
      const text = result.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      parsed = OutputSchema.parse(JSON.parse(text));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Agent ${data.agent_type} failed: ${message}`);
    }

    // Persist
    const { data: row, error } = await supabase
      .from("agent_outputs")
      .insert({
        user_id: userId,
        company_id: data.company_id,
        agent_type: data.agent_type,
        model: MODEL,
        score: parsed.score,
        summary: parsed.summary,
        findings: parsed.findings,
        risks: parsed.risks,
        raw: parsed,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

export const listAgentOutputs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ company_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_outputs")
      .select("*")
      .eq("company_id", data.company_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
