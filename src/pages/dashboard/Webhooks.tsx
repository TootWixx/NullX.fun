import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, Webhook, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface WebhookConfig {
  id: string;
  project_id: string;
  discord_webhook_url: string;
  log_key_auth: boolean;
  log_key_reset: boolean;
  log_hwid_change: boolean;
  log_ip: boolean;
  log_isp: boolean;
  log_location: boolean;
  log_os: boolean;
  log_hwid: boolean;
  log_project: boolean;
  log_roblox_user: boolean;
  log_roblox_age: boolean;
  log_roblox_id: boolean;
  log_key: boolean;
  log_uses: boolean;
  is_active: boolean;
}

interface Project { id: string; name: string; }

export default function Webhooks() {
  const { user } = useAuth();
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const [whRes, prRes] = await Promise.all([
      supabase.from('webhook_configs').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name'),
    ]);
    if (whRes.data) setWebhooks(whRes.data as unknown as WebhookConfig[]);
    if (prRes.data) setProjects(prRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!selectedProject || !webhookUrl.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('webhook_configs').insert({
      project_id: selectedProject,
      user_id: user!.id,
      discord_webhook_url: webhookUrl.trim(),
    });
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Webhook added' }); setDialogOpen(false); setWebhookUrl(''); fetchData(); }
  };

  const toggleField = async (wh: WebhookConfig, field: string, val: boolean) => {
    await supabase.from('webhook_configs').update({ [field]: val } as any).eq('id', wh.id);
    fetchData();
  };

  const deleteWebhook = async (id: string) => {
    await supabase.from('webhook_configs').delete().eq('id', id);
    fetchData();
  };

  const getProjectName = (id: string) => projects.find((p) => p.id === id)?.name || 'Unknown';

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading webhooks...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Discord Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">Log authentication events to Discord</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} disabled={projects.length === 0} className="active:scale-[0.97] transition-transform">
          <Plus className="h-4 w-4" /> Add Webhook
        </Button>
      </div>

      {webhooks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Webhook className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No webhooks configured. Add one to start logging events to Discord.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {webhooks.map((wh) => (
            <Card key={wh.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{getProjectName(wh.project_id)}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Switch checked={wh.is_active} onCheckedChange={(val) => toggleField(wh, 'is_active', val)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteWebhook(wh.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <code className="text-xs text-muted-foreground font-mono truncate block">{wh.discord_webhook_url}</code>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Event Toggles */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Events</p>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_key_auth} onCheckedChange={(val) => toggleField(wh, 'log_key_auth', val)} id={`auth-${wh.id}`} />
                      <Label htmlFor={`auth-${wh.id}`} className="text-sm">Key Auth</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_key_reset} onCheckedChange={(val) => toggleField(wh, 'log_key_reset', val)} id={`reset-${wh.id}`} />
                      <Label htmlFor={`reset-${wh.id}`} className="text-sm">Key Reset</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_hwid_change} onCheckedChange={(val) => toggleField(wh, 'log_hwid_change', val)} id={`hwidchg-${wh.id}`} />
                      <Label htmlFor={`hwidchg-${wh.id}`} className="text-sm">HWID Change</Label>
                    </div>
                  </div>
                </div>

                {/* Roblox User Info Toggles */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Roblox Player Info</p>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_roblox_user !== false} onCheckedChange={(val) => toggleField(wh, 'log_roblox_user', val)} id={`rbuser-${wh.id}`} />
                      <Label htmlFor={`rbuser-${wh.id}`} className="text-sm">Username</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_roblox_age !== false} onCheckedChange={(val) => toggleField(wh, 'log_roblox_age', val)} id={`rbage-${wh.id}`} />
                      <Label htmlFor={`rbage-${wh.id}`} className="text-sm">Account Age</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_roblox_id !== false} onCheckedChange={(val) => toggleField(wh, 'log_roblox_id', val)} id={`rbid-${wh.id}`} />
                      <Label htmlFor={`rbid-${wh.id}`} className="text-sm">User ID</Label>
                    </div>
                  </div>
                </div>

                {/* Data Field Toggles */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Logged Fields</p>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_project !== false} onCheckedChange={(val) => toggleField(wh, 'log_project', val)} id={`proj-${wh.id}`} />
                      <Label htmlFor={`proj-${wh.id}`} className="text-sm">Project Name</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_key !== false} onCheckedChange={(val) => toggleField(wh, 'log_key', val)} id={`key-${wh.id}`} />
                      <Label htmlFor={`key-${wh.id}`} className="text-sm">License Key</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_uses !== false} onCheckedChange={(val) => toggleField(wh, 'log_uses', val)} id={`uses-${wh.id}`} />
                      <Label htmlFor={`uses-${wh.id}`} className="text-sm">Usage Count</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_ip !== false} onCheckedChange={(val) => toggleField(wh, 'log_ip', val)} id={`ip-${wh.id}`} />
                      <Label htmlFor={`ip-${wh.id}`} className="text-sm">IP Address</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_hwid !== false} onCheckedChange={(val) => toggleField(wh, 'log_hwid', val)} id={`hwid-${wh.id}`} />
                      <Label htmlFor={`hwid-${wh.id}`} className="text-sm">HWID</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_isp} onCheckedChange={(val) => toggleField(wh, 'log_isp', val)} id={`isp-${wh.id}`} />
                      <Label htmlFor={`isp-${wh.id}`} className="text-sm">ISP</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_location} onCheckedChange={(val) => toggleField(wh, 'log_location', val)} id={`loc-${wh.id}`} />
                      <Label htmlFor={`loc-${wh.id}`} className="text-sm">Location</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={wh.log_os} onCheckedChange={(val) => toggleField(wh, 'log_os', val)} id={`os-${wh.id}`} />
                      <Label htmlFor={`os-${wh.id}`} className="text-sm">OS</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Discord Webhook</DialogTitle>
            <DialogDescription>Link a Discord webhook to log auth events</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="bg-background/50"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Discord Webhook URL</Label>
              <Input placeholder="https://discord.com/api/webhooks/..." value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="bg-background/50 font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !selectedProject || !webhookUrl.trim()}>{saving ? 'Adding...' : 'Add Webhook'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
