
CREATE TABLE public.obfuscated_scripts (
  id TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex'),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  original_name TEXT DEFAULT 'untitled.lua',
  obfuscated_content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.obfuscated_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scripts" ON public.obfuscated_scripts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own scripts" ON public.obfuscated_scripts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own scripts" ON public.obfuscated_scripts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Allow the loader edge function (service role) to read any script
CREATE POLICY "Service can read all scripts" ON public.obfuscated_scripts
  FOR SELECT TO service_role USING (true);
