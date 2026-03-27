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
import { Plus, Ban, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface BlacklistEntry {
  id: string;
  project_id: string;
  type: string;
  value: string;
  reason: string | null;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

export default function Blacklist() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [selectedProject, setSelectedProject] = useState('');
  const [type, setType] = useState('ip');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const [blRes, projRes] = await Promise.all([
      supabase.from('blacklists').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name'),
    ]);
    if (blRes.data) setEntries(blRes.data);
    if (projRes.data) setProjects(projRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openDialog = () => {
    setValue('');
    setReason('');
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!selectedProject || !value.trim()) return;
    setSaving(true);

    const newEntry = {
      project_id: selectedProject,
      user_id: user!.id,
      type,
      value: value.trim(),
      reason: reason.trim() || null,
    };

    const { error } = await supabase.from('blacklists').insert(newEntry);
    setSaving(false);
    
    if (error) {
      if (error.code === '23505') {
        toast({ title: 'Error', description: 'This entry already exists in the blacklist.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
    } else {
      toast({ title: 'Blacklist entry added' });
      setDialogOpen(false);
      fetchData();
    }
  };

  const deleteEntry = async (id: string) => {
    await supabase.from('blacklists').delete().eq('id', id);
    toast({ title: 'Entry removed from blacklist' });
    fetchData();
  };

  const getProjectName = (id: string) => projects.find((p) => p.id === id)?.name || 'Unknown';

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading blacklists...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Access Blacklist</h1>
          <p className="text-sm text-muted-foreground mt-1">Block specific IPs, HWIDs, or License Keys from accessing your scripts.</p>
        </div>
        <Button onClick={openDialog} disabled={projects.length === 0} className="active:scale-[0.97] transition-transform">
          <Plus className="h-4 w-4" /> Add to Blacklist
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Ban className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Create a project first before managing blacklists.</p>
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Ban className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No entries in the blacklist yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-semibold uppercase text-xs">{entry.type}</TableCell>
                    <TableCell>
                      <code className="font-mono text-xs">{entry.value}</code>
                    </TableCell>
                    <TableCell className="text-sm">{getProjectName(entry.project_id)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.reason || '—'}</TableCell>
                    <TableCell className="text-xs">{new Date(entry.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteEntry(entry.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
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
            <DialogTitle>Add to Blacklist</DialogTitle>
            <DialogDescription>Block an IP address, HWID, or License Key across your project.</DialogDescription>
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
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ip">IP Address</SelectItem>
                    <SelectItem value="hwid">Hardware ID (HWID)</SelectItem>
                    <SelectItem value="key">License Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input placeholder={type === 'ip' ? 'e.g. 192.168.1.1' : type === 'hwid' ? 'e.g. A1B2-C3D4...' : 'e.g. KEY-123'} value={value} onChange={(e) => setValue(e.target.value)} className="bg-background/50" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input placeholder="Why is this being blacklisted?" value={reason} onChange={(e) => setReason(e.target.value)} className="bg-background/50" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !selectedProject || !value.trim()} variant="destructive">{saving ? 'Adding...' : 'Add to Blacklist'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
