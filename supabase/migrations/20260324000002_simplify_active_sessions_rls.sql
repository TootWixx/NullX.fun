-- Add user_id to active_sessions to simplify RLS and improve performance
alter table active_sessions add column user_id uuid references auth.users(id) on delete cascade;

-- Update existing sessions if any (unlikely at this stage)
update active_sessions set user_id = (select user_id from projects where projects.id = active_sessions.project_id) where user_id is null;

-- Make it not null
alter table active_sessions alter column user_id set not null;

-- Simplify RLS Policies
drop policy "Users can view active sessions for their projects" on active_sessions;
drop policy "Users can update active sessions for their projects" on active_sessions;
drop policy "Users can delete active sessions for their projects" on active_sessions;

create policy "Users can view their active sessions"
  on active_sessions for select
  using (auth.uid() = user_id);

create policy "Users can update their active sessions"
  on active_sessions for update
  using (auth.uid() = user_id);

create policy "Users can delete their active sessions"
  on active_sessions for delete
  using (auth.uid() = user_id);
