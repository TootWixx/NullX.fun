// Discord OAuth2 Callback Edge Function
// Flow:
//  1. User authorizes NovaPROTECTED Discord app
//  2. Discord redirects here with ?code=...&state=...
//  3. We exchange code for token, check guild membership, mark checkpoint complete
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const DISCORD_API = 'https://discord.com/api/v10';

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

const redirect = (url: string) =>
  new Response(null, { status: 302, headers: { Location: url } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const clientId = Deno.env.get('DISCORD_CLIENT_ID')!;
  const clientSecret = Deno.env.get('DISCORD_CLIENT_SECRET')!;
  const botToken = Deno.env.get('DISCORD_BOT_TOKEN')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const redirectUri = `${supabaseUrl}/functions/v1/discord-oauth`;

  const url = new URL(req.url);

  // ── INITIATE: redirect user to discord (called from frontend) ──────────────
  if (req.method === 'GET' && url.searchParams.get('action') === 'authorize') {
    const sessionToken = url.searchParams.get('session') || '';
    const checkpointId = url.searchParams.get('checkpoint_id') || '';
    const guildId = url.searchParams.get('guild_id') || '';
    const projectId = url.searchParams.get('project_id') || '';
    const returnUrl = url.searchParams.get('return_url') || '';

    // State encodes everything we need in the callback
    const state = btoa(JSON.stringify({ sessionToken, checkpointId, guildId, projectId, returnUrl }));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state,
    });

    return redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  }

  // ── CALLBACK: Discord redirects here after authorization ──────────────────
  if (req.method === 'GET' && url.searchParams.has('code')) {
    const code = url.searchParams.get('code')!;
    const rawState = url.searchParams.get('state') || '';

    let state: { sessionToken: string; checkpointId: string; guildId: string; projectId: string; returnUrl?: string };
    try {
      state = JSON.parse(atob(rawState));
    } catch {
      // Can't parse state; best effort redirect to root of whatever origin the callback was served from.
      return redirect(`/get-key/unknown?error=invalid_state`);
    }

    const { sessionToken, checkpointId, guildId, projectId, returnUrl } = state;
    const normalizedReturnUrl = (returnUrl || '').replace(/\/$/, '');
    const getKeyUrl = normalizedReturnUrl
      ? `${normalizedReturnUrl}/get-key/${projectId}`
      : `/get-key/${projectId}`;

    // 1) Exchange code for access token
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error('Token exchange failed:', await tokenRes.text());
      return redirect(`${getKeyUrl}?discord_error=token_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;

    // 2) Get user's guilds and check membership
    const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!guildsRes.ok) {
      console.error('Guilds fetch failed:', await guildsRes.text());
      return redirect(`${getKeyUrl}?discord_error=guilds_failed`);
    }

    const guilds: Array<{ id: string }> = await guildsRes.json();
    const isMember = guilds.some((g) => g.id === guildId);

    if (!isMember) {
      console.log(`User not in guild ${guildId}`);
      return redirect(`${getKeyUrl}?discord_error=not_in_server`);
    }

    // 3) Mark checkpoint complete in DB
    const { data: session } = await supabase
      .from('checkpoint_sessions')
      .select('*')
      .eq('session_token', sessionToken)
      .maybeSingle();

    if (!session) {
      return redirect(`${getKeyUrl}?discord_error=invalid_session`);
    }

    // Prevent duplicate completions
    const { data: existing } = await supabase
      .from('checkpoint_completions')
      .select('id')
      .eq('session_token', sessionToken)
      .eq('checkpoint_id', checkpointId)
      .maybeSingle();

    if (!existing) {
      await supabase.from('checkpoint_completions').insert({
        checkpoint_id: checkpointId,
        session_token: sessionToken,
        ip_address: session.ip_address,
      });
    }

    // 4) Check if all checkpoints are now done
    const { data: allCPs } = await supabase
      .from('checkpoint_configs')
      .select('id')
      .eq('project_id', session.project_id)
      .eq('is_active', true);

    const { data: allCompletions } = await supabase
      .from('checkpoint_completions')
      .select('checkpoint_id')
      .eq('session_token', sessionToken);

    const completedIds = new Set((allCompletions || []).map((c: any) => c.checkpoint_id));
    const allDone = (allCPs || []).every((cp: any) => completedIds.has(cp.id));

    if (allDone && !session.issued_key) {
      // Claim a key from the pool
      const nowIso = new Date().toISOString();
      const { data: availableKeys } = await supabase
        .from('license_keys')
        .select('id, key_value')
        .eq('project_id', session.project_id)
        .eq('is_active', true)
        .eq('current_uses', 0)
        .is('hwid', null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('created_at', { ascending: true })
        .limit(1);

      const poolKey = availableKeys?.[0];
      if (poolKey) {
        const { data: claimed } = await supabase
          .from('license_keys')
          .update({
            current_uses: 1,
            note: `Checkpoint key — Reserved via Discord OAuth (Session: ${session.id.slice(0, 8)}...)`,
          })
          .eq('id', poolKey.id)
          .eq('current_uses', 0)
          .is('hwid', null)
          .select()
          .single();

        if (claimed) {
          await supabase
            .from('checkpoint_sessions')
            .update({ completed_all: true, issued_key: claimed.key_value })
            .eq('id', session.id);
        }
      }
    }

    // Redirect back to GetKey page — frontend will poll and see it's done
    return redirect(`${getKeyUrl}?discord_success=1`);
  }

  return jsonRes({ error: 'Invalid request' }, 400);
});
