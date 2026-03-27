create table active_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  key_id uuid references license_keys(id) on delete cascade not null,
  hwid text,
  ip_address text,
  os text,
  last_ping timestamptz default now(),
  status text check (status in ('active', 'killed')) default 'active',
  message text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table active_sessions enable row level security;

-- Policies
create policy "Users can view active sessions for their projects"
  on active_sessions for select
  using (
    exists (
      select 1 from projects
      where projects.id = active_sessions.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can update active sessions for their projects"
  on active_sessions for update
  using (
    exists (
      select 1 from projects
      where projects.id = active_sessions.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can delete active sessions for their projects"
  on active_sessions for delete
  using (
    exists (
      select 1 from projects
      where projects.id = active_sessions.project_id
      and projects.user_id = auth.uid()
    )
  );
