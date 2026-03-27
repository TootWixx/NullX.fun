-- Enforce Starter plan limits at the database layer.
-- Starter limits:
-- - 1 project
-- - 60 total generated keys
-- - generic_url checkpoints only

CREATE OR REPLACE FUNCTION public.is_starter_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  is_admin boolean := false;
  has_panel_key boolean := false;
BEGIN
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF lower(coalesce(user_email, '')) = 'real5wagger5oup@gmail.com' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'admin'
  ) INTO is_admin;

  IF is_admin THEN
    RETURN false;
  END IF;

  -- Paid users normally have a panel key; use this as server-side paid signal.
  SELECT EXISTS (
    SELECT 1
    FROM public.user_panel_keys
    WHERE user_id = p_user_id
      AND panel_key IS NOT NULL
  ) INTO has_panel_key;

  IF has_panel_key THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_starter_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_count integer;
  key_count integer;
BEGIN
  IF NOT public.is_starter_user(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'projects' THEN
    SELECT count(*) INTO project_count
    FROM public.projects
    WHERE user_id = NEW.user_id;

    IF project_count >= 1 THEN
      RAISE EXCEPTION 'Starter plan limit reached: 1 project slot maximum';
    END IF;
  ELSIF TG_TABLE_NAME = 'license_keys' THEN
    SELECT count(*) INTO key_count
    FROM public.license_keys
    WHERE user_id = NEW.user_id;

    IF key_count >= 60 THEN
      RAISE EXCEPTION 'Starter plan limit reached: 60 key generations maximum';
    END IF;
  ELSIF TG_TABLE_NAME = 'checkpoint_configs' THEN
    IF coalesce(NEW.checkpoint_type, '') <> 'generic_url' THEN
      RAISE EXCEPTION 'Starter plan supports generic_url checkpoints only';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_starter_limits_projects ON public.projects;
CREATE TRIGGER trg_enforce_starter_limits_projects
BEFORE INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.enforce_starter_limits();

DROP TRIGGER IF EXISTS trg_enforce_starter_limits_license_keys ON public.license_keys;
CREATE TRIGGER trg_enforce_starter_limits_license_keys
BEFORE INSERT ON public.license_keys
FOR EACH ROW
EXECUTE FUNCTION public.enforce_starter_limits();

DROP TRIGGER IF EXISTS trg_enforce_starter_limits_checkpoints ON public.checkpoint_configs;
CREATE TRIGGER trg_enforce_starter_limits_checkpoints
BEFORE INSERT ON public.checkpoint_configs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_starter_limits();
