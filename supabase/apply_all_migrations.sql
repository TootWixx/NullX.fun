
-- === 20260322045428_b8dc5692-cf91-46f4-bbb8-8636211064a7.sql ===


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

-- === 20260322045444_b07ce122-f85d-4b0e-9093-c2a27341a214.sql ===


-- Fix the overly permissive insert policy on auth_logs
DROP POLICY "Service can insert logs" ON public.auth_logs;

-- Only allow inserts where the project belongs to the authenticated user, or via service role (no auth context)
CREATE POLICY "Authenticated users can insert logs for their projects" ON public.auth_logs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = auth_logs.project_id AND projects.user_id = auth.uid())
);

-- === 20260322050844_0c0bf8ac-9ecc-4584-a3bd-dde6cbf7c87a.sql ===


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

-- === 20260322054734_3f90a644-95b9-42c5-98d7-fb820ed3cd1d.sql ===


-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can read their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- === 20260322060155_a23cb3ed-17cc-4c25-90f9-96eb77401eaf.sql ===

ALTER TABLE public.webhook_configs
  ADD COLUMN IF NOT EXISTS log_ip boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS log_isp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS log_location boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS log_os boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS log_hwid boolean NOT NULL DEFAULT true;
-- === 20260322061854_c50edbcc-37e4-46c6-a95f-4e9c522f12b4.sql ===


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

-- === 20260322065916_e5a31d82-5f62-4677-b386-1531c7ff3feb.sql ===


CREATE TABLE public.encryption_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  verification_blob TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.encryption_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own encryption config"
  ON public.encryption_configs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own encryption config"
  ON public.encryption_configs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Add encryption metadata columns to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS encryption_iv TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS encryption_salt TEXT;

-- === 20260322164144_6e5a8c37-b86f-495f-9c42-6434048fef4a.sql ===

CREATE OR REPLACE FUNCTION public.generate_panel_key()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := 'NPANEL-';
  i integer;
BEGIN
  FOR i IN 1..24 LOOP
    IF i IN (7, 13, 19) THEN
      result := result || '-';
    END IF;
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

ALTER TABLE public.projects
ADD COLUMN panel_key text;

UPDATE public.projects
SET panel_key = public.generate_panel_key()
WHERE panel_key IS NULL;

ALTER TABLE public.projects
ALTER COLUMN panel_key SET DEFAULT public.generate_panel_key();

ALTER TABLE public.projects
ALTER COLUMN panel_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS projects_panel_key_key ON public.projects(panel_key);
-- === 20260322234647_624c0486-4628-43ba-a5b7-2b9b37be05c0.sql ===

CREATE OR REPLACE FUNCTION public.generate_user_panel_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := 'UPANEL-';
  i integer;
BEGIN
  FOR i IN 1..24 LOOP
    IF i IN (7, 13, 19) THEN
      result := result || '-';
    END IF;
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column_generic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.user_panel_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  panel_key text NOT NULL UNIQUE DEFAULT public.generate_user_panel_key(),
  is_visible boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_panel_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_panel_keys' AND policyname = 'Users can view their own panel key'
  ) THEN
    CREATE POLICY "Users can view their own panel key"
    ON public.user_panel_keys
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_panel_keys' AND policyname = 'Users can create their own panel key'
  ) THEN
    CREATE POLICY "Users can create their own panel key"
    ON public.user_panel_keys
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_panel_keys' AND policyname = 'Users can update their own panel key'
  ) THEN
    CREATE POLICY "Users can update their own panel key"
    ON public.user_panel_keys
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_user_panel_keys_updated_at ON public.user_panel_keys;
CREATE TRIGGER update_user_panel_keys_updated_at
BEFORE UPDATE ON public.user_panel_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column_generic();

INSERT INTO public.user_panel_keys (user_id, panel_key)
SELECT DISTINCT ON (p.user_id) p.user_id, p.panel_key
FROM public.projects p
WHERE p.user_id IS NOT NULL
  AND coalesce(p.panel_key, '') <> ''
ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.checkpoint_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  api_token_encrypted text NOT NULL,
  encryption_iv text NOT NULL,
  encryption_salt text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT checkpoint_provider_credentials_provider_check CHECK (provider IN ('linkvertise', 'lootlabs', 'workink')),
  CONSTRAINT checkpoint_provider_credentials_user_provider_unique UNIQUE (user_id, provider)
);

ALTER TABLE public.checkpoint_provider_credentials ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'checkpoint_provider_credentials' AND policyname = 'Users can view their own provider credentials'
  ) THEN
    CREATE POLICY "Users can view their own provider credentials"
    ON public.checkpoint_provider_credentials
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'checkpoint_provider_credentials' AND policyname = 'Users can create their own provider credentials'
  ) THEN
    CREATE POLICY "Users can create their own provider credentials"
    ON public.checkpoint_provider_credentials
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'checkpoint_provider_credentials' AND policyname = 'Users can update their own provider credentials'
  ) THEN
    CREATE POLICY "Users can update their own provider credentials"
    ON public.checkpoint_provider_credentials
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'checkpoint_provider_credentials' AND policyname = 'Users can delete their own provider credentials'
  ) THEN
    CREATE POLICY "Users can delete their own provider credentials"
    ON public.checkpoint_provider_credentials
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_checkpoint_provider_credentials_updated_at ON public.checkpoint_provider_credentials;
CREATE TRIGGER update_checkpoint_provider_credentials_updated_at
BEFORE UPDATE ON public.checkpoint_provider_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column_generic();

CREATE INDEX IF NOT EXISTS idx_user_panel_keys_user_id ON public.user_panel_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_provider_credentials_user_provider ON public.checkpoint_provider_credentials (user_id, provider);
-- === 20260323120000_add_luarmor_provider.sql ===

-- Allow Luarmor as a checkpoint / credentials provider (see https://docs.luarmor.net/ad-system-rewards)

ALTER TABLE public.checkpoint_configs DROP CONSTRAINT IF EXISTS checkpoint_configs_provider_check;
ALTER TABLE public.checkpoint_configs ADD CONSTRAINT checkpoint_configs_provider_check
  CHECK (provider IN ('lootlabs', 'workink', 'linkvertise', 'luarmor'));

ALTER TABLE public.checkpoint_provider_credentials DROP CONSTRAINT IF EXISTS checkpoint_provider_credentials_provider_check;
ALTER TABLE public.checkpoint_provider_credentials ADD CONSTRAINT checkpoint_provider_credentials_provider_check
  CHECK (provider IN ('linkvertise', 'lootlabs', 'workink', 'luarmor'));

-- === 20260323140000_encryption_delete_and_discord.sql ===

-- Allow users to delete their own encryption config (vault reset)
DROP POLICY IF EXISTS "Users can delete own encryption config" ON public.encryption_configs;
CREATE POLICY "Users can delete own encryption config"
  ON public.encryption_configs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Optional: allow updating own row (e.g. future rotation)
DROP POLICY IF EXISTS "Users can update own encryption config" ON public.encryption_configs;
CREATE POLICY "Users can update own encryption config"
  ON public.encryption_configs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Link Nova account â†” Discord user (for bot / future features)
CREATE TABLE IF NOT EXISTS public.discord_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  discord_user_id text NOT NULL,
  discord_username text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own discord connection" ON public.discord_connections;
CREATE POLICY "Users can view own discord connection"
  ON public.discord_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own discord connection" ON public.discord_connections;
CREATE POLICY "Users can insert own discord connection"
  ON public.discord_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own discord connection" ON public.discord_connections;
CREATE POLICY "Users can update own discord connection"
  ON public.discord_connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own discord connection" ON public.discord_connections;
CREATE POLICY "Users can delete own discord connection"
  ON public.discord_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Discord user IDs allowed to run admin slash commands (managed via SQL or future admin UI)
CREATE TABLE IF NOT EXISTS public.discord_bot_operators (
  discord_user_id text PRIMARY KEY,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_bot_operators ENABLE ROW LEVEL SECURITY;
-- No policies: authenticated users cannot read; service role bypasses for the bot.

CREATE INDEX IF NOT EXISTS idx_discord_connections_user_id ON public.discord_connections(user_id);

-- After this schema runs: allow your Discord account to use /nova (replace with your numeric user ID).
-- INSERT INTO public.discord_bot_operators (discord_user_id, label) VALUES ('123456789012345678', 'owner');

-- === 20260326010000_add_discord_server_link_to_creator_profiles.sql ===
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS discord_server_link TEXT;

-- === 20260326020000_creator_media_storage_policies.sql ===
-- Fix Supabase Storage RLS blocking avatar/background uploads
-- Bucket: creator-media
-- Client uploads to: profiles/<auth.uid()>/<avatar|background>.<ext>
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator-media: insert own profiles" ON storage.objects;
CREATE POLICY "creator-media: insert own profiles"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'creator-media'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS "creator-media: update own profiles" ON storage.objects;
CREATE POLICY "creator-media: update own profiles"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'creator-media'
    AND split_part(name, '/', 2) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'creator-media'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS "creator-media: delete own profiles" ON storage.objects;
CREATE POLICY "creator-media: delete own profiles"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'creator-media'
    AND split_part(name, '/', 2) = auth.uid()::text
  );
