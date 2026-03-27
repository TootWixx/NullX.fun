-- Run this in Supabase → SQL Editor if only this table is missing.
-- For a new project, prefer running apply_all_migrations.sql (full app schema).

CREATE TABLE IF NOT EXISTS public.discord_bot_operators (
  discord_user_id text PRIMARY KEY,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_bot_operators ENABLE ROW LEVEL SECURITY;

-- Then add yourself (replace with your Discord user ID):
-- INSERT INTO public.discord_bot_operators (discord_user_id, label) VALUES ('YOUR_ID_HERE', 'owner');
