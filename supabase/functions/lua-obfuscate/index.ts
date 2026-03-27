import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: authHeader },
      },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const effectiveUserId = userData.user?.id;
    const effectiveUserEmail = userData.user?.email?.toLowerCase() ?? "";
    if (!effectiveUserId) {
      throw new Error(`Unauthorized: ${userError?.message ?? "Invalid JWT"}`);
    }

    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", effectiveUserId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = effectiveUserEmail === "real5wagger5oup@gmail.com" || !!adminRole;

    const { data: panelKeyRow } = await supabase
      .from("user_panel_keys")
      .select("id")
      .eq("user_id", effectiveUserId)
      .maybeSingle();
    const hasPaidPanelKey = !!panelKeyRow;
    const isStarter = !isAdmin && !hasPaidPanelKey;

    const contentType = req.headers.get("content-type") || "";
    let luaSource = "";
    let options = {
      stringEncryption: true,
      controlFlowFlattening: true,
      variableRenaming: false,
    };
    let mode: ObfuscationMode = "balanced";
    let projectId: string | null = null;
    let fileName = "untitled.lua";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      luaSource = body.source || "";
      if (body.options) options = { ...options, ...body.options };
      if (body.mode && ["safe", "balanced", "aggressive"].includes(body.mode)) {
        mode = body.mode as ObfuscationMode;
      }
      projectId = body.projectId || null;
      fileName = body.fileName || fileName;
    } else {
      const formData = await req.formData();
      const file = formData.get("file");
      if (file && file instanceof File) {
        luaSource = await file.text();
        fileName = file.name || fileName;
      }
      const optStr = formData.get("options");
      if (optStr && typeof optStr === "string") {
        try { options = { ...options, ...JSON.parse(optStr) }; } catch {}
      }
      const modeStr = formData.get("mode");
      if (typeof modeStr === "string" && ["safe", "balanced", "aggressive"].includes(modeStr)) {
        mode = modeStr as ObfuscationMode;
      }
      projectId = formData.get("projectId") as string | null;
    }

    if (!luaSource.trim()) {
      return new Response(
        JSON.stringify({ error: "No Lua source provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isStarter) {
      const { count, error: countErr } = await supabase
        .from("obfuscated_scripts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", effectiveUserId);
      if (countErr) throw new Error(`Failed to verify obfuscation quota: ${countErr.message}`);
      if ((count ?? 0) >= 20) {
        return new Response(
          JSON.stringify({ error: "Starter plan limit reached: 20 obfuscations maximum" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const tuned = tuneOptionsForScript(luaSource, options, mode);
    const obfuscated = obfuscateLua(luaSource, tuned.applied);

    const { data: scriptData, error: insertError } = await supabase
      .from("obfuscated_scripts")
      .insert({
        user_id: effectiveUserId,
        project_id: projectId,
        original_name: fileName,
        obfuscated_content: obfuscated,
      })
      .select("id")
      .single();

    if (insertError) throw new Error("Failed to store script: " + insertError.message);

    const loaderUrl = `${supabaseUrl}/functions/v1/loader?id=${scriptData.id}`;
    const loadstring = `loadstring(game:HttpGet("${loaderUrl}"))()`;

    return new Response(
      JSON.stringify({
        success: true,
        scriptId: scriptData.id,
        loaderUrl,
        loadstring,
        mode,
        appliedOptions: tuned.applied,
        note: tuned.note,
        stats: {
          originalSize: luaSource.length,
          obfuscatedSize: obfuscated.length,
          ratio: (obfuscated.length / luaSource.length).toFixed(2),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ═══════════════════════════════════════════════════════════════
// Lua Obfuscation Engine — Roblox-safe implementation
// ═══════════════════════════════════════════════════════════════

interface ObfuscationOptions {
  stringEncryption: boolean;
  controlFlowFlattening: boolean;
  variableRenaming: boolean;
}
type ObfuscationMode = "safe" | "balanced" | "aggressive";

function tuneOptionsForScript(
  source: string,
  requested: ObfuscationOptions,
  mode: ObfuscationMode,
): { applied: ObfuscationOptions; note: string | null } {
  const lineCount = source.split(/\r?\n/).length;
  const charCount = source.length;
  const applied = { ...requested };
  const notes: string[] = [];

  if (mode === "safe") {
    applied.stringEncryption = true;
    applied.controlFlowFlattening = false;
    applied.variableRenaming = false;
    notes.push("safe profile applied");
  } else if (mode === "aggressive") {
    applied.stringEncryption = true;
    applied.controlFlowFlattening = true;
    applied.variableRenaming = true;
    notes.push("aggressive profile applied");
  }

  // These regex-based transforms are intentionally conservative for large scripts.
  if (lineCount > 300 || charCount > 40_000) {
    if (applied.controlFlowFlattening) {
      applied.controlFlowFlattening = false;
      notes.push("control-flow flattening disabled for stability on larger scripts");
    }
  }
  if (lineCount > 900 || charCount > 120_000) {
    if (applied.variableRenaming) {
      applied.variableRenaming = false;
      notes.push("variable renaming disabled for stability on very large scripts");
    }
  }

  return { applied, note: notes.length ? notes.join("; ") : null };
}

function obfuscateLua(source: string, options: ObfuscationOptions): string {
  const hasAnyObfuscation =
    options.stringEncryption || options.controlFlowFlattening || options.variableRenaming;
  // No transforms: store plain source so Roblox loadstring limits aren't hit by the byte wrapper.
  if (!hasAnyObfuscation) return source;

  let result = source;

  // Step 1: Extract all strings and comments so we never modify them
  const { codeTokens, protectedTokens } = tokenize(result);

  // Step 2: Apply transformations only to code tokens
  let codeOnly = codeTokens.join("\x00");

  if (options.variableRenaming) {
    codeOnly = renameVariables(codeOnly);
  }

  if (options.controlFlowFlattening) {
    codeOnly = flattenControlFlow(codeOnly);
  }

  // Reassemble with original strings/comments
  const codeParts = codeOnly.split("\x00");
  let reassembled = "";
  for (let i = 0; i < codeParts.length; i++) {
    reassembled += codeParts[i];
    if (i < protectedTokens.length) {
      reassembled += protectedTokens[i];
    }
  }

  // Step 3: String encryption (works on the reassembled source,
  // carefully only encrypting actual string literals)
  if (options.stringEncryption) {
    reassembled = encryptStrings(reassembled);
  }

  // Step 4: Encode as UTF-8 bytes + loadstring (matches Luau script bytes)
  result = wrapInVM(reassembled);
  return result;
}

// ─── Tokenizer ───────────────────────────────────────────────
// Splits Lua source into alternating code/protected segments.
// Protected = strings and comments that must not be transformed.

function tokenize(source: string): { codeTokens: string[]; protectedTokens: string[] } {
  const codeTokens: string[] = [];
  const protectedTokens: string[] = [];
  let i = 0;
  let codeStart = 0;

  while (i < source.length) {
    // Long comment --[=*[...]=*]
    if (source[i] === '-' && source[i + 1] === '-' && source[i + 2] === '[') {
      const longStr = tryLongString(source, i + 2);
      if (longStr !== null) {
        codeTokens.push(source.slice(codeStart, i));
        const end = i + 2 + longStr.length;
        protectedTokens.push(source.slice(i, end));
        i = end;
        codeStart = i;
        continue;
      }
    }

    // Single-line comment --
    if (source[i] === '-' && source[i + 1] === '-') {
      codeTokens.push(source.slice(codeStart, i));
      const nl = source.indexOf('\n', i);
      const end = nl === -1 ? source.length : nl;
      protectedTokens.push(source.slice(i, end));
      i = end;
      codeStart = i;
      continue;
    }

    // Long string [=*[...]=*]
    if (source[i] === '[') {
      const longStr = tryLongString(source, i);
      if (longStr !== null) {
        codeTokens.push(source.slice(codeStart, i));
        protectedTokens.push(longStr);
        i += longStr.length;
        codeStart = i;
        continue;
      }
    }

    // Quoted strings
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      codeTokens.push(source.slice(codeStart, i));
      let j = i + 1;
      while (j < source.length && source[j] !== quote) {
        if (source[j] === '\\') j++;
        j++;
      }
      if (j < source.length) j++; // include closing quote
      protectedTokens.push(source.slice(i, j));
      i = j;
      codeStart = i;
      continue;
    }

    i++;
  }

  codeTokens.push(source.slice(codeStart));
  return { codeTokens, protectedTokens };
}

function tryLongString(source: string, pos: number): string | null {
  if (source[pos] !== '[') return null;
  let eqCount = 0;
  let j = pos + 1;
  while (j < source.length && source[j] === '=') { eqCount++; j++; }
  if (j >= source.length || source[j] !== '[') return null;

  const closing = "]" + "=".repeat(eqCount) + "]";
  const endIdx = source.indexOf(closing, j + 1);
  if (endIdx === -1) return null;
  return source.slice(pos, endIdx + closing.length);
}

// ─── Variable Renaming ───────────────────────────────────────
// Only renames local variables found via `local X =` or `local function X`
// Uses word-boundary-safe replacement, skips table access (. and :)

const LUA_KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "goto",
  "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
]);

const LUA_BUILTINS = new Set([
  "print", "tostring", "tonumber", "type", "pairs", "ipairs", "table", "string", "math",
  "io", "os", "error", "pcall", "xpcall", "require", "select", "unpack", "next", "rawget", "rawset",
  "setmetatable", "getmetatable", "coroutine", "debug", "bit32", "load", "loadstring", "assert",
  "collectgarbage", "dofile", "loadfile", "rawequal", "rawlen", "self",
  "game", "workspace", "script", "Instance", "Vector3", "CFrame", "Color3", "UDim2", "UDim",
  "Enum", "wait", "spawn", "delay", "tick", "time", "warn", "typeof",
  "task", "buffer", "utf8", "newproxy", "shared", "_G", "_VERSION",
  "Vector2", "Ray", "Region3", "TweenInfo", "NumberSequence", "ColorSequence",
  "NumberRange", "Rect", "BrickColor", "PhysicalProperties",
  // Common Roblox members — never rename (would break x.Name etc.)
  "Name", "Parent", "ClassName", "FindFirstChild", "WaitForChild", "GetService", "Clone", "Destroy",
]);

function generateVarName(index: number): string {
  // Generate names like _a, _b, ... _z, _aa, _ab, etc.
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let name = "_";
  let n = index;
  do {
    name += chars[n % chars.length];
    n = Math.floor(n / chars.length);
  } while (n > 0);
  return name;
}

function collectParamNames(paramList: string): string[] {
  const s = paramList.trim();
  if (!s || s === "...") return [];
  const parts = s.split(",");
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t || t === "...") continue;
    const name = t.replace(/\s*=\s*.*$/, "").trim();
    const id = name.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (id) out.push(id[1]);
  }
  return out;
}

function renameVariables(codeOnly: string): string {
  const MIN_LEN = 3; // avoid renaming i, v, x (breaks nested loops / common patterns)
  // Find local variable declarations (single and multi-assignment via localMultiPattern)
  const localFuncPattern = /\blocal\s+function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  const forPattern = /\bfor\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[=,]/g;
  const forInPattern = /\bfor\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+in\b/g;
  // Also capture multi-assignment: local a, b, c =
  const localMultiPattern = /\blocal\s+((?:[a-zA-Z_][a-zA-Z0-9_]*\s*,\s*)*[a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;
  const namedFuncParams = /\bfunction\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(([^)]*)\)/g;
  const anonFuncParams = /\bfunction\s*\(([^)]*)\)/g;

  const varMap = new Map<string, string>();
  let counter = 0;
  let match;

  const tryAdd = (varName: string) => {
    if (
      varName.length >= MIN_LEN &&
      !varMap.has(varName) &&
      !LUA_KEYWORDS.has(varName) &&
      !LUA_BUILTINS.has(varName)
    ) {
      varMap.set(varName, generateVarName(counter++));
    }
  };

  // Collect from multi-assignment locals
  localMultiPattern.lastIndex = 0;
  while ((match = localMultiPattern.exec(codeOnly)) !== null) {
    const vars = match[1].split(",").map((v) => v.trim());
    for (const varName of vars) tryAdd(varName);
  }

  forInPattern.lastIndex = 0;
  while ((match = forInPattern.exec(codeOnly)) !== null) {
    tryAdd(match[1]);
    tryAdd(match[2]);
  }

  for (const pattern of [localFuncPattern, forPattern]) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(codeOnly)) !== null) tryAdd(match[1]);
  }

  for (const pattern of [namedFuncParams, anonFuncParams]) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(codeOnly)) !== null) {
      for (const n of collectParamNames(match[1])) tryAdd(n);
    }
  }

  if (varMap.size === 0) return codeOnly;

  // Sort by length descending to avoid partial replacements
  const sortedVars = Array.from(varMap.entries()).sort((a, b) => b[0].length - a[0].length);

  let result = codeOnly;
  for (const [original, renamed] of sortedVars) {
    // Use word boundary matching - skip if preceded by . or : (table access)
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Also skip if followed by . or : to avoid renaming table names used in chaining
    const regex = new RegExp(`(?<![.:\\w])${escaped}(?![.:\\w])`, "g");
    result = result.replace(regex, renamed);
  }

  return result;
}

// ─── String Encryption ───────────────────────────────────────
// XOR-based string encryption using only safe byte values (1-255, no nulls)
// Uses Lua's string.byte and string.char for decryption

function encryptStrings(source: string): string {
  // Use a key that avoids producing null bytes for common ASCII (avoid keys that match common char codes)
  let key: number;
  do {
    key = Math.floor(Math.random() * 200) + 50;
  } while (key === 0);
  const decFnName = "_ds" + Math.floor(Math.random() * 9999);

  let hasStrings = false;
  let result = "";
  let i = 0;

  while (i < source.length) {
    // Skip long strings [[...]] — don't encrypt them
    if (source[i] === '[') {
      const longStr = tryLongString(source, i);
      if (longStr !== null) {
        result += longStr;
        i += longStr.length;
        continue;
      }
    }

    // Skip comments
    if (source[i] === '-' && source[i + 1] === '-') {
      const nl = source.indexOf('\n', i);
      const end = nl === -1 ? source.length : nl;
      result += source.slice(i, end);
      i = end;
      continue;
    }

    // Handle quoted strings
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      let j = i + 1;
      let content = "";
      while (j < source.length && source[j] !== quote) {
        if (source[j] === '\\') {
          // Handle escape sequences — pass through as-is for content extraction
          if (j + 1 < source.length) {
            const esc = source[j + 1];
            if (esc === 'n') { content += '\n'; j += 2; continue; }
            if (esc === 't') { content += '\t'; j += 2; continue; }
            if (esc === 'r') { content += '\r'; j += 2; continue; }
            if (esc === '\\') { content += '\\'; j += 2; continue; }
            if (esc === quote) { content += quote; j += 2; continue; }
            // Numeric escapes \ddd
            if (esc >= '0' && esc <= '9') {
              let numStr = esc;
              if (j + 2 < source.length && source[j + 2] >= '0' && source[j + 2] <= '9') {
                numStr += source[j + 2];
                if (j + 3 < source.length && source[j + 3] >= '0' && source[j + 3] <= '9') {
                  numStr += source[j + 3];
                }
              }
              content += String.fromCharCode(parseInt(numStr, 10));
              j += 1 + numStr.length;
              continue;
            }
            content += source[j + 1];
            j += 2;
            continue;
          }
        }
        content += source[j];
        j++;
      }
      if (j < source.length) j++; // closing quote

      if (content.length === 0) {
        result += source.slice(i, j);
      } else {
        hasStrings = true;
        // Encrypt each byte with XOR, using decimal escapes for safety
        const encrypted = xorEncryptSafe(content, key);
        result += `${decFnName}("${encrypted}",${key})`;
      }
      i = j;
      continue;
    }

    result += source[i];
    i++;
  }

  if (!hasStrings) return source;

  // Prepend the decryption function — table.create is a Luau optimization for pre-allocated arrays
  const decryptFn = `local function ${decFnName}(s,k) local n=#s local c=table.create(n) for i=1,n do c[i]=string.char(bit32.bxor(string.byte(s,i),k)) end return table.concat(c) end\n`;
  return decryptFn + result;
}

// XOR encrypt and produce a Lua-safe escaped string
// Avoids null bytes by using key+1 when XOR would produce 0
function xorEncryptSafe(text: string, key: number): string {
  let result = "";
  const k = key & 255;
  for (let i = 0; i < text.length; i++) {
    // Match Luau: string.byte / XOR on 8-bit values; \000 is valid in Lua strings
    const byte = (text.charCodeAt(i) ^ k) & 255;
    result += "\\" + byte.toString().padStart(3, "0");
  }
  return result;
}

// ─── Control Flow Flattening ─────────────────────────────────
// Inserts dead-code branches that never execute (opaque predicates)
// Only at top-level to avoid breaking block structure

function flattenControlFlow(codeOnly: string): string {
  const lines = codeOnly.split("\n");
  const result: string[] = [];
  const stateVar = "_cf" + Math.floor(Math.random() * 999);
  const stateVal = Math.floor(Math.random() * 1000) + 5000;
  result.push(`local ${stateVar} = ${stateVal}`);

  let depth = 0;

  const BLOCK_OPENERS = /^\s*(if\b|for\b|while\b|repeat\b|do\b)/;
  const BLOCK_CLOSERS = /^\s*(end\b|until\b)/;
  const INLINE_FUNC = /function\s*\(/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("--")) {
      result.push(line);
      continue;
    }

    // Track depth: count "end" and "until" closers
    if (BLOCK_CLOSERS.test(trimmed)) depth = Math.max(0, depth - 1);

    // Insert junk only at depth 0, between simple statements
    if (depth === 0 && !BLOCK_OPENERS.test(trimmed) && !BLOCK_CLOSERS.test(trimmed) && !trimmed.startsWith("else") && !trimmed.startsWith("elseif")) {
      if (Math.random() < 0.08) {
        const junkVal = Math.floor(Math.random() * 99999) + 10000;
        result.push(`if ${stateVar} == ${junkVal} then ${stateVar} = ${stateVar} + 1 end`);
      }
    }

    result.push(line);

    // Track openers — but only if the line doesn't also close on the same line (e.g. `if x then y end`)
    if (BLOCK_OPENERS.test(trimmed) && !trimmed.match(/\bend\b\s*$/)) depth++;
    // Also track `local function` and standalone `function`
    if (/^\s*local\s+function\b/.test(trimmed) || (/^\s*function\b/.test(trimmed) && !INLINE_FUNC.test(trimmed))) {
      if (!trimmed.match(/\bend\b\s*$/)) depth++;
    }
  }

  return result.join("\n");
}

// ─── Loadstring wrapper ────────────────────────────────────────
// Embeds UTF-8 bytes (Luau script on disk) so string.char never sees invalid values

function utf8Bytes(source: string): number[] {
  return Array.from(new TextEncoder().encode(source));
}

function wrapInVM(source: string): string {
  const bytes = utf8Bytes(source);

  const v1 = "_b" + Math.floor(Math.random() * 9999);
  const v2 = "_d" + Math.floor(Math.random() * 9999);
  const v3 = "_l" + Math.floor(Math.random() * 9999);

  // Chunk the literal across lines so the Luau parser is not fed a single multi-MB line
  const chunkSize = 200;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(bytes.slice(i, i + chunkSize).join(","));
  }

  if (chunks.length === 0) {
    return `local ${v3}=loadstring or load\n${v3}("")()`;
  }

  let tableLiteral = `local ${v1}={${chunks[0]}`;
  for (let i = 1; i < chunks.length; i++) {
    tableLiteral += `,\n${chunks[i]}`;
  }
  tableLiteral += `}\n`;

  // table.create + table.concat: linear time. Naive s=s..char() is O(n²) and fails on large scripts in Roblox.
  return (
    tableLiteral +
    `local ${v2}=function(t) local n=#t local c=table.create(n) for i=1,n do c[i]=string.char(t[i]) end return table.concat(c) end\n` +
    `local ${v3}=loadstring or load\n${v3}(${v2}(${v1}))()`
  );
}
