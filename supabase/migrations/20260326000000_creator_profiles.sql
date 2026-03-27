-- ── Creator Profiles ─────────────────────────────────────────────────────────
CREATE TABLE public.creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  avatar_url TEXT,
  background_url TEXT,
  background_color TEXT DEFAULT '#0a0a1a',
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

-- Public read (needed for GetKey page)
CREATE POLICY "Public can read creator profiles"
  ON public.creator_profiles FOR SELECT USING (true);

-- Owner write
CREATE POLICY "Owner can manage profile"
  ON public.creator_profiles FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER update_creator_profiles_updated_at
  BEFORE UPDATE ON public.creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Update checkpoint_configs ─────────────────────────────────────────────────
-- Add checkpoint_type (replaces provider for new checkpoints)
ALTER TABLE public.checkpoint_configs
  ADD COLUMN IF NOT EXISTS checkpoint_type TEXT NOT NULL DEFAULT 'generic_url',
  ADD COLUMN IF NOT EXISTS display_label TEXT,
  ADD COLUMN IF NOT EXISTS guild_id TEXT; -- Discord guild ID for discord_server type

-- Migrate existing rows: map old provider to new type
UPDATE public.checkpoint_configs
  SET checkpoint_type = CASE
    WHEN provider IN ('lootlabs', 'workink', 'linkvertise', 'luarmor') THEN 'generic_url'
    ELSE 'generic_url'
  END
  WHERE checkpoint_type = 'generic_url'; -- noop but documents intent
