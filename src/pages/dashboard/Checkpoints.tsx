import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ExternalLink, Copy, ArrowUpDown, Youtube, MessageCircle, Link2, Globe } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Checkpoint {
  id: string;
  project_id: string;
  checkpoint_type: string;
  checkpoint_name: string;
  display_label: string | null;
  provider_link: string;
  guild_id: string | null;
  checkpoint_order: number;
  is_active: boolean;
  created_at: string;
}

interface Project { id: string; name: string; }

interface CheckpointSession {
  id: string;
  project_id: string;
  session_token: string;
  ip_address: string | null;
  completed_all: boolean | null;
  issued_key: string | null;
  created_at: string;
  expires_at: string | null;
  completed_count: number;
}

const CHECKPOINT_TYPES = [
  {
    value: 'youtube_video',
    label: 'YouTube Video',
    icon: Youtube,
    color: 'text-red-400',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
    timer: '90s',
    placeholder: 'https://youtu.be/...',
    hint: 'Users must stay on the video for 90 seconds.',
  },
  {
    value: 'youtube_channel',
    label: 'YouTube Channel',
    icon: Youtube,
    color: 'text-red-400',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
    timer: '60s',
    placeholder: 'https://youtube.com/@channel',
    hint: 'Users must visit your channel for 60 seconds.',
  },
  {
    value: 'discord_server',
    label: 'Discord Server',
    icon: MessageCircle,
    color: 'text-indigo-400',
    badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    timer: 'OAuth',
    placeholder: 'https://discord.gg/...',
    hint: 'Users must join via Discord OAuth — membership is verified.',
  },
  {
    value: 'generic_url',
    label: 'Generic Link',
    icon: Globe,
    color: 'text-gray-400',
    badge: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    timer: '45s',
    placeholder: 'https://...',
    hint: 'Users must visit the link for 45 seconds.',
  },
];

function typeMeta(type: string) {
  return CHECKPOINT_TYPES.find((t) => t.value === type) || CHECKPOINT_TYPES[3];
}

export default function Checkpoints() {
  const { user, subscribed, isAdmin } = useAuth();
  const navigate = useNavigate();
  const isStarter = !subscribed && !isAdmin;

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [hasCreatorProfile, setHasCreatorProfile] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [cpType, setCpType] = useState('youtube_video');
  // Your DB currently enforces a provider allowlist; we keep this fixed since you're not using providers manually.
  const provider = 'lootlabs';
  const [name, setName] = useState('');
  const [displayLabel, setDisplayLabel] = useState('');
  const [link, setLink] = useState('');
  const [guildId, setGuildId] = useState('');
  const [order, setOrder] = useState('1');
  const [saving, setSaving] = useState(false);
  const [filterProject, setFilterProject] = useState('all');
  const [sessions, setSessions] = useState<CheckpointSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [showOnlyCompleted, setShowOnlyCompleted] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    const [cpRes, prRes] = await Promise.all([
      supabase.from('checkpoint_configs').select('*').order('checkpoint_order', { ascending: true }),
      supabase.from('projects').select('id, name'),
    ]);
    if (cpRes.data) setCheckpoints(cpRes.data as Checkpoint[]);
    if (prRes.data) setProjects(prRes.data);
    setLoading(false);
  };

  const fetchSessions = async () => {
    if (!user) return;
    setSessionsLoading(true);
    try {
      const { data: sessionRows, error: sessionErr } = await supabase
        .from('checkpoint_sessions')
        .select('id, project_id, session_token, ip_address, completed_all, issued_key, created_at, expires_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (sessionErr) throw sessionErr;

      const tokens = (sessionRows || []).map((s) => s.session_token);
      let completionCounts = new Map<string, number>();
      if (tokens.length > 0) {
        const { data: completionRows, error: completionErr } = await supabase
          .from('checkpoint_completions')
          .select('session_token')
          .in('session_token', tokens);
        if (completionErr) throw completionErr;
        completionCounts = (completionRows || []).reduce((map, row: any) => {
          map.set(row.session_token, (map.get(row.session_token) || 0) + 1);
          return map;
        }, new Map<string, number>());
      }

      const mapped: CheckpointSession[] = (sessionRows || []).map((s) => ({
        ...s,
        completed_count: completionCounts.get(s.session_token) || 0,
      }));
      setSessions(mapped);
    } catch (e: any) {
      toast({ title: 'Failed to load session monitor', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSessionsLoading(false);
    }
  };

  const fetchCreatorProfileStatus = async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const { data } = await supabase
        .from('creator_profiles')
        .select('username')
        .eq('user_id', user.id)
        .maybeSingle();

      setHasCreatorProfile(!!data?.username?.trim());
    } catch {
      setHasCreatorProfile(false);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchCreatorProfileStatus();
    fetchSessions();
  }, [user]);

  const openCreate = () => {
    if (!profileLoading && !hasCreatorProfile) {
      toast({
        title: 'Create your Checkpoint profile first',
        description: 'Add your creator profile (username + optional images + Discord link) before adding checkpoints.',
        variant: 'destructive',
      });
      navigate('/dashboard/profile');
      return;
    }

    setName('');
    setDisplayLabel('');
    setLink('');
    setGuildId('');
    setOrder('1');
    setCpType(isStarter ? 'generic_url' : 'youtube_video');
    setSelectedProject(projects[0]?.id || '');
    setDialogOpen(true);
  };

  const save = async () => {
    if (!selectedProject) {
      toast({ title: 'Select a project', variant: 'destructive' });
      return;
    }
    if (!name.trim()) {
      toast({ title: 'Checkpoint name required', variant: 'destructive' });
      return;
    }
    if (!link.trim()) {
      toast({ title: 'Link required', variant: 'destructive' });
      return;
    }
    if (cpType === 'discord_server' && !guildId.trim()) {
      toast({ title: 'Guild ID required for Discord checkpoints', variant: 'destructive' });
      return;
    }
    if (isStarter && cpType !== 'generic_url') {
      toast({
        title: 'Starter plan limitation',
        description: 'Starter accounts can only create generic-link checkpoints.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('checkpoint_configs').insert({
      project_id: selectedProject,
      user_id: user!.id,            // ← required by RLS policy
      checkpoint_type: cpType,
      checkpoint_name: name.trim(),
      display_label: displayLabel.trim() || null,
      provider,
      provider_link: link.trim(),
      guild_id: cpType === 'discord_server' ? guildId.trim() : null,
      checkpoint_order: parseInt(order) || 1,
      is_active: true,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Checkpoint created!' });
      setDialogOpen(false);
      fetchData();
    }
    setSaving(false);
  };

  const deleteCheckpoint = async (id: string) => {
    const { error } = await supabase.from('checkpoint_configs').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setCheckpoints((prev) => prev.filter((c) => c.id !== id));
      toast({ title: 'Checkpoint removed' });
    }
  };

  const copyLink = (projectId: string) => {
    const url = `${window.location.origin}/get-key/${projectId}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Copied get-key link!' });
  };
  const getProjectName = (id: string) => projects.find((p) => p.id === id)?.name || 'Unknown';

  const filtered = filterProject === 'all'
    ? checkpoints
    : checkpoints.filter((c) => c.project_id === filterProject);
  const filteredSessions = filterProject === 'all'
    ? sessions
    : sessions.filter((s) => s.project_id === filterProject);
  const totalByProject = checkpoints.reduce((acc, cp) => {
    acc[cp.project_id] = (acc[cp.project_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const short = (v: string | null | undefined, n = 10) => {
    if (!v) return '—';
    return v.length <= n ? v : `${v.slice(0, n)}...`;
  };
  const now = Date.now();
  const visibleSessions = filteredSessions.filter((s) => {
    const notExpired = !s.expires_at || new Date(s.expires_at).getTime() > now;
    if (!notExpired) return false;
    if (!showOnlyCompleted) return true;
    const total = totalByProject[s.project_id] || 0;
    return !!s.completed_all || (total > 0 && s.completed_count >= total);
  });

  const currentTypeMeta = typeMeta(cpType);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Link2 className="h-7 w-7 text-primary" />
            Checkpoints
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Users must complete all checkpoints to claim their key.
          </p>
          {isStarter && (
            <p className="text-xs text-muted-foreground mt-1">
              Starter supports generic-link checkpoints only.
            </p>
          )}
        </div>
        <Button onClick={openCreate} disabled={projects.length === 0 || profileLoading || !hasCreatorProfile}>
          <Plus className="h-4 w-4 mr-2" /> Add Checkpoint
        </Button>
      </div>

      {!profileLoading && !hasCreatorProfile && (
        <Card className="border-dashed bg-card/30">
          <CardContent className="py-8 text-center">
            <p className="text-sm font-medium">Checkpoint profile not created yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your creator profile first, then come back to add your checkpoint links + names.
            </p>
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => navigate('/dashboard/profile')}>
                Go to profile
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {projects.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Create a project first, then add checkpoints.
          </CardContent>
        </Card>
      )}

      {/* Filter + Copy Row */}
      {projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by project…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filterProject !== 'all' && (
            <Button variant="outline" size="sm" onClick={() => copyLink(filterProject)}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Get-Key Link
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Timer</TableHead>
                <TableHead>Link</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cp) => {
                const meta = typeMeta(cp.checkpoint_type || 'generic_url');
                return (
                  <TableRow key={cp.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {cp.checkpoint_order}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{cp.checkpoint_name}</p>
                        {cp.display_label && (
                          <p className="text-[11px] text-muted-foreground">{cp.display_label}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${meta.badge}`}>
                        <meta.icon className="h-2.5 w-2.5 mr-1" />
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground">{meta.timer}</span>
                    </TableCell>
                    <TableCell>
                      <a
                        href={cp.provider_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline max-w-[180px] truncate"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {cp.provider_link}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive/70 hover:text-destructive"
                        onClick={() => deleteCheckpoint(cp.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {!loading && filtered.length === 0 && projects.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No checkpoints yet. Click "Add Checkpoint" to create one.
          </CardContent>
        </Card>
      )}

      {/* Session Monitor */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Active Checkpoint Sessions</CardTitle>
              <CardDescription>
                Track progress, completion status, and key issuance for checkpoint sessions.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchSessions} disabled={sessionsLoading}>
              <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
              {sessionsLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              id="completed-only"
              type="checkbox"
              checked={showOnlyCompleted}
              onChange={(e) => setShowOnlyCompleted(e.target.checked)}
            />
            <label htmlFor="completed-only">Show only completed</label>
            <span className="opacity-70">(non-expired sessions only)</span>
          </div>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <p className="text-sm text-muted-foreground">Loading session monitor...</p>
          ) : visibleSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No checkpoint sessions found yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issued Key</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSessions.map((s) => {
                    const total = totalByProject[s.project_id] || 0;
                    const allDone = !!s.completed_all || (total > 0 && s.completed_count >= total);
                    const projectName = getProjectName(s.project_id);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{projectName}</TableCell>
                        <TableCell className="font-mono text-xs" title={s.session_token}>{short(s.session_token, 14)}</TableCell>
                        <TableCell className="font-mono text-xs" title={s.ip_address || ''}>{short(s.ip_address, 16)}</TableCell>
                        <TableCell className="text-xs font-mono">{s.completed_count}/{total}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={allDone ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-muted text-muted-foreground'}>
                            {allDone ? 'Completed' : 'In Progress'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.issued_key ? (
                            <span title={s.issued_key}>{short(s.issued_key, 12)}</span>
                          ) : (
                            <span className="text-muted-foreground">Not issued</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(s.session_token);
                                toast({ title: 'Session token copied' });
                              }}
                            >
                              <Copy className="h-3.5 w-3.5 mr-1.5" />
                              Token
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!s.issued_key}
                              onClick={() => {
                                if (!s.issued_key) return;
                                navigator.clipboard.writeText(s.issued_key);
                                toast({ title: 'Issued key copied' });
                              }}
                            >
                              <Copy className="h-3.5 w-3.5 mr-1.5" />
                              Key
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Checkpoint</DialogTitle>
            <DialogDescription>
              Users will be required to complete this before receiving a key.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Project */}
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label>Checkpoint Type</Label>
              <Select value={cpType} onValueChange={setCpType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isStarter ? CHECKPOINT_TYPES.filter((t) => t.value === 'generic_url') : CHECKPOINT_TYPES).map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <t.icon className={`h-3.5 w-3.5 ${t.color}`} />
                        {t.label}
                        <span className="text-muted-foreground text-[10px]">({t.timer})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{currentTypeMeta.hint}</p>
            </div>

            {/* Checkpoint Name */}
            <div className="space-y-1.5">
              <Label>Checkpoint Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Watch my latest video" />
            </div>

            {/* Display Label (optional) */}
            <div className="space-y-1.5">
              <Label>Action Label <span className="text-muted-foreground text-[11px]">(optional)</span></Label>
              <Input
                value={displayLabel}
                onChange={(e) => setDisplayLabel(e.target.value)}
                placeholder="Subscribe to my channel"
              />
              <p className="text-[11px] text-muted-foreground">Shown to the user under the checkpoint name</p>
            </div>

            {/* Link */}
            <div className="space-y-1.5">
              <Label>Link</Label>
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={currentTypeMeta.placeholder}
                type="url"
              />
            </div>

            {/* Guild ID (Discord only) */}
            {cpType === 'discord_server' && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  <MessageCircle className="h-3.5 w-3.5 text-indigo-400" />
                  Discord Guild ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={guildId}
                  onChange={(e) => setGuildId(e.target.value)}
                  placeholder="123456789012345678"
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Right-click your server in Discord → Copy Server ID (enable Developer Mode first).
                </p>
              </div>
            )}

            {/* Order */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <ArrowUpDown className="h-3.5 w-3.5" /> Order
              </Label>
              <Input
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                type="number"
                min="1"
                className="w-24 font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Add Checkpoint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
