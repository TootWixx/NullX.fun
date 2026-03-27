-- Optional Discord server link shown on the public key page
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS discord_server_link TEXT;

