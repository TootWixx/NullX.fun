
-- Checkpoint configurations table
CREATE TABLE public.checkpoint_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('lootlabs', 'workink', 'linkvertise')),
  checkpoint_name TEXT NOT NULL,
  provider_link TEXT NOT NULL,
  checkpoint_order INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Checkpoint completions tracking
CREATE TABLE public.checkpoint_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkpoint_id UUID NOT NULL REFERENCES public.checkpoint_configs(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  ip_address TEXT,
  hwid TEXT,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Checkpoint sessions - tracks user progress through checkpoints to get a key
CREATE TABLE public.checkpoint_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  hwid TEXT,
  completed_all BOOLEAN NOT NULL DEFAULT false,
  issued_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Enable RLS
ALTER TABLE public.checkpoint_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_sessions ENABLE ROW LEVEL SECURITY;

-- RLS for checkpoint_configs (owner manages)
CREATE POLICY "Users can view their own checkpoints" ON public.checkpoint_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own checkpoints" ON public.checkpoint_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own checkpoints" ON public.checkpoint_configs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own checkpoints" ON public.checkpoint_configs FOR DELETE USING (auth.uid() = user_id);

-- RLS for checkpoint_completions (public insert via edge function, owner read)
CREATE POLICY "Anyone can insert completions" ON public.checkpoint_completions FOR INSERT WITH CHECK (true);
CREATE POLICY "Owners can view completions" ON public.checkpoint_completions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.checkpoint_configs cc
    JOIN public.projects p ON p.id = cc.project_id
    WHERE cc.id = checkpoint_completions.checkpoint_id AND p.user_id = auth.uid()
  )
);

-- RLS for checkpoint_sessions (public insert/update via edge function, owner read)
CREATE POLICY "Anyone can create sessions" ON public.checkpoint_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sessions" ON public.checkpoint_sessions FOR UPDATE USING (true);
CREATE POLICY "Anyone can read sessions by token" ON public.checkpoint_sessions FOR SELECT USING (true);

-- Trigger for updated_at on checkpoint_configs
CREATE TRIGGER update_checkpoint_configs_updated_at BEFORE UPDATE ON public.checkpoint_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
