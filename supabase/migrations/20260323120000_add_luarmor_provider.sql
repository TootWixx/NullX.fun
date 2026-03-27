-- Allow Luarmor as a checkpoint / credentials provider (see https://docs.luarmor.net/ad-system-rewards)

ALTER TABLE public.checkpoint_configs DROP CONSTRAINT IF EXISTS checkpoint_configs_provider_check;
ALTER TABLE public.checkpoint_configs ADD CONSTRAINT checkpoint_configs_provider_check
  CHECK (provider IN ('lootlabs', 'workink', 'linkvertise', 'luarmor'));

ALTER TABLE public.checkpoint_provider_credentials DROP CONSTRAINT IF EXISTS checkpoint_provider_credentials_provider_check;
ALTER TABLE public.checkpoint_provider_credentials ADD CONSTRAINT checkpoint_provider_credentials_provider_check
  CHECK (provider IN ('linkvertise', 'lootlabs', 'workink', 'luarmor'));
