
CREATE TYPE public.note_kind AS ENUM ('thesis','risk','catalyst','question','observation');

CREATE TABLE public.research_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  kind public.note_kind NOT NULL DEFAULT 'observation',
  title TEXT NOT NULL,
  body TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_notes TO authenticated;
GRANT ALL ON public.research_notes TO service_role;

ALTER TABLE public.research_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own notes read" ON public.research_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own notes insert" ON public.research_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notes update" ON public.research_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notes delete" ON public.research_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER touch_research_notes_updated_at BEFORE UPDATE ON public.research_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX research_notes_user_created_idx ON public.research_notes(user_id, created_at DESC);
CREATE INDEX research_notes_company_idx ON public.research_notes(company_id);
