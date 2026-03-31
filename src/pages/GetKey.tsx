import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Shield, Check, ExternalLink, Loader2, Key, Copy, Lock, Sparkles, Timer, Youtube, MessageCircle, Globe, User, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface CheckpointItem {
  id: string;
  name: string;
  checkpoint_type: string;
  display_label: string | null;
  guild_id: string | null;
  provider: string;
  link: string;
  order: number;
}

interface CreatorProfile {
  username: string;
  avatar_url: string | null;
  background_url: string | null;
  background_color: string;
  bio: string | null;
  discord_server_link?: string | null;
}

// Per-type time gates (must match Edge Function)
const TIME_GATES: Record<string, number> = {
  youtube_video:   90,
  youtube_channel: 60,
  discord_server:  0,  // OAuth-verified
  generic_url:     45,
};

const TYPE_META: Record<string, {
  icon: typeof Youtube;
  color: string;
  bg: string;
  label: string;
  actionLabel: string;
}> = {
  youtube_video: { icon: Youtube, color: 'text-red-400', bg: 'bg-red-500/10', label: 'YouTube', actionLabel: 'Watch Video' },
  youtube_channel: { icon: Youtube, color: 'text-red-400', bg: 'bg-red-500/10', label: 'YouTube', actionLabel: 'Subscribe' },
  discord_server: { icon: MessageCircle, color: 'text-indigo-400', bg: 'bg-indigo-500/10', label: 'Discord', actionLabel: 'Join Server' },
  generic_url: { icon: Globe, color: 'text-gray-400', bg: 'bg-gray-500/10', label: 'Link', actionLabel: 'Visit' },
};

const getTimeMeta = (type: string) => TYPE_META[type] || TYPE_META.generic_url;
const getTimeGate = (type: string) => TIME_GATES[type] ?? 45;

export default function GetKey() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();

  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [sessionToken, setSessionToken] = useState('');
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [fetchingKey, setFetchingKey] = useState(false);
  const [keyExpired, setKeyExpired] = useState(false);
  const [keyExpiresAt, setKeyExpiresAt] = useState<string | null>(null);
  const hasAttemptedAutoFetch = useRef(false);

  // Timer state
  const [activeCP, setActiveCP] = useState<string | null>(null);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/['"]/g, '');
  const supabaseProject = (import.meta.env.VITE_SUPABASE_PROJECT_ID || '').replace(/['"]/g, '');
  const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').replace(/['"]/g, '');
  const mainSiteUrl = (import.meta.env.VITE_MAIN_SITE_URL || window.location.origin).replace(/\/$/, '');

  const discordOAuthBase = `${supabaseUrl}/functions/v1/discord-oauth`;
  const storageKey = `nova_cp_session_${projectId}`;

  useEffect(() => {
    loadSession();

    // Handle Discord OAuth callback params
    const discordSuccess = searchParams.get('discord_success');
    const discordError = searchParams.get('discord_error');
    if (discordSuccess) toast({ title: '✅ Discord verified! Checkpoint complete.' });
    if (discordError) {
      const msgs: Record<string, string> = {
        not_in_server: "You haven't joined the server yet. Please join and try again.",
        token_failed: 'Discord authorization failed. Please try again.',
        guilds_failed: 'Could not verify your server membership. Please try again.',
        invalid_session: 'Session expired. Please refresh the page.',
      };
      toast({ title: 'Discord Verification Failed', description: msgs[discordError] || discordError, variant: 'destructive' });
    }

    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [projectId]);

  // Poll every 4 seconds if there's an active session & not all done
  useEffect(() => {
    if (!sessionToken || allDone || issuedKey) return;
    const poll = setInterval(() => pollStatus(), 4000);
    return () => clearInterval(poll);
  }, [sessionToken, allDone, issuedKey]);

  // Auto-fetch key when all checkpoints are done
  useEffect(() => {
    if (allDone && !issuedKey && !fetchingKey && !hasAttemptedAutoFetch.current) {
      hasAttemptedAutoFetch.current = true;
      getKey();
    }
  }, [allDone, issuedKey, fetchingKey]);

  const loadSession = async () => {
    try {
      const savedSession = localStorage.getItem(storageKey);
      
      const { data, error: funcErr } = await supabase.functions.invoke(
        `checkpoint?action=start&project_id=${projectId || ''}&session=${savedSession || ''}`, 
        { 
          method: 'GET',
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`
          }
        }
      );

      if (data && data.success) {
        setCheckpoints(data.checkpoints || []);
        setSessionToken(data.session_token);
        localStorage.setItem(storageKey, data.session_token);
        if (data.completed_ids?.length) setCompletedIds(new Set<string>(data.completed_ids));
        
        if (data.key_expired) {
          setKeyExpired(true);
          setIssuedKey(data.issued_key || null);
          setAllDone(true);
        } else {
          if (data.key_expires_at) setKeyExpiresAt(data.key_expires_at);
          if (data.all_done) { 
            setAllDone(true); 
            if (data.issued_key) setIssuedKey(data.issued_key); 
          }
        }

        // Also load creator profile
        fetchCreatorProfile(data.project_user_id || '');
      } else {
        let errMsg = data?.error || funcErr?.message || 'Failed to load session';
        if (funcErr && 'context' in (funcErr as any)) {
          try {
            const body = await (funcErr as any).context.json();
            if (body?.error) errMsg = body.error;
          } catch { /* ignore */ }
        }
        const statusStr = (funcErr as any)?.status ? ` (HTTP ${(funcErr as any).status})` : '';
        setError(errMsg + statusStr);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to NullX.fun servers.');
    }
    setLoading(false);
  };

  const fetchCreatorProfile = async (userId: string) => {
    if (!userId || !projectId) return;
    try {
      const { data: rows } = await supabase
        .from('creator_profiles')
        .select('*')
        .eq('user_id', userId);
      
      if (rows?.length) setProfile(rows[0] as any);
    } catch { /* profile is optional */ }
  };

  const pollStatus = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const { data } = await supabase.functions.invoke(
        `checkpoint?action=poll&session=${sessionToken}`,
        { 
          method: 'GET',
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`
          }
        }
      );
      
      if (data) {
        if (data.key_expired) {
          setKeyExpired(true);
          setIssuedKey(data.issued_key || null);
          setAllDone(true);
          return;
        }
        if (data.key_expires_at) setKeyExpiresAt(data.key_expires_at);
        if (data.completed_ids?.length) setCompletedIds(new Set<string>(data.completed_ids));
        if (data.all_done) {
          setAllDone(true);
          if (data.issued_key) setIssuedKey(data.issued_key);
        }
      }
    } catch { /* ignore poll errors */ }
  }, [sessionToken]);

  const verifyDiscord = (cp: CheckpointItem) => {
    // Redirect through discord-oauth Edge Function
    const params = new URLSearchParams({
      action: 'authorize',
      session: sessionToken,
      checkpoint_id: cp.id,
      guild_id: cp.guild_id || '',
      project_id: projectId || '',
      // Make the OAuth callback redirect back to YOUR website origin
      // (not the Supabase edge-function host).
      return_url: window.location.origin,
    });
    window.location.href = `${discordOAuthBase}?${params}`;
  };

  const startCheckpoint = useCallback((cp: CheckpointItem) => {
    const isDiscord = cp.checkpoint_type === 'discord_server';
    if (isDiscord) {
      // Discord checkpoints are verified server-side via OAuth.
      // Clicking Start should immediately redirect to OAuth (no extra verify step).
      verifyDiscord(cp);
      return;
    }

    window.open(cp.link, '_blank');
    const now = Date.now();
    const gate = getTimeGate(cp.checkpoint_type);
    if (gate > 0) {
      setOpenedAt(now);
      setActiveCP(cp.id);
      setCountdown(gate);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - now) / 1000);
        const remaining = Math.max(0, gate - elapsed);
        setCountdown(remaining);
        if (remaining === 0 && countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      }, 1000);
    }
  }, [verifyDiscord]);

  const verifyCheckpoint = async (checkpointId: string) => {
    if (!sessionToken) return;
    setVerifying(true);
    
    // We snapshot `completedIds` to use inside the callback correctly
    const prevCompleted = completedIds;

    try {
      const { data, error: funcErr } = await supabase.functions.invoke('checkpoint', {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        },
        body: { session_token: sessionToken, checkpoint_id: checkpointId, started_at: openedAt }
      });

      if (data && data.success) {
        if (data.key_expired) {
          setKeyExpired(true);
          setIssuedKey(data.issued_key || null);
          setAllDone(true);
          return;
        }

        if (data.key_expires_at) setKeyExpiresAt(data.key_expires_at);

        // Update completions locally
        const nextCompleted = new Set([...prevCompleted, checkpointId]);
        setCompletedIds(nextCompleted);
        setActiveCP(null); setOpenedAt(null);

        // ALWAYS compute all_done locally to prevent backend race condition softlocks
        const isAllLocallyDone = nextCompleted.size === checkpoints.length;

        if (data.all_done || isAllLocallyDone) { 
          setAllDone(true); 
          const k = data.key || data.issued_key; 
          if (k) setIssuedKey(k); 
        }
        
        // Remove verifying state quickly so UI feels responsive
        toast({ title: '✅ Checkpoint verified!' });
      } else {
        let errMsg = data?.error || funcErr?.message || 'Failed to verify';
        if (funcErr && 'context' in (funcErr as any)) {
          try {
            const body = await (funcErr as any).context.json();
            if (body?.error) errMsg = body.error;
          } catch { /* ignore */ }
        }
        toast({ 
          title: 'Verification Failed', 
          description: errMsg, 
          variant: 'destructive' 
        });
      }
    } catch { toast({ title: 'Error', description: 'Failed to connect to verification server', variant: 'destructive' }); }
    setVerifying(false);
  };

  const getKey = async () => {
    setFetchingKey(true);
    try {
      const { data, error: funcErr } = await supabase.functions.invoke(
        `checkpoint?action=poll&session=${sessionToken}`, 
        { 
          method: 'GET',
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`
          }
        }
      );

      if (data && data.key_expired) {
        setKeyExpired(true);
        setIssuedKey(data.issued_key || null);
        setAllDone(true);
        return;
      }

      if (data && data.key_expires_at) setKeyExpiresAt(data.key_expires_at);

      if (data && data.issued_key) { 
        setIssuedKey(data.issued_key); 
      } else {
        const missingCount = data?.missing_ids?.length;
        const diagnostic = missingCount > 0 ? ` (Missing ${missingCount} checkpoints)` : '';
        let errMsg = data?.error || funcErr?.message || 'Please try again.';
        if (funcErr && 'context' in (funcErr as any)) {
          try {
            const body = await (funcErr as any).context.json();
            if (body?.error) errMsg = body.error;
          } catch { /* ignore */ }
        }
        toast({ 
          title: 'Key not ready yet', 
          description: errMsg + diagnostic, 
          variant: 'destructive' 
        });
      }
    } catch { toast({ title: 'Error', variant: 'destructive' }); }
    setFetchingKey(false);
  };

  const copyKey = () => { if (issuedKey) { navigator.clipboard.writeText(issuedKey); toast({ title: 'Copied!' }); } };

  const progress = checkpoints.length > 0 ? (completedIds.size / checkpoints.length) * 100 : 0;

  // Add Live Countdown Hook for active keys
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');
  useEffect(() => {
    if (!keyExpiresAt || keyExpired) return;
    const updateTime = () => {
      const ms = new Date(keyExpiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setTimeLeftStr('Expired');
        setKeyExpired(true);
        return;
      }
      const h = Math.floor(ms / (1000 * 60 * 60));
      const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((ms % (1000 * 60)) / 1000);
      let str = '';
      if (h > 0) str += `${h}h `;
      str += `${m}m ${s}s`;
      setTimeLeftStr(str);
    };
    updateTime();
    const iv = setInterval(updateTime, 1000);
    return () => clearInterval(iv);
  }, [keyExpiresAt, keyExpired]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a1a]">
      <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
    </div>
  );

  if (error) return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a1a] px-4">
      <div className="rounded-2xl border border-red-500/20 bg-[#0d0d1a]/80 p-10 text-center max-w-sm">
        <Shield className="h-10 w-10 text-red-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Unable to Load</h1>
        <p className="text-sm text-gray-400">{error}</p>
        <p className="text-[10px] text-gray-500 mt-4 opacity-50 font-mono">ID: {projectId}</p>
        
        <div className="mt-8 space-y-3">
          <Button 
            onClick={() => window.location.reload()} 
            className="w-full nova-btn py-5 rounded-xl flex items-center justify-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <p className="text-[9px] text-gray-600 uppercase tracking-widest">
            Wait 30s before retrying
          </p>
        </div>
      </div>
    </div>
  );

  const bg = profile?.background_url
    ? `url(${profile.background_url}) center/cover fixed`
    : profile?.background_color || '#0a0a1a';

  return (
    <div className="min-h-screen" style={{ background: bg }}>
      {/* dark overlay */}
      <div className="fixed inset-0 bg-black/60 z-0" />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .glass { background: rgba(13, 13, 26, 0.75); backdrop-filter: blur(20px); border: 1px solid rgba(139,92,246,0.15); }
        .nova-btn { background: linear-gradient(135deg, #7c3aed 0%, #6366f1 50%, #38bdf8 100%); border: none; color: white; font-weight: 600; transition: all 0.2s; }
        .nova-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(139,92,246,0.35); }
        .nova-btn:disabled { opacity: 0.5; transform: none; box-shadow: none; cursor: not-allowed; }
        .discord-btn { background: #5865F2; border: none; color: white; font-weight: 600; transition: all 0.2s; }
        .discord-btn:hover { background: #4752C4; transform: translateY(-1px); }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      `}</style>

      <div className="relative z-10 flex flex-col items-center px-4 py-10 min-h-screen">

        {/* ── Creator Profile Card ─────────────────────────────────────────── */}
        <div className="w-full max-w-md mb-8">
          <div className="glass rounded-3xl overflow-hidden shadow-2xl">
            {/* Avatar + info */}
            <div className="flex flex-col items-center text-center px-6 py-6">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="avatar"
                  className="h-24 w-24 rounded-full border-4 border-[#0d0d1a] object-cover shadow-xl"
                />
              ) : (
                <div className="h-24 w-24 rounded-full border-4 border-[#0d0d1a] bg-violet-500/20 flex items-center justify-center shadow-xl">
                  <User className="h-10 w-10 text-violet-400" />
                </div>
              )}

              <h1 className="text-2xl font-extrabold text-white mt-3">
                {profile?.username || 'Creator'}
              </h1>
              {profile?.bio && (
                <p className="text-sm text-gray-400 mt-1 max-w-xs">{profile.bio}</p>
              )}
              <div className="mt-3 flex items-center gap-1.5 rounded-full bg-violet-500/10 ring-1 ring-violet-500/25 px-3 py-1 text-[11px] font-semibold text-violet-400">
                <img src="/nullx-logo.png" alt="NullX.fun" className="h-4 w-4 mr-0.5" />
                NullX.fun
              </div>
              {profile?.discord_server_link && (
                <div className="mt-4">
                  <a
                    href={profile.discord_server_link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button type="button" className="discord-btn text-xs px-4 py-2 h-auto rounded-lg">
                      <MessageCircle className="h-3.5 w-3.5 mr-2" />
                      Join Discord
                    </Button>
                  </a>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3">
            <a href={`${mainSiteUrl}/`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" type="button" className="w-full text-xs">
                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                View NullX.fun Whitelisting Service
              </Button>
            </a>
          </div>
        </div>

        {/* ── Key Revoked / Expired Block ─────────────────────────────────── */}
        {keyExpired && (
          <div className="w-full max-w-md bg-[#0a0404]/90 backdrop-blur-xl border border-red-500/30 rounded-3xl p-8 text-center shadow-[0_0_40px_rgba(239,68,68,0.15)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-rose-500 to-orange-500"></div>
            
            <div className="flex justify-center mb-6">
              <div className="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center ring-4 ring-red-500/20">
                <AlertTriangle className="h-10 w-10 text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
              </div>
            </div>

            <h2 className="text-2xl font-extrabold text-white mb-3">Your Time is Up!</h2>
            <p className="text-sm text-red-200/80 leading-relaxed mb-6 px-2">
              You already claimed a key for this project in the past and its time has expired. Our system strictly enforces <strong className="text-white font-bold tracking-wide">one key per user</strong>.
            </p>

            <div className="bg-black/40 rounded-xl p-4 mb-6 border border-red-500/10">
              <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold mb-2">Original Key</p>
              <code className="font-mono text-sm text-gray-400 select-all">{issuedKey || 'Unknown'}</code>
            </div>

            <a href="/instructions" target="_blank" rel="noopener noreferrer">
              <Button className="w-full py-6 text-[15px] font-bold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 border border-red-400/50 shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(239,68,68,0.5)] rounded-xl">
                <Clock className="w-5 h-5 mr-2" />
                Want more time? Click here to Extend!
              </Button>
            </a>
          </div>
        )}

        {/* ── Progress bar ─────────────────────────────────────────────────── */}
        {!issuedKey && !keyExpired && (
          <div className="w-full max-w-md mb-5 space-y-1.5">
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>Progress</span>
              <span className="text-violet-400 font-medium">{completedIds.size}/{checkpoints.length} completed</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #7c3aed, #38bdf8)' }}
              />
            </div>
          </div>
        )}

        {/* ── Key Reveal ──────────────────────────────────────────────────── */}
        {issuedKey && !keyExpired && (
          <div className="w-full max-w-md glass rounded-2xl p-8 text-center space-y-5 shadow-2xl relative overflow-hidden" style={{ borderColor: 'rgba(139,92,246,0.35)' }}>
            {/* Live countdown badge top right */}
            {timeLeftStr && (
              <div className="absolute top-4 right-4 bg-violet-500/10 border border-violet-500/30 rounded-lg px-3 py-1.5 flex items-center shadow-[0_0_10px_rgba(139,92,246,0.1)]">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-2" />
                <span className="text-xs font-mono font-semibold text-violet-300">
                  {timeLeftStr}
                </span>
              </div>
            )}

            <div className="flex flex-col items-center gap-3 mt-4">
              <div className="h-16 w-16 rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/30 flex items-center justify-center" style={{ animation: 'float 3s ease-in-out infinite' }}>
                <Key className="h-8 w-8 text-violet-400" />
              </div>
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4 text-violet-400" />
                  <h2 className="text-lg font-bold text-white">Your License Key</h2>
                  <Sparkles className="h-4 w-4 text-sky-400" />
                </div>
                <p className="text-xs text-gray-500">Copy this key into your script executor</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-black/40 border border-violet-500/20 px-4 py-3">
              <code className="flex-1 font-mono text-sm text-violet-300 select-all tracking-widest">{issuedKey}</code>
              <button onClick={copyKey} className="text-gray-500 hover:text-violet-400 transition-colors p-1 rounded-lg hover:bg-violet-500/10">
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <Button onClick={copyKey} className="nova-btn w-full py-3 rounded-xl">
              <Copy className="h-4 w-4 mr-2" /> Copy Key
            </Button>

            {/* Added for Extensions */}
            <div className="pt-4 mt-2 border-t border-violet-500/20">
              <a href="/instructions" target="_blank" rel="noopener noreferrer">
                <Button type="button" variant="secondary" className="w-full py-5 rounded-xl border border-violet-500/30 text-violet-300 font-bold hover:text-white transition-colors bg-violet-500/10 hover:bg-violet-500/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]">
                  <Clock className="h-4 w-4 mr-2" /> Want to Extend your Key Time?? CLICK ME
                </Button>
              </a>
            </div>
          </div>
        )}

        {/* ── Get Key Button (allDone but key not yet loaded) ─────────────── */}
        {allDone && !issuedKey && !keyExpired && (
          <div className="w-full max-w-md glass rounded-2xl p-8 text-center space-y-5" style={{ borderColor: 'rgba(139,92,246,0.35)' }}>
            <Sparkles className="h-10 w-10 text-violet-400 mx-auto" style={{ animation: 'float 3s ease-in-out infinite' }} />
            <div>
              <h2 className="text-lg font-bold text-white">All Checkpoints Complete!</h2>
              <p className="text-xs text-gray-500 mt-1">Your key is being generated...</p>
            </div>
            <Button onClick={getKey} disabled={fetchingKey} className="nova-btn w-full py-4 rounded-xl text-base">
              {fetchingKey ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Key className="h-5 w-5 mr-2" />}
              {fetchingKey ? 'Generating…' : 'Try Manually'}
            </Button>
          </div>
        )}

        {/* ── Checkpoints ─────────────────────────────────────────────────── */}
        {!issuedKey && !keyExpired && (
          <div className="w-full max-w-md space-y-3">
            {checkpoints.map((cp, idx) => {
              const isCompleted = completedIds.has(cp.id);
              const isActive = activeCP === cp.id;
              const canStart = idx === 0 || completedIds.has(checkpoints[idx - 1]?.id);
              const isLocked = !canStart && !isCompleted;
              const meta = getTimeMeta(cp.checkpoint_type);
              const gate = getTimeGate(cp.checkpoint_type);
              const isDiscord = cp.checkpoint_type === 'discord_server';
              const canVerify = isActive && (isDiscord ? false : countdown === 0);

              return (
                <div
                  key={cp.id}
                  className={`glass rounded-xl p-4 transition-all duration-300 ${isCompleted ? '!border-violet-500/40 !bg-violet-500/5' : ''} ${isLocked ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Icon badge */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.bg} transition-all`}>
                      {isCompleted
                        ? <Check className="h-5 w-5 text-violet-400" />
                        : isLocked
                        ? <Lock className="h-4 w-4 text-gray-600" />
                        : <meta.icon className={`h-5 w-5 ${meta.color}`} />
                      }
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isCompleted ? 'text-violet-300' : isLocked ? 'text-gray-600' : 'text-white'}`}>
                        {cp.name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {cp.display_label || meta.actionLabel}
                        {gate > 0 && !isCompleted && <span className="ml-1.5 text-gray-600">· {gate}s</span>}
                        {isDiscord && !isCompleted && <span className="ml-1.5 text-indigo-400">· Discord OAuth</span>}
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isCompleted && (
                        <span className="text-xs font-medium text-violet-400 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Done
                        </span>
                      )}

                      {!isCompleted && canStart && !isActive && (
                        <Button
                          size="sm"
                          onClick={() => startCheckpoint(cp)}
                          className={`${isDiscord ? 'discord-btn' : 'nova-btn'} text-xs px-4 py-1.5 h-auto rounded-lg`}
                        >
                          {isDiscord ? (
                            <>
                              <MessageCircle className="h-3 w-3 mr-1" /> Join Discord
                            </>
                          ) : (
                            <>
                              <ExternalLink className="h-3 w-3 mr-1" /> Start
                            </>
                          )}
                        </Button>
                      )}

                      {/* Timer countdown */}
                      {isActive && !isDiscord && countdown > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Timer className="h-3.5 w-3.5 text-sky-400" />
                          <span className="text-xs font-mono text-sky-400 tabular-nums w-6 text-center">{countdown}s</span>
                        </div>
                      )}

                      {/* Regular verify */}
                      {isActive && !isDiscord && canVerify && (
                        <Button size="sm" onClick={() => verifyCheckpoint(cp.id)} disabled={verifying} className="nova-btn text-xs px-4 py-1.5 h-auto rounded-lg">
                          {verifying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                          Done!
                        </Button>
                      )}

                      {/* Discord OAuth: Start triggers redirect, so no extra button here */}
                    </div>
                  </div>

                  {/* Status line */}
                  {isActive && !isDiscord && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <p className="text-[11px] text-gray-500">
                        {countdown > 0
                          ? `Complete the task in the opened tab. Done! unlocks in ${countdown}s.`
                          : "Ready — click the Done! button."}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="mt-10 text-center">
          <p className="text-[10px] text-gray-700 tracking-wider uppercase">
            Protected by NullX.fun · Secure Key System
          </p>
        </footer>
      </div>
    </div>
  );
}
