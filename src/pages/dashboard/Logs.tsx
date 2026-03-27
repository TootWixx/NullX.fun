import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollText, Users, MessageSquare, Skull, RefreshCw, Smartphone, Monitor, Gamepad2, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Log {
  id: string;
  project_id: string;
  event_type: string;
  ip_address: string | null;
  hwid: string | null;
  details: any;
  created_at: string;
}

interface ActiveSession {
  id: string;
  project_id: string;
  key_id: string;
  hwid: string | null;
  ip_address: string | null;
  os: string | null;
  last_ping: string;
  status: 'active' | 'killed';
  message: string | null;
  created_at: string;
  license_keys?: { key_value: string };
}

interface Project { id: string; name: string; }

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msgInput, setMsgInput] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedKillSession, setSelectedKillSession] = useState<string | null>(null);
  const [killReason, setKillReason] = useState('Your session has been terminated by the administrator.');

  const fetchData = async () => {
    setRefreshing(true);
    
    const [logsRes, projRes, activeRes] = await Promise.all([
      supabase.from('auth_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('projects').select('id, name'),
      supabase.from('active_sessions').select('*, license_keys(key_value)').order('last_ping', { ascending: false }).limit(200),
    ]);
    
    if (logsRes.data) setLogs(logsRes.data);
    if (projRes.data) setProjects(projRes.data);
    
    if (activeRes.data) {
      // Show sessions active in the last 10 minutes to be safe
      const threshold = Date.now() - 10 * 60 * 1000;
      const validSessions = (activeRes.data as any[]).filter(s => 
        new Date(s.last_ping).getTime() > threshold || s.status === 'killed'
      );
      setActiveSessions(validSessions);
    } else if (activeRes.error) {
      console.error("Error fetching active sessions:", activeRes.error);
    }
    
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Auto refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const handleKill = async () => {
    if (!selectedKillSession) return;
    const { error } = await supabase.from('active_sessions').update({ 
      status: 'killed',
      message: killReason.trim()
    }).eq('id', selectedKillSession);
    
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Session Terminated', description: 'User will be kicked on next heartbeat with your reason.' });
      setSelectedKillSession(null);
      setKillReason('Your session has been terminated by the administrator.');
      fetchData();
    }
  };

  const handleSendMessage = async () => {
    if (!selectedSession || !msgInput.trim()) return;
    const { error } = await supabase.from('active_sessions').update({ message: msgInput.trim() }).eq('id', selectedSession);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Message Queued', description: 'Message will be delivered on next heartbeat.' });
      setMsgInput('');
      setSelectedSession(null);
    }
  };

  const handleDeleteSession = async (id: string) => {
      const { error } = await supabase.from('active_sessions').delete().eq('id', id);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else {
          toast({ title: 'Session Cleared' });
          fetchData();
      }
  };

  const getPlaytime = (createdAt: string) => {
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
    const hrs = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    const secs = diff % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const filteredLogs = filter === 'all' ? logs : logs.filter((l) => l.project_id === filter);
  const filteredSessions = filter === 'all' ? activeSessions : activeSessions.filter((s) => s.project_id === filter);
  const getProjectName = (id: string) => projects.find((p) => p.id === id)?.name || 'Unknown';

  const getOsIcon = (os: string | null) => {
    const s = (os || '').toLowerCase();
    if (s.includes('mobile')) return <Smartphone className="h-3.5 w-3.5" />;
    if (s.includes('console')) return <Gamepad2 className="h-3.5 w-3.5" />;
    return <Monitor className="h-3.5 w-3.5" />;
  };

  const eventColors: Record<string, string> = {
    key_auth: 'text-primary',
    key_failed: 'text-destructive',
    hwid_locked: 'text-yellow-500',
    key_expired: 'text-orange-500',
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading activity...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auth Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor script authentication activity</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="logs" className="space-y-4">
        <div className="flex items-center justify-between bg-muted/30 p-1 rounded-lg border border-border/50">
          <TabsList className="bg-transparent border-0">
            <TabsTrigger value="logs" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <ScrollText className="h-4 w-4 mr-2" />
              Auth Logs
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Users className="h-4 w-4 mr-2" />
              Active Players
              {activeSessions.length > 0 && (
                <span className="ml-2 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary animate-pulse">
                  {activeSessions.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="sm" onClick={fetchData} disabled={refreshing} className="h-8 text-xs font-medium">
            <RefreshCw className={`h-3 w-3 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <TabsContent value="logs">
          {filteredLogs.length === 0 ? (
            <Card className="border-dashed">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ScrollText className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No auth logs yet. Logs appear when scripts authenticate.</p>
              </div>
            </Card>
          ) : (
            <Card className="border-none shadow-none bg-background/50">
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[180px]">Time</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>IP / HWID</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-[11px] tabular-nums whitespace-nowrap text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-background border ${eventColors[log.event_type] || 'text-foreground'}`}>
                            {log.event_type.replace('_', ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{getProjectName(log.project_id)}</TableCell>
                        <TableCell>
                           <div className="space-y-0.5">
                             <p className="font-mono text-[10px] text-foreground/80">{log.ip_address || '—'}</p>
                             <p className="font-mono text-[9px] text-muted-foreground truncate max-w-[120px]">{log.hwid || '—'}</p>
                           </div>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground max-w-[200px] truncate">
                          {log.details ? JSON.stringify(log.details) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="active">
          {filteredSessions.length === 0 ? (
            <Card className="border-dashed">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No players tracked currently.</p>
                <p className="text-xs text-muted-foreground mt-1 px-4">Ensure your scripts have the heartbeat loop enabled and are actively running.</p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredSessions.map((session) => (
                <Card key={session.id} className={`overflow-hidden transition-all border-l-4 ${session.status === 'killed' ? 'border-l-destructive grayscale opacity-60' : 'border-l-primary shadow-sm hover:shadow-md'}`}>
                   <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-start justify-between space-y-0">
                     <div className="space-y-1">
                       <CardTitle className="text-sm font-bold flex items-center gap-2">
                         {getOsIcon(session.os)}
                         {session.license_keys?.key_value || 'Unknown Key'}
                       </CardTitle>
                       <CardDescription className="text-[11px] flex items-center gap-2">
                         <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                         Active in {getProjectName(session.project_id)}
                       </CardDescription>
                     </div>
                     <div className="flex items-center gap-1">
                        <Dialog open={selectedKillSession === session.id} onOpenChange={(open) => setSelectedKillSession(open ? session.id : null)}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" disabled={session.status === 'killed'} title="Kill Session">
                              <Skull className="h-3.5 w-3.5" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2 text-destructive">
                                <Skull className="h-5 w-5" />
                                Terminate Session
                              </DialogTitle>
                              <DialogDescription>
                                Provide a reason for termination. This will be displayed on the player's kick screen.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                              <Input
                                placeholder="Reason for termination..."
                                value={killReason}
                                onChange={(e) => setKillReason(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleKill()}
                                className="bg-background/50 border-destructive/20 focus-visible:ring-destructive"
                              />
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setSelectedKillSession(null)}>Cancel</Button>
                              <Button variant="destructive" onClick={handleKill}>Terminate Player</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <Dialog open={selectedSession === session.id} onOpenChange={(open) => setSelectedSession(open ? session.id : null)}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" title="Send Live Message">
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>Send Live Message</DialogTitle>
                              <DialogDescription>
                                This message will appear as a Roblox system notification on the player's screen during their next heartbeat.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                              <Input
                                placeholder="Enter message to display..."
                                value={msgInput}
                                onChange={(e) => setMsgInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                className="bg-background/50"
                              />
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setSelectedSession(null)}>Cancel</Button>
                              <Button onClick={handleSendMessage} disabled={!msgInput.trim()}>Send Message</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-muted/50" onClick={() => handleDeleteSession(session.id)} title="Clear Session Record">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                     </div>
                   </CardHeader>
                   <CardContent className="px-4 pb-4 space-y-2">
                     <div className="grid grid-cols-2 gap-2 text-[10px]">
                       <div className="space-y-0.5">
                         <p className="text-muted-foreground uppercase font-bold text-[9px] tracking-wide">IP Address</p>
                         <p className="font-mono text-foreground/80">{session.ip_address || 'Unknown'}</p>
                       </div>
                       <div className="space-y-0.5">
                         <p className="text-muted-foreground uppercase font-bold text-[9px] tracking-wide">Playtime</p>
                         <p className="font-mono text-foreground/80">{getPlaytime(session.created_at)}</p>
                       </div>
                     </div>
                     <div className="pt-1.5 border-t border-border/50">
                        <p className="text-muted-foreground uppercase font-bold text-[9px] tracking-wide">Last Ping</p>
                        <p className="font-mono text-[10px] text-foreground/80">{Math.floor((Date.now() - new Date(session.last_ping).getTime()) / 1000)}s ago</p>
                     </div>
                     {session.status === 'killed' && (
                       <p className="text-[10px] text-destructive font-bold flex items-center gap-1.5 pt-1">
                         <Skull className="h-3 w-3" /> SESSION TERMINATED
                       </p>
                     )}
                     {session.message && (
                       <div className="rounded border bg-primary/5 p-2 text-[10px] text-primary/80 flex items-start gap-2">
                         <MessageSquare className="h-3 w-3 shrink-0 mt-0.5" />
                         <span className="italic">"{session.message}" (pending delivery...)</span>
                       </div>
                     )}
                   </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
