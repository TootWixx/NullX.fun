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

    const { session_id, reply_message, reply_to_id } = await req.json();

    if (!session_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing session ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If this is a message from the user, store it (reply_to_id can be null for first message / chat opener)
    if (reply_message) {
      const { error: replyError } = await supabase
        .from("message_threads")
        .insert({
          session_id,
          sender_type: "user",
          message: reply_message,
          reply_to_message_id: reply_to_id || null,
          notification_type: reply_to_id ? "reply" : "chat_open",
          can_reply: true,
        });
      
      if (replyError) {
        console.error("Error storing user message:", replyError);
      }
    }

    // Update last_ping and fetch current state
    const { data: session, error: fetchError } = await supabase
      .from("active_sessions")
      .select("id, status, message, last_ping, kick_reason, notification_enabled, custom_ui_enabled, project_id, key_id")
      .eq("id", session_id)
      .maybeSingle();

    if (fetchError || !session) {
      return new Response(
        JSON.stringify({ success: false, error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if session is stale (no ping for 2+ minutes = likely disconnected)
    const lastPing = session.last_ping ? new Date(session.last_ping).getTime() : 0;
    const now = Date.now();
    const staleThreshold = 2 * 60 * 1000; // 2 minutes
    const isStale = lastPing > 0 && (now - lastPing) > staleThreshold;

    if (isStale && session.status === "active") {
      // Mark as disconnected due to stale heartbeat
      await supabase
        .from("active_sessions")
        .update({ status: "disconnected", last_ping: new Date().toISOString() })
        .eq("id", session_id);
      
      return new Response(
        JSON.stringify({ success: false, error: "Session expired due to inactivity", action: "kill" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update ping timestamp
    await supabase
      .from("active_sessions")
      .update({ last_ping: new Date().toISOString(), status: "active" })
      .eq("id", session_id);

    const response: any = { 
      success: true,
      use_custom_ui: session.custom_ui_enabled !== false,
    };

    // Handle kill action
    if (session.status === "killed") {
      response.action = "kill";
      response.notification = {
        type: "kick",
        title: "⚠️ Session Terminated",
        message: session.kick_reason || "Your session has been terminated by the administrator.",
        can_reply: false,
      };
    }

    // Check for unread admin messages
    const { data: unreadMessages } = await supabase
      .from("message_threads")
      .select("id, message, notification_type, can_reply, created_at")
      .eq("session_id", session_id)
      .eq("sender_type", "admin")
      .eq("is_delivered", false)
      .order("created_at", { ascending: false })
      .limit(5);

    if (unreadMessages && unreadMessages.length > 0) {
      // Mark messages as delivered
      const messageIds = unreadMessages.map(m => m.id);
      await supabase
        .from("message_threads")
        .update({ is_delivered: true })
        .in("id", messageIds);

      // Add to response
      response.notifications = unreadMessages.map(m => ({
        id: m.id,
        type: m.notification_type || "info",
        title: m.notification_type === "warning" ? "⚠️ Warning" : m.notification_type === "kick" ? "🚫 Kicked" : "📨 Message from Admin",
        message: m.message,
        can_reply: m.can_reply !== false,
        timestamp: m.created_at,
      }));
    }

    // Check for user messages (replies) that the game client should display
    const { data: userMessages } = await supabase
      .from("message_threads")
      .select("id, message, reply_to_message_id, created_at")
      .eq("session_id", session_id)
      .eq("sender_type", "user")
      .eq("is_delivered", false)
      .order("created_at", { ascending: false })
      .limit(10);

    if (userMessages && userMessages.length > 0) {
      // Mark user messages as delivered
      const userMessageIds = userMessages.map(m => m.id);
      await supabase
        .from("message_threads")
        .update({ is_delivered: true })
        .in("id", userMessageIds);

      // Add user messages to response
      response.user_messages = userMessages.map(m => ({
        id: m.id,
        message: m.message,
        reply_to_id: m.reply_to_message_id,
        timestamp: m.created_at,
      }));
    }

    // Legacy message field support (single message)
    if (session.message && !response.notifications) {
      response.notification = {
        type: "info",
        title: "📨 Message from Admin",
        message: session.message,
        can_reply: false,
      };
      // Clear the legacy message after delivering
      await supabase
        .from("active_sessions")
        .update({ message: null })
        .eq("id", session_id);
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Heartbeat error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
