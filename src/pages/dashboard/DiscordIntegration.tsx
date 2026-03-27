import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageCircle, ExternalLink, Copy, Bot, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function DiscordIntegration() {
  const { user } = useAuth();
  const clientId = import.meta.env.VITE_DISCORD_APPLICATION_ID as string | undefined;
  const [discordUserId, setDiscordUserId] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLinked, setIsLinked] = useState(false);

  const inviteUrl = clientId
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`
    : null;

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('discord_connections')
        .select('discord_user_id, discord_username')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setDiscordUserId(data.discord_user_id);
        setDiscordUsername(data.discord_username ?? '');
        setIsLinked(true);
      }
      setLoading(false);
    })();
  }, [user]);

  const saveLink = async () => {
    if (!user || !discordUserId.trim()) {
      toast({ title: 'Discord user ID required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('discord_connections').upsert(
        {
          user_id: user.id,
          discord_user_id: discordUserId.trim(),
          discord_username: discordUsername.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      setIsLinked(true);
      toast({ title: 'Saved', description: 'Your Discord ID is now linked to your NullX.fun account.' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyInvite = () => {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl);
    toast({ title: 'Invite link copied' });
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageCircle className="h-7 w-7 text-primary" />
          Discord Bot
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Link your Discord account, invite the bot, and manage key operations from Discord.
        </p>
      </div>

      {/* ── REQUIRED: Link Discord ──────────────────────────────────────── */}
      <Card className={isLinked ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {isLinked ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            )}
            {isLinked ? 'Discord Linked' : 'Link Required — Discord Account'}
          </CardTitle>
          <CardDescription>
            {isLinked
              ? 'Your Discord is linked. You can use /login in the bot with your UPanel key.'
              : 'You must link your Discord ID to use bot commands. Enable Developer Mode in Discord → right-click your profile → Copy User ID.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <div className="space-y-2">
            <Label htmlFor="discord-id">Discord User ID</Label>
            <Input
              id="discord-id"
              placeholder="e.g. 123456789012345678"
              value={discordUserId}
              onChange={(e) => setDiscordUserId(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discord-name">Discord Username (optional)</Label>
            <Input
              id="discord-name"
              placeholder="username"
              value={discordUsername}
              onChange={(e) => setDiscordUsername(e.target.value)}
            />
          </div>
          <Button type="button" onClick={() => void saveLink()} disabled={saving}>
            {saving ? 'Saving…' : isLinked ? 'Update Link' : 'Link Discord'}
          </Button>
          {!isLinked && (
            <p className="text-xs text-amber-500 font-medium">
              ⚠️ Bot commands are locked until you link your Discord ID here.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Bot Invite ──────────────────────────────────────────────────── */}
      <Card className="border-primary/15">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Add the Bot
          </CardTitle>
          <CardDescription>
            Invite the NullX.fun bot to your Discord server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteUrl ? (
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="secondary" size="sm" asChild>
                <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Open invite in Discord
                </a>
              </Button>
              <Button variant="outline" size="sm" type="button" onClick={copyInvite}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy invite link
              </Button>
            </div>
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Set <code className="text-xs">VITE_DISCORD_APPLICATION_ID</code> in your environment and rebuild to show a one-click invite link.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Access Model ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Access Model
          </CardTitle>
          <CardDescription>
            Bot commands use a role + linking system for security.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
            <p className="font-medium text-foreground text-xs uppercase tracking-wider">Login Requirements</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li><strong>Customer</strong> or <strong>Owner</strong> role in your Discord server.</li>
              <li>Discord ID linked here in the dashboard (above).</li>
              <li>Valid <strong>UPanel key</strong> that matches this linked account.</li>
            </ol>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Available commands after login:</p>
            <p className="text-xs">
              <code>/login upanel_key:&lt;key&gt;</code>,{' '}
              <code>/nova generate project:&lt;project&gt; quantity:1-20</code>,{' '}
              <code>/nova freeze key:&lt;key&gt;</code>,{' '}
              <code>/nova unfreeze key:&lt;key&gt;</code>,{' '}
              <code>/nova remove key:&lt;key&gt;</code>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
