import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function isRobloxClient(req: Request): boolean {
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  return ua.includes("roblox") || ua.includes("robloxplayer") || ua.includes("robloxstudio");
}

function isBrowserLike(req: Request): boolean {
  if (isRobloxClient(req)) return false;
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  return ua.includes("mozilla") || ua.includes("chrome") ||
    ua.includes("safari") || ua.includes("edge") ||
    ua.includes("opera") || ua.includes("firefox");
}

function publicSiteUrl(req: Request): string {
  const env = Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("SITE_URL") || "";
  if (env) return env.replace(/\/$/, "");
  const ref = req.headers.get("referer");
  if (ref) {
    try {
      return new URL(ref).origin;
    } catch { /* fall through */ }
  }
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  return "https://null-x-fun.vercel.app";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    await cleanupExpiredLockedKeys(supabase);

    const url = new URL(req.url);

    // Mode 1: Serve obfuscated script by ID (loadstring style)
    const scriptId = url.searchParams.get("id");
    if (scriptId) {
      if (!/^[a-f0-9\-]{32,36}$/i.test(scriptId)) {
        return new Response("-- Invalid script ID", {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });
      }

      // Block browser access — only allow Roblox HttpGet (Roblox UA must not look like a browser)
      if (isBrowserLike(req)) {
        const site = publicSiteUrl(req);
        const protectedUrl = `${site}/protected/${scriptId}`;
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, "Location": protectedUrl },
        });
      }

      const { data: script, error } = await supabase
        .from("obfuscated_scripts")
        .select("obfuscated_content")
        .eq("id", scriptId)
        .single();

      if (error || !script) {
        return new Response("-- Script not found", {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });
      }

      return new Response(script.obfuscated_content, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Mode 2: Key-based loader (original flow)
    let key = "";
    let panelKey = "";
    let hwid = "";

    if (req.method === "GET") {
      panelKey = url.searchParams.get("panel_key") || "";
      key = url.searchParams.get("key") || "";
      hwid = url.searchParams.get("hwid") || "";
    } else {
      const body = await req.json();
      panelKey = body.panel_key || "";
      key = body.key || "";
      hwid = body.hwid || "";
    }

    if (!panelKey || typeof panelKey !== "string" || panelKey.length > 96) {
      return new Response("-- Invalid panel key", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    const { data: userKeyRow } = await supabase
      .from("user_panel_keys")
      .select("user_id")
      .eq("panel_key", panelKey)
      .maybeSingle();

    if (!userKeyRow) {
      return new Response("-- Invalid panel key", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    if (!key || typeof key !== "string" || key.length > 50) {
      return new Response("-- Invalid key", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    const { data: keyCandidates, error: keyListError } = await supabase
      .from("license_keys")
      .select("*, projects(*)")
      .eq("key_value", key);

    const keyData = keyCandidates?.find(
      (row: { projects?: { user_id?: string } | null }) =>
        row.projects?.user_id === userKeyRow.user_id,
    );

    if (keyListError) {
      console.error("Loader license query:", keyListError);
      return new Response("-- Internal server error", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }
    if (!keyData) {
      await logEvent(supabase, null, null, "key_failed", getIP(req), hwid, { key, reason: "not_found" });
      return new Response("-- Invalid key", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    if (!keyData.is_active) {
      await logEvent(supabase, keyData.project_id, keyData.id, "key_failed", getIP(req), hwid, { reason: "disabled" });
      return new Response("-- Key is disabled", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    if (!keyData.projects?.is_active) {
      return new Response("-- Project is disabled", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      await logEvent(supabase, keyData.project_id, keyData.id, "key_expired", getIP(req), hwid, {});
      return new Response("-- Key has expired", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    if (keyData.max_uses !== null && keyData.current_uses >= keyData.max_uses) {
      return new Response("-- Key usage limit reached", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    if (hwid && keyData.hwid && keyData.hwid !== hwid) {
      await logEvent(supabase, keyData.project_id, keyData.id, "hwid_mismatch", getIP(req), hwid, { expected: keyData.hwid });
      return new Response("-- HWID mismatch", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    const updates: Record<string, unknown> = { current_uses: keyData.current_uses + 1 };
    if (hwid && !keyData.hwid) {
      updates.hwid = hwid;
      await logEvent(supabase, keyData.project_id, keyData.id, "hwid_locked", getIP(req), hwid, {});
    }

    await supabase.from("license_keys").update(updates).eq("id", keyData.id);
    await logEvent(supabase, keyData.project_id, keyData.id, "key_auth", getIP(req), hwid, {});

    await sendWebhook(supabase, keyData.project_id, "key_auth", {
      key: keyData.key_value,
      hwid: hwid || "none",
      ip: getIP(req),
      uses: formatUses(keyData.current_uses + 1, keyData.max_uses),
    });

    const script = await getLatestObfuscatedScript(supabase, keyData.project_id) || "-- No obfuscated script available for this project";
    return new Response(script, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Loader error:", error);
    return new Response("-- Internal server error", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
});

function getIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") || "unknown";
}

async function logEvent(
  supabase: ReturnType<typeof createClient>,
  projectId: string | null,
  keyId: string | null,
  eventType: string,
  ip: string,
  hwid: string | null,
  details: Record<string, unknown>
) {
  if (!projectId) return;
  try {
    await supabase.from("auth_logs").insert({
      project_id: projectId, key_id: keyId, event_type: eventType,
      ip_address: ip, hwid: hwid || null, details,
    });
  } catch (e) { console.error("Log error:", e); }
}

async function sendWebhook(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  eventType: string,
  data: Record<string, string>
) {
  try {
    const { data: webhooks } = await supabase
      .from("webhook_configs").select("*")
      .eq("project_id", projectId).eq("is_active", true);
    if (!webhooks?.length) return;
    for (const wh of webhooks) {
      if (eventType === "key_auth" && !wh.log_key_auth) continue;
      const fields = [];
      if (wh.log_ip !== false) fields.push({ name: "IP", value: `\`${data.ip}\``, inline: true });
      if (wh.log_hwid !== false) fields.push({ name: "HWID", value: `\`${data.hwid}\``, inline: true });
      fields.push({ name: "Key", value: `\`${data.key}\``, inline: true });
      fields.push({ name: "Uses", value: `\`${data.uses}\``, inline: true });
      const embed = {
        title: `🛡️ NullX.fun — ${eventType.replace(/_/g, " ").toUpperCase()}`,
        color: 0x32b464, fields, timestamp: new Date().toISOString(),
      };
      await fetch(wh.discord_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
    }
  } catch (e) { console.error("Webhook error:", e); }
}

async function getLatestObfuscatedScript(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
) {
  const { data } = await supabase
    .from("obfuscated_scripts")
    .select("obfuscated_content")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.obfuscated_content ?? null;
}

function formatUses(currentUses: number, maxUses: number | null) {
  return maxUses === null ? `${currentUses}/∞` : `${currentUses}/${maxUses}`;
}

async function cleanupExpiredLockedKeys(
  supabase: ReturnType<typeof createClient>,
) {
  try {
    await supabase
      .from("license_keys")
      .delete()
      .eq("is_active", true)
      .not("hwid", "is", null)
      .lt("expires_at", new Date().toISOString());
  } catch (e) {
    console.error("cleanupExpiredLockedKeys error:", e);
  }
}
