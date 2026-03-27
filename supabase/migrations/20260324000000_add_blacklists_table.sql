-- Create blacklists table
CREATE TABLE public.blacklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ip', 'hwid', 'key')),
  value TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, type, value)
);

ALTER TABLE public.blacklists ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own blacklists" ON public.blacklists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own blacklists" ON public.blacklists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own blacklists" ON public.blacklists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own blacklists" ON public.blacklists FOR DELETE USING (auth.uid() = user_id);
