import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    let key = "";
    let panel_key = "";
    let project_id = "";
    let hwid = "";
    let os = "Unknown";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        key = body.key || "";
        panel_key = body.panel_key || "";
        project_id = body.project_id || "";
        hwid = body.hwid || "";
        os = body.os || "Unknown";
      } catch {
        // Fallback to query params if JSON fails
        key = url.searchParams.get("key") || "";
        panel_key = url.searchParams.get("panel_key") || "";
        project_id = url.searchParams.get("project_id") || "";
        hwid = url.searchParams.get("hwid") || "";
      }
    } else {
      key = url.searchParams.get("key") || "";
      panel_key = url.searchParams.get("panel_key") || "";
      project_id = url.searchParams.get("project_id") || "";
      hwid = url.searchParams.get("hwid") || "";
    }

    if (!panel_key || typeof panel_key !== "string" || panel_key.length > 96) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid panel key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!key || typeof key !== "string" || key.trim().length === 0 || key.trim().length > 50) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid key format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const trimmedKey = key.trim();

    const ip = getIP(req);

    const { data: userKeyRow } = await supabase
      .from("user_panel_keys")
      .select("user_id")
      .eq("panel_key", panel_key)
      .maybeSingle();

    if (!userKeyRow) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid panel key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: keyCandidates, error: keyListError } = await supabase
      .from("license_keys")
      .select("*, projects(*)")
      .eq("key_value", trimmedKey);

    const keyData = keyCandidates?.find(
      (row: { projects?: { user_id?: string } | null }) =>
        row.projects?.user_id === userKeyRow.user_id,
    );

    if (keyListError) {
      console.error("Validate license query:", keyListError);
      return new Response(
        JSON.stringify({ success: false, error: "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!keyData) {
      await logEvent(supabase, null, null, "key_failed", ip, hwid, { key: trimmedKey, reason: "not_found" });
      return new Response(
        JSON.stringify({ success: false, error: "Invalid key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (project_id && keyData.project_id !== project_id) {
      await logEvent(supabase, keyData.project_id, keyData.id, "key_failed", ip, hwid, { reason: "project_mismatch", attempted_project: project_id });
      return new Response(
        JSON.stringify({ success: false, error: "Invalid key for this project" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!keyData.is_active) {
      await logEvent(supabase, keyData.project_id, keyData.id, "key_failed", ip, hwid, { reason: "disabled" });
      return new Response(
        JSON.stringify({ success: false, error: "Key is disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!keyData.projects?.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "Project is disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      await logEvent(supabase, keyData.project_id, keyData.id, "key_expired", ip, hwid, {});
      return new Response(
        JSON.stringify({ success: false, error: "Key has expired" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hwidMatches =
      !!(hwid && keyData.hwid && keyData.hwid === hwid);
    const isCheckpointReserved =
      typeof keyData.note === "string" &&
      keyData.note.startsWith("Checkpoint key —");
    const isReservedUnassigned =
      isCheckpointReserved && !keyData.hwid; // reserved but HWID not locked yet

    // If max uses is reached, allow the auth to pass only when the key is already
    // HWID-locked to this device (so remembered reloads don't consume extra uses).
    if (
      keyData.max_uses !== null &&
      keyData.current_uses >= keyData.max_uses &&
      !hwidMatches &&
      !isReservedUnassigned
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Key usage limit reached" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // HWID check
    if (hwid && keyData.hwid && keyData.hwid !== hwid) {
      await logEvent(supabase, keyData.project_id, keyData.id, "hwid_mismatch", ip, hwid, { expected: keyData.hwid });
      return new Response(
        JSON.stringify({ success: false, error: "HWID mismatch - key is locked to another device" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let shouldIncrementUses = !(hwidMatches);
    // If this key was reserved by checkpoints (current_uses already consumed),
    // then a first validate should lock HWID but not increment uses again.
    if (isReservedUnassigned && !hwidMatches) {
      shouldIncrementUses = false;
    }
    const nextUses = shouldIncrementUses ? keyData.current_uses + 1 : keyData.current_uses;

    // Lock HWID if not set. If it's already locked to this same HWID, we do not
    // increment uses (remembered reload).
    const updates: Record<string, any> = {};
    if (shouldIncrementUses) updates.current_uses = nextUses;
    
    if (hwid && !keyData.hwid) {
      // STRICT CONCURRENCY LIMIT: Make sure this HWID does not EVER have another key for this project
      const { data: existingKeys } = await supabase
        .from("license_keys")
        .select("id")
        .eq("project_id", keyData.project_id)
        .eq("hwid", hwid)
        .limit(1);

      if (existingKeys && existingKeys.length > 0) {
        await logEvent(supabase, keyData.project_id, keyData.id, "key_failed", ip, hwid, { reason: "hwid_limit_reached" });
        return new Response(
          JSON.stringify({ success: false, error: "You already own a key for this script. If it is expired, join the Discord to extend it!" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      updates.hwid = hwid;
      
      // FIRST USE: Set expiration timer if duration is configured
      if (keyData.expires_after_seconds && !keyData.expires_at) {
        const expiresAt = new Date(Date.now() + keyData.expires_after_seconds * 1000).toISOString();
        updates.expires_at = expiresAt;
        console.log(`[Validate] First use - setting expires_at to ${expiresAt} (${keyData.expires_after_seconds}s duration)`);
      }
      
      await logEvent(supabase, keyData.project_id, keyData.id, "hwid_locked", ip, hwid, {});
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("license_keys").update(updates).eq("id", keyData.id);
    }

    // Enrich IP data for logging
    let ipInfo: Record<string, string> = {};
    try {
      const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=isp,city,regionName,country`);
      if (geoRes.ok) {
        const geo = await geoRes.json();
        ipInfo = {
          isp: geo.isp || "Unknown",
          location: [geo.city, geo.regionName, geo.country].filter(Boolean).join(", ") || "Unknown",
        };
      }
    } catch { /* ignore geo failures */ }

    // Log successful auth with enriched data
    await logEvent(supabase, keyData.project_id, keyData.id, "key_auth", ip, hwid, {
      os: os || "Unknown",
      isp: ipInfo.isp || "Unknown",
      location: ipInfo.location || "Unknown",
    });

    // Create active session
    const { data: sessionData, error: sError } = await supabase
      .from("active_sessions")
      .insert({
        project_id: keyData.project_id,
        key_id: keyData.id,
        user_id: userKeyRow.user_id,
        hwid: hwid || null,
        ip_address: ip,
        os: os || "Unknown",
        status: "active",
      })
      .select("id")
      .single();

    if (sError) {
      console.error("Critical: Failed to create active session:", sError);
    }

    // Send Discord webhook with configurable fields
    await sendWebhook(supabase, keyData.project_id, "key_auth", {
      key: keyData.key_value,
      hwid: hwid || "none",
      ip,
      uses: formatUses(nextUses, keyData.max_uses),
      os: os || "Unknown",
      isp: ipInfo.isp || "Unknown",
      location: ipInfo.location || "Unknown",
    });

    return new Response(
      JSON.stringify({
        success: true,
        session_id: sessionData?.id || null,
        session_error: sError ? sError.message : null,
        key: keyData.key_value,
        key_active: !!keyData.is_active,
        project_id: keyData.project_id,
        project_name: keyData.projects?.name ?? null,
        panel_user_id: userKeyRow.user_id,
        uses: {
          current: nextUses,
          max: keyData.max_uses,
        },
        hwid_locked: !!(hwid && !keyData.hwid) || !!keyData.hwid,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Validate error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") || "unknown";
}

async function logEvent(
  supabase: any,
  projectId: string | null,
  keyId: string | null,
  eventType: string,
  ip: string,
  hwid: string | null,
  details: any
) {
  if (!projectId) return;
  try {
    await supabase.from("auth_logs").insert({
      project_id: projectId,
      key_id: keyId,
      event_type: eventType,
      ip_address: ip,
      hwid: hwid || null,
      details,
    });
  } catch (e) {
    console.error("Log error:", e);
  }
}

async function sendWebhook(
  supabase: any,
  projectId: string,
  eventType: string,
  data: Record<string, string>
) {
  try {
    const { data: webhooks } = await supabase
      .from("webhook_configs")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_active", true);

    if (!webhooks?.length) return;

    for (const wh of webhooks) {
      if (eventType === "key_auth" && !wh.log_key_auth) continue;
      if (eventType === "hwid_locked" && !wh.log_hwid_change) continue;

      const fields: Array<{ name: string; value: string; inline: boolean }> = [];
      fields.push({ name: "Key", value: `\`${data.key}\``, inline: true });
      fields.push({ name: "Uses", value: `\`${data.uses}\``, inline: true });

      if (wh.log_ip !== false) fields.push({ name: "IP", value: `\`${data.ip}\``, inline: true });
      if (wh.log_isp !== false) fields.push({ name: "ISP", value: `\`${data.isp}\``, inline: true });
      if (wh.log_location !== false) fields.push({ name: "Location", value: `\`${data.location}\``, inline: true });
      if (wh.log_os !== false) fields.push({ name: "OS", value: `\`${data.os}\``, inline: true });
      if (wh.log_hwid !== false) fields.push({ name: "HWID", value: `\`${data.hwid}\``, inline: true });

      const embed = {
        title: `🛡️ NullX.fun — ${eventType.replace(/_/g, " ").toUpperCase()}`,
        color: eventType === "key_auth" ? 0x32b464 : eventType.includes("fail") ? 0xff4444 : 0xffaa00,
        fields,
        timestamp: new Date().toISOString(),
      };

      await fetch(wh.discord_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
    }
  } catch (e) {
    console.error("Webhook error:", e);
  }
}

function formatUses(currentUses: number, maxUses: number | null) {
  return maxUses === null ? `${currentUses}/∞` : `${currentUses}/${maxUses}`;
}
