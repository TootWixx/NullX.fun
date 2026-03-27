
-- Create update_updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Projects table (each user can have multiple projects/scripts)
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  script_content TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- License keys table
CREATE TABLE public.license_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_value TEXT NOT NULL UNIQUE,
  note TEXT,
  hwid TEXT,
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own keys" ON public.license_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own keys" ON public.license_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own keys" ON public.license_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own keys" ON public.license_keys FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_license_keys_updated_at BEFORE UPDATE ON public.license_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auth logs table
CREATE TABLE public.auth_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key_id UUID REFERENCES public.license_keys(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  hwid TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.auth_logs ENABLE ROW LEVEL SECURITY;

-- Users can view logs for their own projects
CREATE POLICY "Users can view logs for their projects" ON public.auth_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = auth_logs.project_id AND projects.user_id = auth.uid())
);

-- Insert policy for the edge function (service role) - no RLS bypass needed, we use service role in edge functions
CREATE POLICY "Service can insert logs" ON public.auth_logs FOR INSERT WITH CHECK (true);

-- Webhook configs table
CREATE TABLE public.webhook_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_webhook_url TEXT NOT NULL,
  log_key_auth BOOLEAN NOT NULL DEFAULT true,
  log_key_reset BOOLEAN NOT NULL DEFAULT false,
  log_hwid_change BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own webhooks" ON public.webhook_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own webhooks" ON public.webhook_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own webhooks" ON public.webhook_configs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own webhooks" ON public.webhook_configs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_webhook_configs_updated_at BEFORE UPDATE ON public.webhook_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
