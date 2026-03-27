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

    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing session ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update last_ping and fetch current state
    const { data: session, error: fetchError } = await supabase
      .from("active_sessions")
      .select("status, message")
      .eq("id", session_id)
      .maybeSingle();

    if (fetchError || !session) {
      return new Response(
        JSON.stringify({ success: false, error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update ping timestamp
    await supabase
      .from("active_sessions")
      .update({ last_ping: new Date().toISOString() })
      .eq("id", session_id);

    const response: any = { success: true };

    if (session.status === "killed") {
      response.action = "kill";
    }

    if (session.message) {
      response.message = session.message;
      // Clear the message after delivering it
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
