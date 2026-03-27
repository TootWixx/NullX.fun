import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { Copy, Check, Eye, EyeOff, KeyRound, Shield } from 'lucide-react';

export default function PanelKey() {
  const { user, subscribed, isAdmin } = useAuth();
  const [panelKey, setPanelKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('user_panel_keys')
      .select('panel_key, is_visible')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    if (!data) {
      if (!subscribed && !isAdmin) {
        setPanelKey(null);
        setRevealed(false);
        setLoading(false);
        return;
      }
      const { data: inserted, error: insErr } = await supabase
        .from('user_panel_keys')
        .insert({ user_id: user.id })
        .select('panel_key, is_visible')
        .single();
      if (insErr) {
        toast({ title: 'Error', description: insErr.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      setPanelKey(inserted.panel_key);
      setRevealed(inserted.is_visible ?? false);
    } else {
      setPanelKey(data.panel_key);
      setRevealed(data.is_visible ?? false);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user, subscribed, isAdmin]);

  const persistVisible = async (next: boolean) => {
    if (!user) return;
    setRevealed(next);
    const { error } = await supabase.from('user_panel_keys').update({ is_visible: next }).eq('user_id', user.id);
    if (error) toast({ title: 'Could not save preference', description: error.message, variant: 'destructive' });
  };

  const copyKey = async () => {
    if (!panelKey) return;
    await navigator.clipboard.writeText(panelKey);
    setCopied(true);
    toast({ title: 'Panel key copied' });
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="animate-pulse text-muted-foreground">Loading panel key...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <KeyRound className="h-7 w-7 text-primary" />
          Panel key
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          One key per account — use the same <code className="text-xs">panel_key</code> for every project loader and API call.
        </p>
      </div>

      {!panelKey && !subscribed && !isAdmin && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">UPANEL key locked</CardTitle>
            <CardDescription>
              A UPanel key is only issued for active subscriptions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/pricing">Upgrade to unlock UPanel</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/15">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Your UPANEL key
          </CardTitle>
          <CardDescription>
            Treat this like a password. Hide it when sharing your screen; reveal only when you need to copy it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-0 rounded-lg bg-muted px-3 py-2.5 font-mono text-xs break-all">
              {revealed && panelKey ? panelKey : panelKey ? '•'.repeat(Math.min(48, panelKey.length)) : '—'}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => void persistVisible(!revealed)}
              title={revealed ? 'Hide key' : 'Show key'}
              disabled={!panelKey}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => void copyKey()} disabled={!panelKey}>
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Default is hidden. Your choice of show/hide is saved for next time on this device account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
