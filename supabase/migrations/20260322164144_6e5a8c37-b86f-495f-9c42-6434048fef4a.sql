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