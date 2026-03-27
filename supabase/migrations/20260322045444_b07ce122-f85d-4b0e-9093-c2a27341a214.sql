
-- Fix the overly permissive insert policy on auth_logs
DROP POLICY "Service can insert logs" ON public.auth_logs;

-- Only allow inserts where the project belongs to the authenticated user, or via service role (no auth context)
CREATE POLICY "Authenticated users can insert logs for their projects" ON public.auth_logs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = auth_logs.project_id AND projects.user_id = auth.uid())
);
