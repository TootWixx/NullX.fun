import { supabase } from '@/integrations/supabase/client';

/**
 * Destructive vault reset: removes encryption config, all projects (license keys, webhooks,
 * checkpoints, obfuscated builds, logs, etc.), vault-encrypted checkpoint API tokens, and
 * any remaining obfuscated script rows. Panel key and account login are unchanged.
 */
export async function resetVaultEncryption(userId: string): Promise<{ error: string | null }> {
  const { error: credErr } = await supabase
    .from('checkpoint_provider_credentials')
    .delete()
    .eq('user_id', userId);
  if (credErr) return { error: credErr.message };

  const { error: projErr } = await supabase.from('projects').delete().eq('user_id', userId);
  if (projErr) return { error: projErr.message };

  const { error: scriptErr } = await supabase.from('obfuscated_scripts').delete().eq('user_id', userId);
  if (scriptErr) return { error: scriptErr.message };

  const { error: encErr } = await supabase.from('encryption_configs').delete().eq('user_id', userId);
  if (encErr) return { error: encErr.message };

  return { error: null };
}
