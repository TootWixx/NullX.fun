import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Anti-fraud constants ──────────────────────────────────────────────────────
const SESSION_EXPIRY_MINUTES = 60;
const MAX_SESSIONS_PER_IP_HOUR = 10;

// Per-type time gates (seconds the user must wait before Verify is unlocked)
// discord_server = 0 because it uses OAuth to actually verify membership
const TIME_GATES: Record<string, number> = {
  youtube_video:   90,
  youtube_channel: 60,
  discord_server:  0,
  generic_url:     45,
};

const getTimeGate = (type: string | null | undefined) =>
  TIME_GATES[type ?? 'generic_url'] ?? 45;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return jsonRes({ success: false, error: "Cloud configuration error (Missing Secrets)" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const clientIP = getIP(req);

    if (action === "ping") {
      return jsonRes({ success: true, message: "pong", ip: clientIP, timestamp: new Date().toISOString() });
    }

    // ═══════════════════════════════════════════════════════════════════════
    //   START: Create OR resume a checkpoint session
    //   KEY FIX: Reuses existing non-expired sessions for same IP + project
    // ═══════════════════════════════════════════════════════════════════════
    if (action === "start") {
      const projectId = url.searchParams.get("project_id");
      if (!projectId) {
        return jsonRes({ success: false, error: "Missing project_id" }, 400);
      }

      // Used by the public GetKey page to load the creator profile.
      const { data: projectRow } = await supabase
        .from("projects")
        .select("user_id")
        .eq("id", projectId)
        .maybeSingle();
      const projectUserId = projectRow?.user_id ?? null;

      // Get active checkpoints for this project
      const { data: checkpoints, error: cpErr } = await supabase
        .from("checkpoint_configs")
        .select("*")
        .eq("project_id", projectId)
        .eq("is_active", true)
        .order("checkpoint_order", { ascending: true });

      if (cpErr) {
        console.error("Error fetching checkpoints:", cpErr);
        return jsonRes({ success: false, error: "Failed to load checkpoints" }, 500);
      }
      if (!checkpoints?.length) {
        return jsonRes({ success: false, error: "No checkpoints configured" }, 404);
      }

      const sessionParam = url.searchParams.get("session");
      let existingSession = null;

      // ──── 1. Hybrid Session Lookup: Token first (Must match project_id), then IP ────
      if (sessionParam) {
        const { data: sess } = await supabase
          .from("checkpoint_sessions")
          .select("*")
          .eq("session_token", sessionParam)
          .eq("project_id", projectId) // Important: ensure session belongs to THIS project
          .gte("expires_at", new Date().toISOString())
          .maybeSingle();
        existingSession = sess;
      }

      if (!existingSession) {
        // Fallback to IP-based lookup
        const { data: sess } = await supabase
          .from("checkpoint_sessions")
          .select("*")
          .eq("project_id", projectId)
          .eq("ip_address", clientIP)
          .gte("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        existingSession = sess;
      }

      if (existingSession) {
        // Reuse existing session — get completions across ALL sessions for this IP+project
        const historicalKey = await getHistoricalKeyStatusForIP(supabase, projectId, existingSession.ip_address);
        
        // Prioritize session's own key first, then fall back to historical key
        const finalKeyVal = existingSession.issued_key || (historicalKey?.status === 'active' ? historicalKey.key_value : null);
        const finalKeyStatus = (historicalKey?.status === 'expired') ? 'expired' : (finalKeyVal ? 'active' : null);
        const finalKeyExpires = (historicalKey?.status === 'active') ? historicalKey.expires_at : null;

        if (finalKeyStatus === 'expired') {
           return jsonRes({ success: true, key_expired: true, issued_key: historicalKey?.key_value, all_done: true });
        }

        const { data: ipSessions } = await supabase
          .from("checkpoint_sessions")
          .select("session_token")
          .eq("project_id", projectId)
          .eq("ip_address", existingSession.ip_address);

        const allTokens = (ipSessions || []).map((s: any) => s.session_token);

        const { data: completions } = await supabase
          .from("checkpoint_completions")
          .select("checkpoint_id")
          .in("session_token", allTokens);

        const completedIds = (completions || []).map((c: any) => c.checkpoint_id);
        const allDoneLocally = !!finalKeyVal || checkpoints.every((cp: any) => completedIds.includes(cp.id));

        // If we found a historical key but the session doesn't have it yet, link it
        if (finalKeyVal && !existingSession.issued_key) {
          await supabase.from("checkpoint_sessions").update({ issued_key: finalKeyVal, completed_all: true }).eq("id", existingSession.id);
        }

        return jsonRes({
          success: true,
          session_token: existingSession.session_token,
          resumed: true,
          completed_ids: !!finalKeyVal ? checkpoints.map((c: any) => c.id) : completedIds,
          issued_key: finalKeyVal,
          key_expires_at: finalKeyExpires,
          all_done: allDoneLocally,
          project_user_id: projectUserId,
          checkpoints: checkpoints.map((c: any) => ({
            id: c.id,
            name: c.checkpoint_name,
            checkpoint_type: c.checkpoint_type || 'generic_url',
            display_label: c.display_label || null,
            guild_id: c.guild_id || null,
            provider: c.provider,
            link: c.provider_link,
            order: c.checkpoint_order,
          })),
        });
      }

      // ──── 2. No existing session — rate limit then create new ────
      const historicalKey = await getHistoricalKeyStatusForIP(supabase, projectId, clientIP);
      if (historicalKey?.status === 'expired') {
          return jsonRes({ success: true, key_expired: true, issued_key: historicalKey.key_value, all_done: true });
      }
      const issuedKey = historicalKey?.status === 'active' ? historicalKey.key_value : null;
      const keyExpiresAt = historicalKey?.status === 'active' ? historicalKey.expires_at : null;

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentSessions } = await supabase
        .from("checkpoint_sessions")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", clientIP)
        .gte("created_at", oneHourAgo);

      if ((recentSessions || 0) >= MAX_SESSIONS_PER_IP_HOUR) {
        return jsonRes({ success: false, error: "Rate limited. Try again later." }, 429);
      }

      const sessionToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000).toISOString();

      const { error: insertErr } = await supabase.from("checkpoint_sessions").insert({
        project_id: projectId,
        session_token: sessionToken,
        ip_address: clientIP,
        expires_at: expiresAt,
        issued_key: issuedKey,
        completed_all: !!issuedKey,
      });

      if (insertErr) {
        console.error("Error creating session:", insertErr);
        return jsonRes({ success: false, error: "Failed to create session" }, 500);
      }

      return jsonRes({
        success: true,
        session_token: sessionToken,
        resumed: false,
        issued_key: issuedKey,
        key_expires_at: keyExpiresAt,
        all_done: !!issuedKey,
        completed_ids: !!issuedKey ? checkpoints.map((c: any) => c.id) : [],
        project_user_id: projectUserId,
        checkpoints: checkpoints.map((c: any) => ({
          id: c.id,
          name: c.checkpoint_name,
          checkpoint_type: c.checkpoint_type || 'generic_url',
          display_label: c.display_label || null,
          guild_id: c.guild_id || null,
          provider: c.provider,
          link: c.provider_link,
          order: c.checkpoint_order,
        })),
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    //   POLL: Check completion status
    // ═══════════════════════════════════════════════════════════════════════
    if (action === "poll" || action === "status") {
      const sessionToken = url.searchParams.get("session");
      if (!sessionToken) {
        return jsonRes({ success: false, error: "Missing session token" }, 400);
      }

      const { data: session } = await supabase
        .from("checkpoint_sessions")
        .select("*")
        .eq("session_token", sessionToken)
        .single();

      if (!session) {
        return jsonRes({ success: false, error: "Invalid session" }, 404);
      }

      // Check for key: Session first, then IP
      const historicalKey = await getHistoricalKeyStatusForIP(supabase, session.project_id, session.ip_address);
      if (historicalKey?.status === 'expired') {
          return jsonRes({ success: true, key_expired: true, issued_key: historicalKey.key_value, all_done: true });
      }
      const issuedKey = session.issued_key || (historicalKey?.status === 'active' ? historicalKey.key_value : null);
      const keyExpiresAt = (historicalKey?.status === 'active') ? historicalKey.expires_at : null;

      const { data: allIpSessions } = await supabase
        .from("checkpoint_sessions")
        .select("session_token")
        .eq("project_id", session.project_id)
        .eq("ip_address", session.ip_address);

      const { data: checkpoints } = await supabase
        .from("checkpoint_configs")
        .select("id, checkpoint_order")
        .eq("project_id", session.project_id)
        .eq("is_active", true);

      const allTokens = (allIpSessions || []).map((s: any) => s.session_token);
      const { data: completions } = await supabase
        .from("checkpoint_completions")
        .select("checkpoint_id")
        .in("session_token", allTokens);

      const completedSet = new Set((completions || []).map((c: any) => c.checkpoint_id));
      const activeCPs = checkpoints || [];
      const missingIds = !!issuedKey ? [] : activeCPs
        .filter((cp: any) => !completedSet.has(cp.id))
        .map((cp: any) => cp.id);
      
      const allDone = (activeCPs.length > 0 && missingIds.length === 0) || !!issuedKey;

      // Diagnostic logging
      if (!allDone) {
        console.log(`[Poll] Session ${sessionToken.slice(0,8)} is NOT done. Missing: ${missingIds.length}/${activeCPs.length}`);
      }

      // ── KEY FIX: Attempt to claim key if all done but none issued yet ──
      let finalIssuedKey = issuedKey;
      if (allDone && !finalIssuedKey) {
        console.log(`[Poll-Claim] Attempting to claim key for project ${session.project_id} during poll`);
        
        // Find an available key (unused, active, not expired)
        // SIMPLIFIED: Fetch active keys and filter in code
        const { data: allKeys, error: keyQueryErr } = await supabase
          .from("license_keys")
          .select("id, key_value, expires_at, current_uses")
          .eq("project_id", session.project_id)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(50);

        console.log(`[Poll-Claim] Query: allKeys.length=${allKeys?.length || 0}, error=${keyQueryErr?.message || 'none'}`);

        // Filter for available keys in code
        const availableKeys = (allKeys || []).filter((k: any) => {
          const isUnused = k.current_uses === 0 || k.current_uses === null;
          const isNotExpired = !k.expires_at || new Date(k.expires_at).getTime() > Date.now();
          console.log(`[Poll-Claim] Key ${k.id.slice(0,8)}: uses=${k.current_uses}, unused=${isUnused}, expired=${!isNotExpired}`);
          return isUnused && isNotExpired;
        });
        
        console.log(`[Poll-Claim] Filtered: ${availableKeys.length} available`);
        
        const poolKey = availableKeys[0];
        console.log(`[Poll-Claim] poolKey:`, poolKey ? poolKey.id.slice(0,8) : 'NONE');
        if (poolKey) {
          // Attempt to claim atomically - SIMPLIFIED
          const { data: claimedKey } = await supabase
            .from("license_keys")
            .update({ 
              current_uses: 1, 
              note: `Checkpoint key — Reserved via Poll/Retry: ${sessionToken.slice(0, 8)}... (IP: ${clientIP})` 
            })
            .eq("id", poolKey.id)
            .select()
            .single();

          if (claimedKey) {
            finalIssuedKey = claimedKey.key_value;
            // Update session
            await supabase
              .from("checkpoint_sessions")
              .update({ completed_all: true, issued_key: finalIssuedKey })
              .eq("id", session.id);
            console.log(`[Poll-Claim] Successfully claimed key during poll: ${finalIssuedKey.slice(0, 4)}...`);
          }
        }

        // If STILL no key after attempt, return 503
        if (!finalIssuedKey) {
          return jsonRes({ 
            success: false, 
            error: "No keys currently available in the project pool. Please notify the creator.",
            all_done: true
          }, 503);
        }
      }

      return jsonRes({
        success: true,
        completed_ids: !!finalIssuedKey ? activeCPs.map((cp:any) => cp.id) : Array.from(completedSet),
        completed: !!finalIssuedKey ? activeCPs.length : completedSet.size,
        total: activeCPs.length,
        missing_ids: missingIds,
        all_done: allDone,
        issued_key: finalIssuedKey,
        key_expires_at: keyExpiresAt,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    //   VERIFY (POST): Time-gated checkpoint completion
    // ═══════════════════════════════════════════════════════════════════════
    if (req.method === "POST") {
      const body = await req.json();
      const { session_token, checkpoint_id, started_at } = body;

      if (!session_token || !checkpoint_id) {
        return jsonRes({ success: false, error: "Missing session_token or checkpoint_id" }, 400);
      }

      // 1) Verify session exists
      const { data: session } = await supabase
        .from("checkpoint_sessions")
        .select("*")
        .eq("session_token", session_token)
        .single();

      if (!session) {
        return jsonRes({ success: false, error: "Invalid session. Refresh the page and try again." }, 404);
      }

      // Expiry check
      if (new Date(session.expires_at) < new Date()) {
        return jsonRes({ success: false, error: "Session expired. Refresh to start a new one." }, 403);
      }

      // 2) Verify checkpoint belongs to this project
      const { data: cpConfig } = await supabase
        .from("checkpoint_configs")
        .select("id, checkpoint_order, checkpoint_type, provider, project_id")
        .eq("id", checkpoint_id)
        .eq("project_id", session.project_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!cpConfig) {
        return jsonRes({ success: false, error: "Invalid checkpoint." }, 400);
      }

      // 3) Get all checkpoints + completions across ALL sessions for this IP+project
      //    Uses session.ip_address (stored IP) instead of clientIP to avoid
      //    GET vs POST IP mismatch in Supabase Edge Functions
      const { data: allCPs } = await supabase
        .from("checkpoint_configs")
        .select("id, checkpoint_order")
        .eq("project_id", session.project_id)
        .eq("is_active", true)
        .order("checkpoint_order", { ascending: true });

      // Use the SESSION's stored IP (not request IP) for consistency
      const { data: ipSessions } = await supabase
        .from("checkpoint_sessions")
        .select("session_token")
        .eq("project_id", session.project_id)
        .eq("ip_address", session.ip_address);

      const allTokens = (ipSessions || []).map((s: any) => s.session_token);

      const { data: completions } = await supabase
        .from("checkpoint_completions")
        .select("checkpoint_id, created_at")
        .in("session_token", allTokens)
        .order("created_at", { ascending: false });

      const completedSet = new Set((completions || []).map((c: any) => c.checkpoint_id));

      // NOTE: Sequential order is enforced in the frontend UI (only shows Start
      // for the next unlocked checkpoint). Server-side order checks were removed
      // because IP differences between GET and POST requests in Supabase Edge
      // Functions caused false "complete previous first" rejections.

      // 5) Already completed? (idempotent)
      if (completedSet.has(checkpoint_id)) {
        const allDone = allCPs?.every((cp: any) => completedSet.has(cp.id)) ?? false;
        return jsonRes({
          success: true,
          all_done: allDone,
          completed: completedSet.size,
          total: allCPs?.length || 0,
          issued_key: session.issued_key || null,
        });
      }

      // 6) TIME GATE: minimum time since user opened the link
      //    discord_server is verified via OAuth, skip time gate for it
      const checkpointType: string = (cpConfig as any).checkpoint_type || 'generic_url';
      const minSeconds = getTimeGate(checkpointType);

      if (checkpointType !== 'discord_server' && started_at && minSeconds > 0) {
        const elapsed = (Date.now() - started_at) / 1000;
        if (elapsed < minSeconds) {
          const wait = Math.ceil(minSeconds - elapsed);
          return jsonRes({
            success: false,
            error: `Complete the checkpoint first. Verify unlocks in ${wait}s.`,
            retry_after: wait,
          }, 429);
        }
      }

      // 7) Minimum time between completions
      if (checkpointType !== 'discord_server' && completions && completions.length > 0) {
        const lastCompletion = completions[0];
        const timeSinceLast = (Date.now() - new Date(lastCompletion.created_at).getTime()) / 1000;
        if (timeSinceLast < minSeconds) {
          const wait = Math.ceil(minSeconds - timeSinceLast);
          return jsonRes({
            success: false,
            error: `Wait ${wait}s before verifying the next checkpoint.`,
            retry_after: wait,
          }, 429);
        }
      }

      // 8) Record completion — CHECK FOR ERRORS
      const { error: insertErr } = await supabase.from("checkpoint_completions").insert({
        checkpoint_id,
        session_token,
        ip_address: clientIP,
      });

      if (insertErr) {
        console.error("Failed to insert completion:", insertErr);
        return jsonRes({ success: false, error: "Failed to record completion. Try again." }, 500);
      }

      completedSet.add(checkpoint_id);

      // 9) Check if all done → claim key from license pool
      const allDone = allCPs?.every((cp: any) => completedSet.has(cp.id)) ?? false;

      // Check if ANY related session already has a key before claiming new one
      const historicalKey = await getHistoricalKeyStatusForIP(supabase, session.project_id, session.ip_address);
      if (historicalKey?.status === 'expired') {
          return jsonRes({ success: true, key_expired: true, issued_key: historicalKey.key_value, all_done: true });
      }
      const existingIssuedKey = session.issued_key || (historicalKey?.status === 'active' ? historicalKey.key_value : null);
      const keyExpiresAt = (historicalKey?.status === 'active') ? historicalKey.expires_at : null;

      if (allDone && !existingIssuedKey) {
        console.log(`[Claim] START: project=${session.project_id}, ip=${session.ip_address}`);
        
        // Find an available key for this project in the pool
        // SIMPLIFIED: Fetch all active keys and filter in code to avoid query issues
        const { data: allKeys, error: poolQueryErr } = await supabase
          .from("license_keys")
          .select("id, key_value, current_uses, hwid, expires_at, max_uses")
          .eq("project_id", session.project_id)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(50);

        console.log(`[Claim] Query result: allKeys.length=${allKeys?.length || 0}, error=${poolQueryErr?.message || 'none'}`);

        if (poolQueryErr) {
          console.error(`[Claim] Pool query error:`, poolQueryErr);
          return jsonRes({ success: false, error: "Database error while fetching key pool." }, 500);
        }

        // Filter for available keys (unused and not expired) in code
        const availableKeys = (allKeys || []).filter((k: any) => {
          const isUnused = k.current_uses === 0 || k.current_uses === null;
          const isNotExpired = !k.expires_at || new Date(k.expires_at).getTime() > Date.now();
          console.log(`[Claim] Checking key ${k.id.slice(0,8)}: uses=${k.current_uses}, unused=${isUnused}, notExpired=${isNotExpired}`);
          return isUnused && isNotExpired;
        });
        
        console.log(`[Claim] After filter: ${availableKeys.length} available keys`);
        
        const poolKey = availableKeys[0];
        console.log(`[Claim] Selected poolKey:`, poolKey ? poolKey.id.slice(0,8) : 'NONE');

        if (!poolKey) {
          // Diagnostic: Count how many keys EXIST for this project regardless of state
          const { count: totalKeys } = await supabase
            .from("license_keys")
            .select("id", { count: "exact", head: true })
            .eq("project_id", session.project_id);

          const { count: activeKeys } = await supabase
            .from("license_keys")
            .select("id", { count: "exact", head: true })
            .eq("project_id", session.project_id)
            .eq("is_active", true);

          return jsonRes({ 
            success: false, 
            error: "No keys currently available in the project pool.",
            debug: { project_id: session.project_id, total: totalKeys || 0, active: activeKeys || 0, available: 0 }
          }, 503);
        }

        // Attempt to claim the key - SIMPLIFIED: Just update and check result
        console.log(`[Claim] Claiming key id: ${poolKey.id}`);
        const { data: claimedKey, error: claimErr } = await supabase
          .from("license_keys")
          .update({ 
            current_uses: 1, 
            note: `Checkpoint key — Reserved by session: ${session_token.slice(0, 8)}... (IP: ${clientIP})` 
          })
          .eq("id", poolKey.id)
          .select()
          .single();

        if (claimErr || !claimedKey) {
          console.error(`[Claim] Claim error:`, claimErr || "No record returned");
          return jsonRes({ success: false, error: "Failed to claim key from pool. Please try again." }, 500);
        }

        console.log(`[Claim] Successfully claimed key: ${claimedKey.key_value.slice(0, 4)}...`);

        // Update session with the claimed key
        // NOTE: Always update; if another request already wrote a key, prefer that one
        const { data: sessionUpdated, error: sessionUpdateErr } = await supabase
          .from("checkpoint_sessions")
          .update({ completed_all: true, issued_key: claimedKey.key_value })
          .eq("id", session.id)
          .select("issued_key")
          .maybeSingle();

        if (sessionUpdateErr) {
          console.error(`[Claim] Session update error:`, sessionUpdateErr);
          // Return the key anyway since we claimed it
        }

        const finalIssuedKey = sessionUpdated?.issued_key || claimedKey.key_value;
        return jsonRes({ success: true, all_done: true, key: finalIssuedKey, issued_key: finalIssuedKey, key_expires_at: claimedKey.expires_at });
      }

      return jsonRes({
        success: true,
        all_done: allDone,
        key: existingIssuedKey || session.issued_key || null,
        issued_key: existingIssuedKey || session.issued_key || null,
        key_expires_at: keyExpiresAt,
        completed: !!existingIssuedKey ? allCPs?.length : completedSet.size,
        total: allCPs?.length || 0,
      });
    }

    return jsonRes({ success: false, error: "Invalid request" }, 400);
  } catch (error) {
    console.error("Checkpoint error:", error);
    return jsonRes({ success: false, error: "Internal server error" }, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") || "unknown";
}

function generateKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const parts: string[] = [];
  for (let i = 0; i < 5; i++) {
    let seg = "";
    for (let j = 0; j < 5; j++) seg += chars[Math.floor(Math.random() * chars.length)];
    parts.push(seg);
  }
  return parts.join("-");
}

async function getHistoricalKeyStatusForIP(supabase: any, projectId: string, ipAddress: string): Promise<{ key_value: string, status: 'active' | 'expired', expires_at: string | null } | null> {
  // 1. Search checkpoint_sessions for keys linked to this IP
  const { data: ipSessions } = await supabase
    .from("checkpoint_sessions")
    .select("issued_key")
    .eq("project_id", projectId)
    .eq("ip_address", ipAddress)
    .not("issued_key", "is", null);

  const sessionKeys = (ipSessions || []).map((s: any) => s.issued_key);
  
  // 2. Search license_keys notes for this IP (covers session record desync)
  // Use a more robust search pattern to avoid IP partial matches
  const { data: noteKeys } = await supabase
    .from("license_keys")
    .select("key_value")
    .eq("project_id", projectId)
    .or(`note.ilike.% (IP: ${ipAddress}),note.ilike.% (IP: ::ffff:${ipAddress})`);

  const extraKeys = (noteKeys || []).map((k: any) => k.key_value);
  const allUniqueKeys = Array.from(new Set([...sessionKeys, ...extraKeys]));

  if (allUniqueKeys.length === 0) return null;

  // 3. Verify the latest state of these keys in license_keys
  const { data: validKeys } = await supabase
    .from("license_keys")
    .select("key_value, is_active, expires_at")
    .in("key_value", allUniqueKeys)
    .order("created_at", { ascending: false })
    .limit(1);

  if (validKeys && validKeys.length > 0) {
    const keyRecord = validKeys[0];
    const isExpired = keyRecord.expires_at && new Date(keyRecord.expires_at).getTime() < Date.now();
    const isActive = keyRecord.is_active && !isExpired;
    
    return {
      key_value: keyRecord.key_value,
      status: isActive ? 'active' : 'expired',
      expires_at: keyRecord.expires_at
    };
  }
  
  return null;
}
