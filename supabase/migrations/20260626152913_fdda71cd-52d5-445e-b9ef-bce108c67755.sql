
-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.exchange_kind AS ENUM ('NSE', 'BSE', 'OTHER');
CREATE TYPE public.period_kind AS ENUM ('annual', 'quarterly', 'ttm');
CREATE TYPE public.document_kind AS ENUM ('annual_report', 'concall', 'presentation', 'quarterly_result', 'credit_rating', 'other');
CREATE TYPE public.agent_kind AS ENUM ('business', 'financial', 'management', 'industry', 'risk', 'valuation');
CREATE TYPE public.report_status AS ENUM ('draft', 'generating', 'ready', 'error');
CREATE TYPE public.recommendation_kind AS ENUM ('strong_buy', 'buy', 'hold', 'reduce', 'sell');

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- =========================
-- USER ROLES
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- =========================
-- updated_at helper
-- =========================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================
-- AUTO PROFILE ON SIGNUP
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- COMPANIES
-- =========================
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  exchange public.exchange_kind NOT NULL DEFAULT 'NSE',
  name TEXT NOT NULL,
  sector TEXT,
  industry TEXT,
  market_cap_crore NUMERIC,
  current_price NUMERIC,
  shares_outstanding NUMERIC,
  description TEXT,
  business_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol, exchange)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own companies" ON public.companies FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX companies_user_symbol ON public.companies (user_id, symbol);
CREATE TRIGGER companies_touch BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================
-- FINANCIAL STATEMENTS
-- Stored as flexible JSON: { pnl: {revenue, cogs, ...}, bs: {...}, cf: {...} }
-- =========================
CREATE TABLE public.financial_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_type public.period_kind NOT NULL,
  fiscal_year INT NOT NULL,
  period_end DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  unit TEXT NOT NULL DEFAULT 'crore',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_type, period_end)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_statements TO authenticated;
GRANT ALL ON public.financial_statements TO service_role;
ALTER TABLE public.financial_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own statements" ON public.financial_statements FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX fs_company_period ON public.financial_statements (company_id, period_type, period_end DESC);
CREATE TRIGGER fs_touch BEFORE UPDATE ON public.financial_statements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================
-- RATIOS (computed)
-- =========================
CREATE TABLE public.ratios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_end DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_end)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ratios TO authenticated;
GRANT ALL ON public.ratios TO service_role;
ALTER TABLE public.ratios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ratios" ON public.ratios FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================
-- DOCUMENTS
-- =========================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind public.document_kind NOT NULL,
  title TEXT NOT NULL,
  fiscal_year INT,
  period TEXT,
  file_path TEXT,
  mime_type TEXT,
  page_count INT,
  extracted_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own documents" ON public.documents FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX documents_company ON public.documents (company_id, kind);

-- =========================
-- AGENT OUTPUTS
-- =========================
CREATE TABLE public.agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_type public.agent_kind NOT NULL,
  model TEXT NOT NULL,
  score NUMERIC,
  summary TEXT,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_outputs TO authenticated;
GRANT ALL ON public.agent_outputs TO service_role;
ALTER TABLE public.agent_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own agent outputs" ON public.agent_outputs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX agent_outputs_company ON public.agent_outputs (company_id, agent_type, created_at DESC);

-- =========================
-- DCF MODELS
-- =========================
CREATE TABLE public.dcf_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scenario TEXT NOT NULL DEFAULT 'base',
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  projections JSONB NOT NULL DEFAULT '{}'::jsonb,
  wacc NUMERIC,
  terminal_growth NUMERIC,
  enterprise_value NUMERIC,
  equity_value NUMERIC,
  intrinsic_value_per_share NUMERIC,
  bull_value NUMERIC,
  base_value NUMERIC,
  bear_value NUMERIC,
  sensitivity JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dcf_models TO authenticated;
GRANT ALL ON public.dcf_models TO service_role;
ALTER TABLE public.dcf_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dcf" ON public.dcf_models FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER dcf_touch BEFORE UPDATE ON public.dcf_models
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================
-- PEERS
-- =========================
CREATE TABLE public.peers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  peer_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, peer_company_id),
  CHECK (company_id <> peer_company_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.peers TO authenticated;
GRANT ALL ON public.peers TO service_role;
ALTER TABLE public.peers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own peers" ON public.peers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================
-- REPORTS
-- =========================
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status public.report_status NOT NULL DEFAULT 'draft',
  recommendation public.recommendation_kind,
  target_price NUMERIC,
  upside_pct NUMERIC,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  thesis TEXT,
  bull_case TEXT,
  base_case TEXT,
  bear_case TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reports" ON public.reports FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER reports_touch BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
