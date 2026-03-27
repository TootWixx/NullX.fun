
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
