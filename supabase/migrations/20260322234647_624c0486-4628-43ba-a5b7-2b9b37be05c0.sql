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