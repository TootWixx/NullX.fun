ALTER TABLE public.webhook_configs
  ADD COLUMN IF NOT EXISTS log_ip boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS log_isp boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS log_location boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS log_os boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS log_hwid boolean NOT NULL DEFAULT true;