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

-- Link Nova account ↔ Discord user (for bot / future features)
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
