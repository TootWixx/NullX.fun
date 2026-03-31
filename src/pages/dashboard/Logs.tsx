import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  status: 'active' | 'killed' | 'disconnected';
  message: string | null;
  created_at: string;
  license_keys?: { key_value: string };
}

interface Project { id: string; name: string; }

interface MessageThread {
  id: string;
  session_id: string;
  sender_type: 'admin' | 'user';
  message: string;
  notification_type: string;
  can_reply: boolean;
  is_delivered: boolean;
  reply_to_message_id: string | null;
  created_at: string;
  active_sessions?: {
    id: string;
    license_keys?: { key_value: string };
    details?: { roblox_username?: string };
  };
}

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [activeChats, setActiveChats] = useState<MessageThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<MessageThread[]>([]);
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
      // Mark sessions older than 2 minutes as stale/disconnected
      const staleThreshold = Date.now() - 2 * 60 * 1000;
      const processedSessions = (activeRes.data as any[]).map(s => {
        const lastPingTime = new Date(s.last_ping).getTime();
        const isStale = lastPingTime < staleThreshold;
        // If stale and was active, mark as disconnected
        if (isStale && s.status === 'active') {
          return { ...s, status: 'disconnected' };
        }
        return s;
      });
      setActiveSessions(processedSessions);
    } else if (activeRes.error) {
      console.error("Error fetching active sessions:", activeRes.error);
    }
    
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchData();
    fetchActiveChats();
    const interval = setInterval(() => {
      fetchData();
      fetchActiveChats();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleKill = async () => {
    if (!selectedKillSession) return;
    
    // Store kick message in message_threads for custom UI notification
    const { error: msgError } = await supabase.from('message_threads').insert({
      session_id: selectedKillSession,
      sender_type: 'admin',
      message: killReason.trim(),
      notification_type: 'kick',
      can_reply: false,
    });
    
    if (msgError) console.error('Error storing kick message:', msgError);
    
    const { error } = await supabase.from('active_sessions').update({ 
      status: 'killed',
      kick_reason: killReason.trim()
    }).eq('id', selectedKillSession);
    
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Session Terminated', description: 'User will see a custom kick notification on next heartbeat.' });
      setSelectedKillSession(null);
      setKillReason('Your session has been terminated by the administrator.');
      fetchData();
    }
  };

  const handleSendMessageAndOpenChat = async (allowReply = false) => {
    if (!selectedSession || !msgInput.trim()) return;
    
    // Store in message_threads for custom notification system
    const { error } = await supabase.from('message_threads').insert({
      session_id: selectedSession,
      sender_type: 'admin',
      message: msgInput.trim(),
      notification_type: 'info',
      can_reply: allowReply,
    });
    
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else {
      toast({ 
        title: 'Chat Opened', 
        description: 'Message sent. Chat is now active.'
      });
      setMsgInput('');
      setSelectedSession(null);
      fetchData();
      fetchActiveChats();
      // Open the conversation thread
      setSelectedThread(selectedSession);
      fetchThreadMessages(selectedSession);
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

  const fetchActiveChats = async () => {
    const { data } = await supabase
      .from('message_threads')
      .select('*, active_sessions(id, license_keys(key_value), details)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setActiveChats(data as MessageThread[]);
  };

  const fetchThreadMessages = async (sessionId: string) => {
    const { data } = await supabase
      .from('message_threads')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (data) setThreadMessages(data as MessageThread[]);
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
    key_auth: 'text-green-600 bg-green-100 border-green-200',
    key_failed: 'text-destructive bg-red-100 border-red-200',
    hwid_locked: 'text-yellow-600 bg-yellow-100 border-yellow-200',
    key_expired: 'text-orange-600 bg-orange-100 border-orange-200',
    hwid_mismatch: 'text-red-600 bg-red-100 border-red-200',
  };

  const eventIcons: Record<string, string> = {
    key_auth: '✅',
    key_failed: '❌',
    hwid_locked: '🔒',
    key_expired: '⏰',
    hwid_mismatch: '⚠️',
  };

  const formatDetails = (details: any) => {
    if (!details || Object.keys(details).length === 0) return null;
    
    const parts = [];
    if (details.roblox_username) parts.push(`👤 ${details.roblox_username}`);
    if (details.roblox_age) parts.push(`📅 ${details.roblox_age} days`);
    if (details.roblox_user_id) parts.push(`🆔 ${details.roblox_user_id}`);
    if (details.reason) parts.push(`❓ ${details.reason}`);
    if (details.expected) parts.push(`Expected: ${details.expected.slice(0, 8)}...`);
    
    return parts.length > 0 ? parts.join(' • ') : JSON.stringify(details).slice(0, 60);
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
            <TabsTrigger value="chats" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <MessageSquare className="h-4 w-4 mr-2" />
              Active Chats
              {activeChats.length > 0 && (
                <span className="ml-2 rounded-full bg-green-500/20 px-1.5 py-0.5 text-[10px] font-bold text-green-600 animate-pulse">
                  {activeChats.length}
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
                      <TableHead className="w-[160px]">Time</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Player Info</TableHead>
                      <TableHead>Technical</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-[11px] tabular-nums whitespace-nowrap text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${eventColors[log.event_type] || 'text-foreground bg-muted border-border'}`}>
                            {eventIcons[log.event_type] || '•'} {log.event_type.replace(/_/g, ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{getProjectName(log.project_id)}</TableCell>
                        <TableCell>
                          {log.details?.roblox_username ? (
                            <div className="space-y-0.5">
                              <p className="text-xs font-medium text-foreground">👤 {log.details.roblox_username}</p>
                              {log.details.roblox_age && (
                                <p className="text-[10px] text-muted-foreground">📅 {log.details.roblox_age} days old</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">No player data</span>
                          )}
                        </TableCell>
                        <TableCell>
                           <div className="space-y-0.5">
                             <p className="font-mono text-[10px] text-foreground/80" title={log.ip_address || undefined}>{log.ip_address?.slice(0, 15) || '—'}</p>
                             <p className="font-mono text-[9px] text-muted-foreground truncate max-w-[100px]" title={log.hwid || undefined}>{log.hwid ? log.hwid.slice(0, 8) + '...' : '—'}</p>
                           </div>
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
              {filteredSessions.map((session) => {
                const isDisconnected = session.status === 'disconnected';
                const isKilled = session.status === 'killed';
                const secondsSincePing = Math.floor((Date.now() - new Date(session.last_ping).getTime()) / 1000);
                
                return (
                <Card key={session.id} className={`overflow-hidden transition-all border-l-4 ${isKilled ? 'border-l-destructive grayscale opacity-60' : isDisconnected ? 'border-l-yellow-500 opacity-75' : 'border-l-primary shadow-sm hover:shadow-md'}`}>
                   <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-start justify-between space-y-0">
                     <div className="space-y-1">
                       <CardTitle className="text-sm font-bold flex items-center gap-2">
                         {getOsIcon(session.os)}
                         {session.license_keys?.key_value || 'Unknown Key'}
                       </CardTitle>
                       <CardDescription className="text-[11px] flex items-center gap-2">
                         {isKilled ? (
                           <span className="inline-flex h-2 w-2 rounded-full bg-destructive" />
                         ) : isDisconnected ? (
                           <span className="inline-flex h-2 w-2 rounded-full bg-yellow-500" />
                         ) : (
                           <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                         )}
                         {isKilled ? 'Killed' : isDisconnected ? 'Disconnected' : 'Active'} in {getProjectName(session.project_id)}
                       </CardDescription>
                     </div>
                     <div className="flex items-center gap-1">
                        <Dialog open={selectedKillSession === session.id} onOpenChange={(open) => setSelectedKillSession(open ? session.id : null)}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" disabled={isKilled || isDisconnected} title="Kill Session">
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
                                Provide a reason for termination. This will be displayed as a custom kick notification on the player's screen.
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
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" title="Open Chat">
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>Send Custom Notification</DialogTitle>
                              <DialogDescription>
                                This will appear as a custom UI notification on the player's screen. They can click to reply if you enable replies.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-3">
                              <Input
                                placeholder="Enter message to display..."
                                value={msgInput}
                                onChange={(e) => setMsgInput(e.target.value)}
                                className="bg-background/50"
                              />
                              <div className="flex items-center gap-2">
                                <input 
                                  type="checkbox" 
                                  id={`allow-reply-${session.id}`}
                                  className="rounded"
                                />
                                <Label htmlFor={`allow-reply-${session.id}`} className="text-sm cursor-pointer">
                                  Allow user to reply
                                </Label>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setSelectedSession(null)}>Cancel</Button>
                              <Button 
                                onClick={() => {
                                  const allowReply = (document.getElementById(`allow-reply-${session.id}`) as HTMLInputElement)?.checked || false;
                                  handleSendMessageAndOpenChat(allowReply);
                                }} 
                                disabled={!msgInput.trim()}
                              >
                                Open Chat
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-muted/50" onClick={() => handleDeleteSession(session.id)} disabled={isDisconnected} title="Clear Session Record">
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
                        <p className={`font-mono text-[10px] ${secondsSincePing > 120 ? 'text-yellow-500' : 'text-foreground/80'}`}>
                          {secondsSincePing > 60 ? `${Math.floor(secondsSincePing / 60)}m ago` : `${secondsSincePing}s ago`}
                          {isDisconnected && ' (Disconnected)'}
                        </p>
                     </div>
                     {isKilled && (
                       <p className="text-[10px] text-destructive font-bold flex items-center gap-1.5 pt-1">
                         <Skull className="h-3 w-3" /> SESSION TERMINATED
                       </p>
                     )}
                     {isDisconnected && (
                       <p className="text-[10px] text-yellow-500 font-bold flex items-center gap-1.5 pt-1">
                         <span className="h-2 w-2 rounded-full bg-yellow-500" /> PLAYER LEFT GAME
                       </p>
                     )}
                     {session.message && !isDisconnected && (
                       <div className="rounded border bg-primary/5 p-2 text-[10px] text-primary/80 flex items-start gap-2">
                         <MessageSquare className="h-3 w-3 shrink-0 mt-0.5" />
                         <span className="italic">"{session.message}" (pending delivery...)</span>
                       </div>
                     )}
                   </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chats">
          {activeChats.length === 0 ? (
            <Card className="border-dashed">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No active chats.</p>
                <p className="text-xs text-muted-foreground mt-1 px-4">Chats appear when you message players or when players open a chat with you.</p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activeChats.map((chat) => (
                <Card key={chat.id} className="overflow-hidden border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-all">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="space-y-1">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {chat.active_sessions?.details?.roblox_username || 'Unknown User'}
                      </CardTitle>
                      <CardDescription className="text-[11px]">
                        Key: {chat.active_sessions?.license_keys?.key_value?.slice(0, 12)}...
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    <div className="rounded bg-muted/50 p-2 text-[11px]">
                      <span className={chat.sender_type === 'admin' ? 'text-primary' : 'text-blue-500'}>
                        {chat.sender_type === 'admin' ? 'You: ' : 'User: '}
                      </span>
                      <span className="text-foreground/80">{chat.message.slice(0, 60)}{chat.message.length > 60 && '...'}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(chat.created_at).toLocaleString()}
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={() => {
                        setSelectedThread(chat.session_id);
                        fetchThreadMessages(chat.session_id);
                      }}
                    >
                      View Conversation
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Message Thread Dialog */}
        <Dialog open={!!selectedThread} onOpenChange={(open) => !open && setSelectedThread(null)}>
          <DialogContent className="sm:max-w-[500px] max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Conversation Thread
              </DialogTitle>
              <DialogDescription>
                Viewing message history with player
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 max-h-[50vh] overflow-y-auto space-y-3">
              {threadMessages.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm">No messages</p>
              ) : (
                threadMessages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`max-w-[80%] rounded-lg p-3 text-sm ${
                        msg.sender_type === 'admin' 
                          ? 'bg-primary text-primary-foreground rounded-br-none' 
                          : 'bg-muted rounded-bl-none'
                      }`}
                    >
                      <p className="font-medium text-[10px] opacity-80 mb-1">
                        {msg.sender_type === 'admin' ? 'You (Admin)' : 'Player'}
                      </p>
                      <p>{msg.message}</p>
                      <p className="text-[9px] opacity-60 mt-1 text-right">
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Input
                placeholder="Type a reply..."
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && msgInput.trim() && selectedThread) {
                    const { error } = await supabase.from('message_threads').insert({
                      session_id: selectedThread,
                      sender_type: 'admin',
                      message: msgInput.trim(),
                      notification_type: 'info',
                      can_reply: true,
                    });
                    if (!error) {
                      setMsgInput('');
                      fetchThreadMessages(selectedThread);
                      fetchActiveChats();
                    }
                  }
                }}
                className="flex-1"
              />
              <Button 
                onClick={async () => {
                  if (!msgInput.trim() || !selectedThread) return;
                  const { error } = await supabase.from('message_threads').insert({
                    session_id: selectedThread,
                    sender_type: 'admin',
                    message: msgInput.trim(),
                    notification_type: 'info',
                    can_reply: true,
                  });
                  if (!error) {
                    setMsgInput('');
                    fetchThreadMessages(selectedThread);
                    fetchActiveChats();
                  }
                }}
                disabled={!msgInput.trim()}
              >
                Send
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedThread(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Tabs>
    </div>
  );
}
