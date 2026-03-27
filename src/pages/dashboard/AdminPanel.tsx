import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Users, FolderCode, Key, Copy } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface AdminUser {
  user_id: string;
  role: string;
  created_at: string;
}

interface Stats {
  totalProjects: number;
  totalKeys: number;
  totalLogs: number;
}

interface AdminProject {
  id: string;
  name: string;
  is_active: boolean;
}

export default function AdminPanel() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ totalProjects: 0, totalKeys: 0, totalLogs: 0 });

  const fetchData = async () => {
    const [rolesRes, projectsRes, keysRes, logsRes, projectRowsRes] = await Promise.all([
      supabase.from('user_roles').select('*'),
      supabase.from('projects').select('id', { count: 'exact', head: true }),
      supabase.from('license_keys').select('id', { count: 'exact', head: true }),
      supabase.from('auth_logs').select('id', { count: 'exact', head: true }),
      supabase.from('projects').select('id, name, is_active').order('created_at', { ascending: false }),
    ]);

    setAdmins((rolesRes.data as AdminUser[]) || []);
    setProjects((projectRowsRes.data as AdminProject[]) || []);

    setStats({
      totalProjects: projectsRes.count || 0,
      totalKeys: keysRes.count || 0,
      totalLogs: logsRes.count || 0,
    });
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const copyValue = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copied` });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading admin panel...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Admin Panel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Full developer access — panel keys, admins, and global visibility. To reset encryption and wipe all of your
          projects, use <strong>Account → User &amp; vault</strong>.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <FolderCode className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalProjects}</p>
              <p className="text-xs text-muted-foreground">Total Projects</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalKeys}</p>
              <p className="text-xs text-muted-foreground">User Keys</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalLogs}</p>
              <p className="text-xs text-muted-foreground">Auth Events</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projects</CardTitle>
          <CardDescription>
            UPanel is universal per user account. Project-specific panel keys are no longer used.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects found yet.</p>
          ) : (
            projects.map((project) => (
              <div key={project.id} className="rounded-lg border border-border/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{project.is_active ? 'Active project' : 'Disabled project'}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{project.is_active ? 'Active' : 'Disabled'}</Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admin Users</CardTitle>
          <CardDescription>Users with admin role bypass subscription requirements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No admin users found. Add your user ID to the user_roles table to get started.</p>
          ) : (
            <div className="space-y-2">
              {admins.map((admin) => (
                <div key={admin.user_id} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <code className="text-xs font-mono text-muted-foreground">{admin.user_id}</code>
                    <Badge variant="outline" className="text-xs">{admin.role}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(admin.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-3">
              User license keys are managed on the Keys page. Panel keys are project-level developer keys shown above.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quick Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admin Capabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-primary" />
              Access dashboard without subscription
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-primary" />
              View all projects, user keys, and auth logs
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-primary" />
              Universal UPanel key flow across all loaders
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-primary" />
              Full API & obfuscation access
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
