import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getBase64FromDataUrl = (dataUrl: string) => {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
};

const base64ToUint8Array = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonRes({ success: false, error: "Unauthorized: missing bearer token" }, 401);
    }
    const token = authHeader.slice("Bearer ".length);

    // 1) Validate user identity (cheap + safe)
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
    const userId = userData.user?.id;
    if (!userId) {
      return jsonRes({ success: false, error: `Unauthorized: ${userErr?.message ?? "Invalid JWT"}` }, 401);
    }

    // 2) Upload using service role (bypasses storage RLS)
    const body = await req.json();
    const type: "avatar" | "background" = body.type;
    const dataUrlOrBase64: string = body.dataUrlOrBase64;
    const fileName: string = body.fileName ?? "upload";
    const contentType: string = body.contentType ?? "application/octet-stream";
    const ext =
      fileName && fileName.includes(".") ? fileName.split(".").pop() : type === "avatar" ? "png" : "jpg";

    if (!["avatar", "background"].includes(type)) {
      return jsonRes({ success: false, error: "Invalid type" }, 400);
    }
    if (!dataUrlOrBase64?.trim()) {
      return jsonRes({ success: false, error: "Missing image data" }, 400);
    }

    const base64 = getBase64FromDataUrl(dataUrlOrBase64);
    const bytes = base64ToUint8Array(base64);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const path = `profiles/${userId}/${type}.${ext}`;
    const { error: uploadErr } = await serviceClient.storage
      .from("creator-media")
      .upload(path, bytes, { upsert: true, contentType });

    if (uploadErr) {
      return jsonRes({ success: false, error: `Upload failed: ${uploadErr.message}` }, 500);
    }

    const { data: urlData } = serviceClient.storage
      .from("creator-media")
      .getPublicUrl(path);

    return jsonRes({ success: true, url: urlData.publicUrl });
  } catch (e) {
    return jsonRes(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      500
    );
  }
});

