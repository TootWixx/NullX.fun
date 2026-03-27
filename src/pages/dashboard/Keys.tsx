import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Key, Copy, Trash2, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface LicenseKey {
  id: string;
  project_id: string;
  key_value: string;
  note: string | null;
  hwid: string | null;
  max_uses: number;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

function generateKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = 4;
  const segLen = 5;
  const parts: string[] = [];
  for (let i = 0; i < segments; i++) {
    let seg = '';
    for (let j = 0; j < segLen; j++) seg += chars[Math.floor(Math.random() * chars.length)];
    parts.push(seg);
  }
  return parts.join('-');
}

export default function Keys() {
  const { user, subscribed, isAdmin } = useAuth();
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresIn, setExpiresIn] = useState('');
  const [batchCount, setBatchCount] = useState('1');
  const [saving, setSaving] = useState(false);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isStarter = !subscribed && !isAdmin;
  const starterGeneratedCount = keys.length;
  const starterRemaining = Math.max(0, 60 - starterGeneratedCount);

  const fetchData = async () => {
    // Auto-delete expired keys only when they are active and HWID-locked.
    await supabase
      .from('license_keys')
      .delete()
      .eq('is_active', true)
      .not('hwid', 'is', null)
      .lt('expires_at', new Date().toISOString());

    const [keysRes, projRes] = await Promise.all([
      supabase.from('license_keys').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name'),
    ]);
    if (keysRes.data) setKeys(keysRes.data);
    if (projRes.data) setProjects(projRes.data);
    setSelectedIds(new Set());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openDialog = () => {
    setKeyValue(generateKey());
    setBatchCount('1');
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!selectedProject) return;
    setSaving(true);
    const count = Math.min(Math.max(parseInt(batchCount) || 1, 1), 50);
    if (isStarter && count > starterRemaining) {
      setSaving(false);
      toast({
        title: 'Starter key generation limit reached',
        description: `Starter allows 60 key generations total. Remaining: ${starterRemaining}.`,
        variant: 'destructive',
      });
      return;
    }
    const expiresAt = expiresIn ? new Date(Date.now() + parseInt(expiresIn) * 86400000).toISOString() : null;

    const rows = Array.from({ length: count }, () => ({
      project_id: selectedProject,
      user_id: user!.id,
      key_value: count === 1 ? keyValue : generateKey(),
      note: note.trim() || null,
      max_uses: parseInt(maxUses) || 1,
      expires_at: expiresAt,
    }));

    const { error } = await supabase.from('license_keys').insert(rows);
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: `${count} key(s) created` });
      setDialogOpen(false);
      setNote('');
      fetchData();
    }
  };

  const deleteKey = async (id: string) => {
    await supabase.from('license_keys').delete().eq('id', id);
    fetchData();
  };

  const bulkDeleteKeys = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const { error } = await supabase.from('license_keys').delete().in('id', ids);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Deleted ${ids.length} key(s)` });
    fetchData();
  };

  const toggleKey = async (key: LicenseKey) => {
    await supabase.from('license_keys').update({ is_active: !key.is_active }).eq('id', key.id);
    fetchData();
  };

  const resetHwid = async (id: string) => {
    await supabase.from('license_keys').update({ hwid: null }).eq('id', id);
    toast({ title: 'HWID reset' });
    fetchData();
  };

  const copyKey = (val: string) => {
    navigator.clipboard.writeText(val);
    toast({ title: 'Key copied' });
  };

  const getProjectName = (id: string) => projects.find((p) => p.id === id)?.name || 'Unknown';
  const isExpired = (k: LicenseKey) => {
    if (!k.expires_at) return false;
    return new Date(k.expires_at).getTime() < Date.now();
  };
  const visibleKeys = filterProject === 'all' ? keys : keys.filter(k => k.project_id === filterProject);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every(k => selectedIds.has(k.id));

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading keys...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Key className="h-7 w-7 text-primary" />
            User License Keys
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Generate and manage end-user keys; panel keys are shown separately in Admin.</p>
        </div>
        <div className="flex items-center gap-3">
          {projects.length > 0 && (
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-[180px] bg-background/50">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={openDialog} disabled={projects.length === 0 || (isStarter && starterRemaining <= 0)} className="active:scale-[0.97] transition-transform shadow-sm">
            <Plus className="h-4 w-4" /> Generate Keys
          </Button>
        </div>
      </div>
      {isStarter && (
        <p className="text-xs text-muted-foreground -mt-4">
          Starter limit: 60 key generations total ({starterRemaining} remaining).
        </p>
      )}

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Create a project first before generating keys.</p>
          </CardContent>
        </Card>
      ) : visibleKeys.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No keys generated yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          {selectedIds.size > 0 && (
            <div className="px-4 pt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{selectedIds.size} key(s) selected</p>
              <Button variant="destructive" size="sm" onClick={bulkDeleteKeys}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) visibleKeys.forEach(k => next.add(k.id));
                        else visibleKeys.forEach(k => next.delete(k.id));
                        setSelectedIds(next);
                      }}
                    />
                  </TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>HWID</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(key.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(key.id);
                          else next.delete(key.id);
                          setSelectedIds(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-xs">{key.key_value}</code>
                        <button onClick={() => copyKey(key.key_value)} className="text-muted-foreground hover:text-foreground transition-colors"><Copy className="h-3 w-3" /></button>
                      </div>
                      {key.note && <p className="text-xs text-muted-foreground mt-0.5">{key.note}</p>}
                    </TableCell>
                    <TableCell className="text-sm">{getProjectName(key.project_id)}</TableCell>
                    <TableCell>
                      {(() => {
                        const checkpointTaken = !!key.note && key.note.startsWith('Checkpoint key —');
                        const checkpointReserved = checkpointTaken && !key.hwid && key.current_uses === 1;
                        const active =
                          key.is_active &&
                          !isExpired(key) &&
                          key.current_uses < key.max_uses;

                        const label = checkpointTaken
                          ? `${active ? 'Active' : 'Inactive'} (Checkpoint)`
                          : active
                          ? 'Active'
                          : 'Inactive';
                        const cls = checkpointReserved
                          ? 'bg-violet-500/15 text-violet-300'
                          : active
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground';

                        return (
                          <button
                            onClick={() => toggleKey(key)}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${cls}`}
                          >
                            {label}
                          </button>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{key.current_uses}/{key.max_uses}</TableCell>
                    <TableCell className="font-mono text-xs">{key.hwid ? key.hwid.slice(0, 12) + '...' : '—'}</TableCell>
                    <TableCell className="text-xs">{key.expires_at ? new Date(key.expires_at).toLocaleDateString() : 'Never'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {key.hwid && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => resetHwid(key.id)} title="Reset HWID"><RefreshCw className="h-3 w-3" /></Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteKey(key.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate User License Keys</DialogTitle>
            <DialogDescription>Create the keys your users enter after the embedded panel key is validated.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="bg-background/50"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Batch Count</Label>
                <Input type="number" min="1" max={isStarter ? String(Math.max(starterRemaining, 1)) : "50"} value={batchCount} onChange={(e) => setBatchCount(e.target.value)} className="bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label>Max Uses</Label>
                <Input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="bg-background/50" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Expires In (days, leave empty for never)</Label>
              <Input type="number" min="1" placeholder="e.g. 30" value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)} className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input placeholder="Customer name or reason" value={note} onChange={(e) => setNote(e.target.value)} className="bg-background/50" />
            </div>
            {batchCount === '1' && (
              <div className="space-y-2">
                <Label>Key Value</Label>
                <div className="flex gap-2">
                  <Input value={keyValue} onChange={(e) => setKeyValue(e.target.value)} className="bg-background/50 font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => setKeyValue(generateKey())}><RefreshCw className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !selectedProject}>{saving ? 'Creating...' : 'Generate'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
