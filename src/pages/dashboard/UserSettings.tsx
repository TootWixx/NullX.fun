import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useVault } from '@/hooks/useVault';
import { resetVaultEncryption } from '@/lib/vault-reset';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { User, RotateCcw, Mail } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function UserSettings() {
  const { user } = useAuth();
  const { setEncryptionConfig, clearVault } = useVault();
  const [resetting, setResetting] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<'loading' | 'active' | 'none'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setVaultStatus('none');
        return;
      }
      const { data } = await supabase
        .from('encryption_configs')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) setVaultStatus(data ? 'active' : 'none');
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleResetVault = async () => {
    if (!user) return;
    setResetting(true);
    try {
      const { error } = await resetVaultEncryption(user.id);
      if (error) {
        toast({ title: 'Error', description: error, variant: 'destructive' });
        return;
      }
      setEncryptionConfig(null);
      clearVault();
      setVaultStatus('none');
      toast({
        title: 'Vault reset',
        description:
          'All projects, license keys, builds, and encryption data were removed. Set up a new recovery key on Projects when you are ready.',
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <User className="h-7 w-7 text-primary" />
          User &amp; vault
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Account details and dangerous vault actions. Panel key lives under the{' '}
          <span className="text-foreground/80">Account → Panel key</span> page.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Sign-in email
          </CardTitle>
          <CardDescription>Your account identifier from Supabase Auth.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input readOnly value={user?.email ?? ''} className="bg-muted/50 font-mono text-sm max-w-md" />
        </CardContent>
      </Card>

      <Card className="border-destructive/25">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset encryption key (full wipe)
          </CardTitle>
          <CardDescription>
            Deletes your vault encryption configuration and <strong>permanently removes every project</strong> for this
            account—license keys, webhooks, checkpoints, obfuscated builds, logs, and encrypted checkpoint credentials.
            Your sign-in and panel key are unchanged. Use only if you lost your recovery key or want a completely fresh
            workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Vault status:{' '}
            <span className="font-medium text-foreground">
              {vaultStatus === 'loading'
                ? 'Checking…'
                : vaultStatus === 'active'
                  ? 'Encryption active'
                  : 'Not set up'}
            </span>
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={resetting}>
                {resetting ? 'Wiping…' : 'Reset encryption & delete all projects'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all projects and reset encryption?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. Every project, license key, obfuscated build, and vault-related data tied to your
                  account will be removed. You will set up a new recovery key on Projects when you create projects again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void handleResetVault()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Yes, reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
