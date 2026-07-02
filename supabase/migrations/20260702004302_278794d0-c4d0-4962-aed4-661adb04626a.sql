
CREATE TABLE public.holdings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  avg_cost NUMERIC NOT NULL CHECK (avg_cost >= 0),
  buy_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO authenticated;
GRANT ALL ON public.holdings TO service_role;

ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own holdings all" ON public.holdings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER touch_holdings_updated_at BEFORE UPDATE ON public.holdings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
