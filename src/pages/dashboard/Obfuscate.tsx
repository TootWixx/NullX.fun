import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useVault } from '@/hooks/useVault';
import { decryptContent } from '@/lib/encryption';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Shield, FileCode, Copy, Check, Link, Lock, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface SavedScript {
  id: string;
  original_name: string | null;
  created_at: string;
  project_id: string | null;
}

interface Project {
  id: string;
  name: string;
  script_content?: string | null;
  encryption_iv?: string | null;
  encryption_salt?: string | null;
}

export default function Obfuscate() {
  const { session, user, subscribed, isAdmin } = useAuth();
  const { encryptionConfig, sessionKey, unlocked } = useVault();
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [loadstringSnippet, setLoadstringSnippet] = useState('');
  const [loaderUrl, setLoaderUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [stringEncryption, setStringEncryption] = useState(true);
  const [controlFlowFlattening, setControlFlowFlattening] = useState(true);
  const [variableRenaming, setVariableRenaming] = useState(false);
  const [mode, setMode] = useState<'safe' | 'balanced' | 'aggressive'>('balanced');
  const [embedAuth, setEmbedAuth] = useState(false);
  const [embedCheckpoints, setEmbedCheckpoints] = useState(false);
  const [panelKey, setPanelKey] = useState<string | null>(null);
  const [stats, setStats] = useState<{ originalSize: number; obfuscatedSize: number; ratio: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(true);
  const isStarter = !subscribed && !isAdmin;
  const starterObfuscationsUsed = savedScripts.length;
  const starterObfuscationsRemaining = Math.max(0, 20 - starterObfuscationsUsed);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const appBaseUrl = (import.meta.env.VITE_MAIN_SITE_URL || window.location.origin).replace(/\/$/, '');

  const fetchData = async () => {
    if (!user) return;
    setLoadingScripts(true);
    const [scriptsRes, projRes, keyRes] = await Promise.all([
      supabase.from('obfuscated_scripts').select('id, original_name, created_at, project_id').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, script_content, encryption_iv, encryption_salt'),
      supabase.from('user_panel_keys').select('panel_key').eq('user_id', user.id).maybeSingle(),
    ]);
    if (scriptsRes.data) setSavedScripts(scriptsRes.data);
    if (projRes.data) setProjects(projRes.data);
    if (keyRes.data) setPanelKey(keyRes.data.panel_key);
    setLoadingScripts(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  useEffect(() => {
    const hydrateProjectScript = async () => {
      if (!selectedProject) return;

      const project = projects.find((p) => p.id === selectedProject);
      if (!project) return;

      if (!project.script_content || !project.encryption_iv) {
        setFileContent('');
        setFileName(`${project.name}.lua`);
        toast({ title: 'No source file', description: 'This project does not have a stored script yet.', variant: 'destructive' });
        return;
      }

      if (!unlocked || !sessionKey || !encryptionConfig) {
        setFileContent('');
        setFileName(`${project.name}.lua`);
        toast({ title: 'Vault locked', description: 'Unlock your vault first so the project source can be loaded for obfuscation.', variant: 'destructive' });
        return;
      }

      try {
        const decrypted = await decryptContent(
          project.encryption_iv,
          project.script_content,
          sessionKey,
          project.encryption_salt || encryptionConfig.salt,
        );
        setFileContent(decrypted);
        setFileName(`${project.name}.lua`);
        setLoadstringSnippet('');
        setLoaderUrl('');
        setStats(null);
      } catch {
        setFileContent('');
        toast({ title: 'Unable to load source', description: 'This project source could not be decrypted with the current vault key.', variant: 'destructive' });
      }
    };

    hydrateProjectScript();
  }, [selectedProject, projects, unlocked, sessionKey, encryptionConfig]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.lua') && !file.name.endsWith('.txt')) {
      toast({ title: 'Invalid file', description: 'Only .lua and .txt files are accepted', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFileContent(ev.target?.result as string || '');
      setFileName(file.name);
      setLoadstringSnippet('');
      setLoaderUrl('');
      setStats(null);
    };
    reader.readAsText(file);
  };

  const handleObfuscate = async () => {
    if (isStarter && starterObfuscationsRemaining <= 0) {
      toast({
        title: 'Starter obfuscation limit reached',
        description: 'Starter includes 20 obfuscations. Open a Discord ticket to upgrade.',
        variant: 'destructive',
      });
      return;
    }
    if (!fileContent.trim()) {
      toast({ title: 'No script', description: 'Select a project with source code or upload a .lua file first', variant: 'destructive' });
      return;
    }
    if (!selectedProject) {
      toast({ title: 'No project', description: 'Select a project to link this script to', variant: 'destructive' });
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    let accessToken = sessionData.session?.access_token || session?.access_token || '';

    // If token is missing/near expiry, force refresh before invoking edge functions.
    const expiresAt = sessionData.session?.expires_at ? sessionData.session.expires_at * 1000 : 0;
    if (!accessToken || (expiresAt && expiresAt < Date.now() + 30_000)) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      accessToken = refreshed.session?.access_token || '';
    }
    if (!accessToken) {
      toast({
        title: 'Sign in required',
        description: 'Please sign out and sign back in, then retry obfuscation.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    setLoadstringSnippet('');
    setLoaderUrl('');
    setStats(null);

    if (embedAuth && !panelKey) {
      toast({ title: 'No Panel Key', description: 'You need a UPANEL key to embed Auth UI. Upgrade or create one in Panel Key.', variant: 'destructive' });
      return;
    }

    let finalSource = fileContent;
    
    if (embedAuth && panelKey) {
      const authUI = `-- NullX.fun Auto-Embedded Auth UI
local _NovaWait = Instance.new("BindableEvent")
local Players = game:GetService("Players")
local player = Players.LocalPlayer
local HttpService = game:GetService("HttpService")

local NOVA_API = "${supabaseUrl}/functions/v1/validate"
local PANEL_KEY = "${panelKey}"
local PROJECT_ID = "${selectedProject}"
local _NovaSessionId = nil
local requestFn = request or http_request or (syn and syn.request) or (fluxus and fluxus.request)

local function postJson(url, body)
    if requestFn then
        return requestFn({ Url = url, Method = "POST", Headers = { ["Content-Type"] = "application/json" }, Body = HttpService:JSONEncode(body) })
    end
    return HttpService:RequestAsync({ Url = url, Method = "POST", Headers = { ["Content-Type"] = "application/json" }, Body = HttpService:JSONEncode(body) })
end

local gui = Instance.new("ScreenGui")
gui.Name = "NullXAuth"
gui.Parent = player:WaitForChild("PlayerGui")
gui.ResetOnSpawn = false

local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 340, 0, ${embedCheckpoints ? '280' : '220'})
frame.Position = UDim2.new(0.5, -170, 0.5, -${embedCheckpoints ? '140' : '110'})
frame.BackgroundColor3 = Color3.fromRGB(13, 8, 32)
frame.BorderSizePixel = 0
frame.Parent = gui

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 14)
corner.Parent = frame

local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(139, 92, 246)
stroke.Thickness = 1
stroke.Transparency = 0.7
stroke.Parent = frame

local gradient = Instance.new("UIGradient")
gradient.Color = ColorSequence.new(Color3.fromRGB(139, 92, 246), Color3.fromRGB(56, 189, 248))
gradient.Rotation = 135
gradient.Parent = stroke

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, 0, 0, 40)
title.Position = UDim2.new(0, 0, 0, 12)
title.BackgroundTransparency = 1
title.Text = "NullX.fun"
title.TextColor3 = Color3.fromRGB(139, 92, 246)
title.TextSize = 18
title.Font = Enum.Font.GothamBold
title.Parent = frame

local input = Instance.new("TextBox")
input.Size = UDim2.new(0.85, 0, 0, 38)
input.Position = UDim2.new(0.075, 0, 0, 58)
input.BackgroundColor3 = Color3.fromRGB(20, 16, 42)
input.TextColor3 = Color3.new(1, 1, 1)
input.Text = ""
input.PlaceholderText = "Enter License Key..."
input.PlaceholderColor3 = Color3.fromRGB(100, 90, 140)
input.TextSize = 14
input.Font = Enum.Font.GothamMedium
input.ClearTextOnFocus = false
input.Parent = frame

local inputCorner = Instance.new("UICorner")
inputCorner.CornerRadius = UDim.new(0, 8)
inputCorner.Parent = input

local inputStroke = Instance.new("UIStroke")
inputStroke.Color = Color3.fromRGB(139, 92, 246)
inputStroke.Thickness = 1
inputStroke.Transparency = 0.8
inputStroke.Parent = input

local submitBtn = Instance.new("TextButton")
submitBtn.Size = UDim2.new(0.85, 0, 0, 38)
submitBtn.Position = UDim2.new(0.075, 0, 0, 108)
submitBtn.BackgroundColor3 = Color3.fromRGB(124, 58, 237)
submitBtn.TextColor3 = Color3.new(1, 1, 1)
submitBtn.Text = "Authenticate"
submitBtn.TextSize = 14
submitBtn.Font = Enum.Font.GothamBold
submitBtn.Parent = frame

local btnCorner = Instance.new("UICorner")
btnCorner.CornerRadius = UDim.new(0, 8)
btnCorner.Parent = submitBtn

local btnGradient = Instance.new("UIGradient")
btnGradient.Color = ColorSequence.new(Color3.fromRGB(124, 58, 237), Color3.fromRGB(56, 189, 248))
btnGradient.Rotation = 90
btnGradient.Parent = submitBtn

local status = Instance.new("TextLabel")
status.Size = UDim2.new(1, 0, 0, 20)
status.Position = UDim2.new(0, 0, 0, 155)
status.BackgroundTransparency = 1
status.Text = ""
status.TextColor3 = Color3.fromRGB(150, 140, 180)
status.TextSize = 12
status.Font = Enum.Font.Gotham
status.Parent = frame
${embedCheckpoints ? `
-- Get Key button (redirects to checkpoints)
local getKeyBtn = Instance.new("TextButton")
getKeyBtn.Size = UDim2.new(0.85, 0, 0, 34)
getKeyBtn.Position = UDim2.new(0.075, 0, 0, 185)
getKeyBtn.BackgroundColor3 = Color3.fromRGB(20, 16, 42)
getKeyBtn.TextColor3 = Color3.fromRGB(56, 189, 248)
getKeyBtn.Text = "\u{1f517} Don't have a key? Get one here"
getKeyBtn.TextSize = 12
getKeyBtn.Font = Enum.Font.GothamMedium
getKeyBtn.Parent = frame

local gkCorner = Instance.new("UICorner")
gkCorner.CornerRadius = UDim.new(0, 8)
gkCorner.Parent = getKeyBtn

local gkStroke = Instance.new("UIStroke")
gkStroke.Color = Color3.fromRGB(56, 189, 248)
gkStroke.Thickness = 1
gkStroke.Transparency = 0.6
gkStroke.Parent = getKeyBtn

local separator = Instance.new("Frame")
separator.Size = UDim2.new(0.85, 0, 0, 1)
separator.Position = UDim2.new(0.075, 0, 0, 178)
separator.BackgroundColor3 = Color3.fromRGB(139, 92, 246)
separator.BackgroundTransparency = 0.7
separator.BorderSizePixel = 0
separator.Parent = frame

local cpLabel = Instance.new("TextLabel")
cpLabel.Size = UDim2.new(0.85, 0, 0, 16)
cpLabel.Position = UDim2.new(0.075, 0, 0, 225)
cpLabel.BackgroundTransparency = 1
cpLabel.Text = "Complete checkpoints to receive your key"
cpLabel.TextColor3 = Color3.fromRGB(100, 90, 140)
cpLabel.TextSize = 10
cpLabel.Font = Enum.Font.Gotham
cpLabel.Parent = frame

getKeyBtn.MouseButton1Click:Connect(function()
    local url = "${appBaseUrl}/get-key/${selectedProject}"
    if syn and syn.openURL then
        syn.openURL(url)
        status.Text = "\u{2705} Opening checkpoints..."
        status.TextColor3 = Color3.fromRGB(56, 189, 248)
    elseif setclipboard then
        setclipboard(url)
        status.Text = "\u{2705} Link copied! Open in your browser."
        status.TextColor3 = Color3.fromRGB(56, 189, 248)
    else
        status.Text = "Open this in your browser: " .. url
        status.TextColor3 = Color3.fromRGB(56, 189, 248)
    end
end)
` : ''}

local function getHWID() return game:GetService("RbxAnalyticsService"):GetClientId() end
local function getOS()
    local uis = game:GetService("UserInputService")
    if uis.TouchEnabled and not uis.KeyboardEnabled then return "Mobile"
    elseif uis.GamepadEnabled then return "Console"
    else return "Desktop" end
end

local function doAuth(authKey)
    local hwidNow = getHWID()
    local osNow = getOS()

    status.Text = "Authenticating..."
    status.TextColor3 = Color3.fromRGB(150, 150, 170)

    local success, response = pcall(function()
        return postJson(NOVA_API, { panel_key = PANEL_KEY, project_id = PROJECT_ID, key = authKey, hwid = hwidNow, os = osNow })
    end)

    if success and response and response.Body then
        local decoded, data = pcall(function() return HttpService:JSONDecode(response.Body) end)
        if decoded and data and response.StatusCode == 200 and data.success then
            _NovaSessionId = data.session_id

            -- Remember per-project only (prevents cross-project key auto-load)
            local cacheRoot = (getgenv and getgenv() or _G)
            cacheRoot.NullXAuthCache = cacheRoot.NullXAuthCache or {}
            cacheRoot.NullXAuthCache[PROJECT_ID] = { key = authKey, hwid = hwidNow }

            gui:Destroy()
            _NovaWait:Fire()
        else
            status.Text = "❌ " .. tostring(data and data.error or "Access Denied")
            status.TextColor3 = Color3.fromRGB(255, 100, 100)
        end
    else
        status.Text = "❌ Connection failed"
        status.TextColor3 = Color3.fromRGB(255, 100, 100)
    end
end

submitBtn.MouseButton1Click:Connect(function()
    local key = input.Text
    if key == "" then
        status.Text = "Please enter a key"
        status.TextColor3 = Color3.fromRGB(255, 100, 100)
        return
    end
    doAuth(key)
end)

-- Auto re-check remembered key (per PROJECT_ID + HWID)
local cacheRoot = (getgenv and getgenv() or _G)
cacheRoot.NullXAuthCache = cacheRoot.NullXAuthCache or {}
local hwidNow = getHWID()
local cached = cacheRoot.NullXAuthCache[PROJECT_ID]
if cached and cached.hwid == hwidNow and cached.key and cached.key ~= "" then
    input.Text = cached.key
    doAuth(cached.key)
end

_NovaWait.Event:Wait() -- Wait for authentication to complete

-- Start Session Heartbeat (Silently in background)
task.spawn(function()
    while true do
        if _NovaSessionId then
            local hSuccess, hResponse = pcall(function()
                return postJson("${supabaseUrl}/functions/v1/heartbeat", { session_id = _NovaSessionId })
            end)
            if hSuccess and hResponse and hResponse.Body then
                local hDecoded, hData = pcall(function() return HttpService:JSONDecode(hResponse.Body) end)
                if hDecoded and hData and hData.success then
                    if hData.action == "kill" then
                        player:Kick("NullX.fun: " .. (hData.message or "Your session has been terminated by the administrator."))
                        break
                    elseif hData.message then
                        game:GetService("StarterGui"):SetCore("SendNotification", {
                            Title = "NullX.fun",
                            Text = hData.message,
                            Duration = 10
                        })
                    end
                end
            end
        end
        task.wait(8)
    end
end)
`;
      const authUIRestyled = `--[=[
    NullX.fun Auth UI — Restyled to match NullX Loader v1.1
]=]--

local _NovaWait   = Instance.new("BindableEvent")
local Players     = game:GetService("Players")
local TweenSvc    = game:GetService("TweenService")
local UIS         = game:GetService("UserInputService")
local Lighting    = game:GetService("Lighting")
local HttpService = game:GetService("HttpService")

local player = Players.LocalPlayer

-- ============================================================
-- CONFIG
-- ============================================================
local SUPABASE_URL = "${supabaseUrl}"        -- your Supabase project URL
local PANEL_KEY    = "${panelKey}"          -- your NullX panel key
local PROJECT_ID   = "${selectedProject}"   -- your project / script ID
local PROJECT_URL  = "${appBaseUrl}"

local NOVA_API   = SUPABASE_URL .. "/functions/v1/validate"
local HEARTBEAT  = SUPABASE_URL .. "/functions/v1/heartbeat"

local _NovaSessionId = nil
local requestFn  = request or http_request or (syn and syn.request) or (fluxus and fluxus.request)

local function postJson(url, body)
    if requestFn then
        return requestFn({ Url = url, Method = "POST", Headers = { ["Content-Type"] = "application/json" }, Body = HttpService:JSONEncode(body) })
    end
    return HttpService:RequestAsync({ Url = url, Method = "POST", Headers = { ["Content-Type"] = "application/json" }, Body = HttpService:JSONEncode(body) })
end

-- ============================================================
-- THEME (matches NullX Loader v1.1)
-- ============================================================

local C = {
    Void        = Color3.fromRGB(5,   4,  12),
    Deep        = Color3.fromRGB(8,   6,  18),
    Base        = Color3.fromRGB(13,  10, 26),
    Raised      = Color3.fromRGB(20,  16, 38),
    Float       = Color3.fromRGB(28,  22, 50),
    Hover       = Color3.fromRGB(36,  28, 60),

    Sky         = Color3.fromRGB(110, 215, 255),
    SkyMid      = Color3.fromRGB(75,  180, 230),
    SkyDim      = Color3.fromRGB(50,  145, 200),
    SkyDeep     = Color3.fromRGB(8,   28,  54),
    SkyGhost    = Color3.fromRGB(6,   22,  44),

    Purple      = Color3.fromRGB(160, 95,  255),
    PurpleMid   = Color3.fromRGB(130, 65,  220),
    PurpleLight = Color3.fromRGB(195, 145, 255),
    PurpleGhost = Color3.fromRGB(22,  10, 50),

    Green       = Color3.fromRGB(60,  225, 145),
    GreenDeep   = Color3.fromRGB(6,   32,  20),
    Red         = Color3.fromRGB(255, 75,  75),
    RedDark     = Color3.fromRGB(90,  20,  20),
    Amber       = Color3.fromRGB(255, 170, 45),
    AmberDark   = Color3.fromRGB(60,  38,  8),

    T0 = Color3.fromRGB(230, 238, 255),
    T1 = Color3.fromRGB(162, 178, 215),
    T2 = Color3.fromRGB(95,  112, 155),
    T3 = Color3.fromRGB(50,  62,   98),
    T4 = Color3.fromRGB(28,  36,   62),

    B0 = Color3.fromRGB(55,  48,  92),
    B1 = Color3.fromRGB(36,  30,  65),
    B2 = Color3.fromRGB(22,  18,  42),
}

local EXP   = Enum.EasingStyle.Exponential
local QUINT = Enum.EasingStyle.Quint
local SINE  = Enum.EasingStyle.Sine
local BACK  = Enum.EasingStyle.Back
local OUT   = Enum.EasingDirection.Out
local IN    = Enum.EasingDirection.In
local INOUT = Enum.EasingDirection.InOut

-- ============================================================
-- UTILS
-- ============================================================

local function twPlay(obj, dur, props, sty, dir)
    local t = TweenSvc:Create(obj, TweenInfo.new(dur, sty or QUINT, dir or OUT), props)
    t:Play()
    return t
end

local function corner(p, r)
    local c = Instance.new("UICorner")
    c.CornerRadius = UDim.new(0, r or 8)
    c.Parent = p
    return c
end

local function stroke(p, col, th, tr)
    local s = Instance.new("UIStroke")
    s.Color           = col
    s.Thickness       = th or 1
    s.Transparency    = tr or 0
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    s.Parent          = p
    return s
end

local function grad(p, cs, rot)
    local g = Instance.new("UIGradient")
    g.Color    = cs
    g.Rotation = rot or 0
    g.Parent   = p
    return g
end

local function lbl(p, text, font, size, col, xalign, props)
    local l = Instance.new("TextLabel")
    l.BackgroundTransparency = 1
    l.Text           = text
    l.Font           = font   or Enum.Font.Gotham
    l.TextSize       = size   or 12
    l.TextColor3     = col    or C.T0
    l.TextXAlignment = xalign or Enum.TextXAlignment.Center
    for k, v in pairs(props or {}) do l[k] = v end
    l.Parent = p
    return l
end

local function frm(p, size, pos, bg, bgt)
    local f = Instance.new("Frame")
    f.Size                   = size
    if pos then f.Position   = pos end
    f.BackgroundColor3       = bg  or C.Base
    f.BackgroundTransparency = bgt or 0
    f.BorderSizePixel        = 0
    f.Parent                 = p
    return f
end

local function ambientBlob(parent, size, pos, col, alpha)
    local img = Instance.new("ImageLabel")
    img.Size                   = UDim2.fromOffset(size, size)
    img.Position               = pos
    img.BackgroundTransparency = 1
    img.Image                  = "rbxassetid://1316045217"
    img.ImageColor3            = col
    img.ImageTransparency      = alpha or 0.82
    img.ScaleType              = Enum.ScaleType.Slice
    img.SliceCenter            = Rect.new(10, 10, 118, 118)
    img.ZIndex                 = 0
    img.Parent                 = parent
    return img
end

-- ============================================================
-- FRAME HEIGHT (expands if checkpoints enabled)
-- ============================================================

local EMBED_CHECKPOINTS = ${embedCheckpoints ? 'true' : 'false'}
local FRAME_H = EMBED_CHECKPOINTS and 320 or 256

-- ============================================================
-- BLUR BACKDROP
-- ============================================================

pcall(function()
    if Lighting:FindFirstChild("NullXAuthBlur") then Lighting.NullXAuthBlur:Destroy() end
end)

local Blur = Instance.new("BlurEffect")
Blur.Name   = "NullXAuthBlur"
Blur.Size   = 0
Blur.Parent = Lighting
twPlay(Blur, 1.0, {Size = 14}, EXP)

-- ============================================================
-- SCREEN GUI
-- ============================================================

local GUI = Instance.new("ScreenGui")
GUI.Name           = "NullXAuth"
GUI.ResetOnSpawn   = false
GUI.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
GUI.Parent         = player:WaitForChild("PlayerGui")

-- Vignette overlay
local Vignette = Instance.new("ImageLabel")
Vignette.Size                   = UDim2.fromScale(1, 1)
Vignette.BackgroundTransparency = 1
Vignette.Image                  = "rbxassetid://1316045217"
Vignette.ImageColor3            = Color3.fromRGB(0, 0, 0)
Vignette.ImageTransparency      = 0.55
Vignette.ScaleType              = Enum.ScaleType.Stretch
Vignette.ZIndex                 = 0
Vignette.Parent                 = GUI

-- ============================================================
-- MAIN FRAME
-- ============================================================

local Main = Instance.new("Frame")
Main.Name                   = "AuthMain"
Main.AnchorPoint            = Vector2.new(0.5, 0.5)
Main.Position               = UDim2.fromScale(0.5, 0.5)
Main.Size                   = UDim2.fromOffset(360, FRAME_H)
Main.BackgroundColor3       = C.Deep
Main.BackgroundTransparency = 0
Main.BorderSizePixel        = 0
Main.ClipsDescendants       = true
Main.Parent                 = GUI

corner(Main, 16)

-- Inner bg gradient
local InnerGrad = grad(Main, ColorSequence.new({
    ColorSequenceKeypoint.new(0,    Color3.fromRGB(10,  8,  22)),
    ColorSequenceKeypoint.new(0.45, Color3.fromRGB(8,   6,  18)),
    ColorSequenceKeypoint.new(1,    Color3.fromRGB(11,  8,  24)),
}), 145)

-- Animated border stroke
local mainStroke = stroke(Main, C.Sky, 1.2, 0.55)

task.spawn(function()
    while Main.Parent do
        twPlay(mainStroke, 3.2, {Color = C.Sky,    Transparency = 0.08}, SINE, INOUT)
        task.wait(3.2)
        twPlay(mainStroke, 3.2, {Color = C.Purple, Transparency = 0.52}, SINE, INOUT)
        task.wait(3.2)
    end
end)

-- Ambient glow blobs
local Glow1 = ambientBlob(Main, 220, UDim2.fromOffset(-60, -60), C.Sky, 0.78)
local Glow2 = ambientBlob(Main, 180, UDim2.new(1, 30, 1, 30), C.Purple, 0.82)
Glow2.AnchorPoint = Vector2.new(1, 1)
Glow2.Position    = UDim2.new(1, 50, 1, 50)
ambientBlob(Main, 140, UDim2.new(0.5, -70, 0.5, -70), C.PurpleMid, 0.94)

task.spawn(function()
    local t = 0
    while Main.Parent do
        t = t + task.wait(0.05)
        local s1 = math.sin(t * 0.22) * 14
        local c1 = math.cos(t * 0.18) * 10
        Glow1.Position = UDim2.fromOffset(-60 + s1, -60 + c1)
        Glow2.Position = UDim2.new(1, 50 - s1 * 0.5, 1, 50 - c1 * 0.5)
    end
end)

-- ============================================================
-- HEADER
-- ============================================================

local HEADER_H = 52

local Header = frm(Main, UDim2.new(1, 0, 0, HEADER_H), UDim2.fromOffset(0, 0), C.Void, 0)
Header.ZIndex = 3

local HeaderBg = frm(Header, UDim2.fromScale(1, 1), nil, C.Void, 0)
HeaderBg.ZIndex = 2
grad(HeaderBg, ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(12, 9, 24)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(6,  4, 14)),
}), 90)

-- Brand text
lbl(Header, "nullx", Enum.Font.GothamBlack, 20, C.T0, Enum.TextXAlignment.Left, {
    Size     = UDim2.fromOffset(64, HEADER_H),
    Position = UDim2.new(0, 16, 0, 0),
    ZIndex   = 5,
})
lbl(Header, ".fun", Enum.Font.GothamBlack, 20, C.Sky, Enum.TextXAlignment.Left, {
    Size     = UDim2.fromOffset(58, HEADER_H),
    Position = UDim2.new(0, 76, 0, 0),
    ZIndex   = 5,
})

-- Version pill
local VerPill = Instance.new("Frame")
VerPill.Size                   = UDim2.fromOffset(0, 16)
VerPill.AutomaticSize          = Enum.AutomaticSize.X
VerPill.AnchorPoint            = Vector2.new(0, 0.5)
VerPill.Position               = UDim2.new(0, 140, 0.5, -1)
VerPill.BackgroundColor3       = C.SkyGhost
VerPill.BorderSizePixel        = 0
VerPill.ZIndex                 = 5
VerPill.Parent                 = Header
corner(VerPill, 4)
stroke(VerPill, C.Sky, 1, 0.6)
local vPad = Instance.new("UIPadding")
vPad.PaddingLeft  = UDim.new(0, 6)
vPad.PaddingRight = UDim.new(0, 6)
vPad.Parent       = VerPill
lbl(VerPill, "auth", Enum.Font.Code, 9, C.SkyMid, Enum.TextXAlignment.Center, {
    Size          = UDim2.fromOffset(0, 16),
    AutomaticSize = Enum.AutomaticSize.X,
    ZIndex        = 6,
})

-- ============================================================
-- BODY
-- ============================================================

local Body = frm(Main, UDim2.new(1, 0, 1, -HEADER_H), UDim2.new(0, 0, 0, HEADER_H), C.Deep, 1)
local function bodyPad(p, top)
    local u = Instance.new("UIPadding")
    u.PaddingLeft   = UDim.new(0, 20)
    u.PaddingRight  = UDim.new(0, 20)
    u.PaddingTop    = UDim.new(0, top or 16)
    u.PaddingBottom = UDim.new(0, 16)
    u.Parent        = p
end

bodyPad(Body, 18)

local BodyLayout = Instance.new("UIListLayout")
BodyLayout.FillDirection       = Enum.FillDirection.Vertical
BodyLayout.HorizontalAlignment = Enum.HorizontalAlignment.Left
BodyLayout.VerticalAlignment   = Enum.VerticalAlignment.Top
BodyLayout.Padding             = UDim.new(0, 10)
BodyLayout.SortOrder           = Enum.SortOrder.LayoutOrder
BodyLayout.Parent              = Body

lbl(Body, "Enter your license key to continue", Enum.Font.Gotham, 11, C.T3, Enum.TextXAlignment.Left, {
    Size        = UDim2.new(1, 0, 0, 14),
    LayoutOrder = 1,
})

-- ============================================================
-- INPUT + STATUS + BUTTONS
-- ============================================================

local InputWrap = Instance.new("Frame")
InputWrap.Size                   = UDim2.new(1, 0, 0, 42)
InputWrap.BackgroundColor3       = C.Raised
InputWrap.BackgroundTransparency = 0
InputWrap.BorderSizePixel        = 0
InputWrap.LayoutOrder            = 2
InputWrap.Parent                 = Body
corner(InputWrap, 10)
local inputStroke = stroke(InputWrap, C.B1, 1, 0.45)

local InputBox = Instance.new("TextBox")
InputBox.Size                   = UDim2.fromScale(1, 1)
InputBox.BackgroundTransparency = 1
InputBox.Text                   = ""
InputBox.PlaceholderText        = "License Key..."
InputBox.PlaceholderColor3      = C.T3
InputBox.TextColor3             = C.T0
InputBox.TextSize               = 13
InputBox.Font                   = Enum.Font.GothamMedium
InputBox.ClearTextOnFocus       = false
InputBox.ZIndex                 = 2
InputBox.Parent                 = InputWrap

local iPad = Instance.new("UIPadding")
iPad.PaddingLeft   = UDim.new(0, 14)
iPad.PaddingRight  = UDim.new(0, 14)
iPad.Parent        = InputBox

-- Input focus highlight
InputBox.Focused:Connect(function()
    twPlay(inputStroke, 0.18, {Color = C.Sky, Transparency = 0.15})
    twPlay(InputWrap,   0.18, {BackgroundColor3 = C.Float})
end)
InputBox.FocusLost:Connect(function()
    twPlay(inputStroke, 0.18, {Color = C.B1, Transparency = 0.45})
    twPlay(InputWrap,   0.18, {BackgroundColor3 = C.Raised})
end)

local StatusLbl = lbl(Body, "", Enum.Font.Gotham, 11, C.T3, Enum.TextXAlignment.Left, {
    Size        = UDim2.new(1, 0, 0, 14),
    LayoutOrder = 3,
})

local AuthBtn = Instance.new("TextButton")
AuthBtn.Size                   = UDim2.new(1, 0, 0, 40)
AuthBtn.BackgroundColor3       = C.SkyDeep
AuthBtn.BackgroundTransparency = 0
AuthBtn.Text                   = "Authenticate"
AuthBtn.Font                   = Enum.Font.GothamBold
AuthBtn.TextSize               = 13
AuthBtn.TextColor3             = C.Sky
AuthBtn.BorderSizePixel        = 0
AuthBtn.AutoButtonColor        = false
AuthBtn.LayoutOrder            = 4
AuthBtn.Parent                 = Body
corner(AuthBtn, 10)
local authStroke = stroke(AuthBtn, C.Sky, 1, 0.3)

AuthBtn.MouseEnter:Connect(function()
    twPlay(AuthBtn,    0.15, {BackgroundColor3 = C.Sky,     TextColor3 = C.Void})
    twPlay(authStroke, 0.15, {Transparency = 1})
end)
AuthBtn.MouseLeave:Connect(function()
    twPlay(AuthBtn,    0.15, {BackgroundColor3 = C.SkyDeep, TextColor3 = C.Sky})
    twPlay(authStroke, 0.15, {Transparency = 0.3})
end)
AuthBtn.MouseButton1Down:Connect(function()
    twPlay(AuthBtn, 0.08, {BackgroundColor3 = C.SkyMid})
end)

-- ============================================================
-- CHECKPOINTS SECTION (optional)
-- ============================================================

if EMBED_CHECKPOINTS then
    local Divider = frm(Body, UDim2.new(1, 0, 0, 1), nil, C.B1, 0.3)
    Divider.LayoutOrder = 5

    local GetKeyBtn = Instance.new("TextButton")
    GetKeyBtn.Size                   = UDim2.new(1, 0, 0, 38)
    GetKeyBtn.BackgroundColor3       = C.Float
    GetKeyBtn.BackgroundTransparency = 0
    GetKeyBtn.Text                   = "🔗 Don't have a key? Get one here"
    GetKeyBtn.Font                   = Enum.Font.GothamMedium
    GetKeyBtn.TextSize               = 12
    GetKeyBtn.TextColor3             = C.SkyMid
    GetKeyBtn.BorderSizePixel        = 0
    GetKeyBtn.AutoButtonColor        = false
    GetKeyBtn.LayoutOrder            = 6
    GetKeyBtn.Parent                 = Body
    corner(GetKeyBtn, 9)
    local gkStroke = stroke(GetKeyBtn, C.SkyDim, 1, 0.55)

    GetKeyBtn.MouseEnter:Connect(function()
        twPlay(GetKeyBtn, 0.15, {BackgroundColor3 = C.Hover, TextColor3 = C.Sky})
        twPlay(gkStroke,  0.15, {Transparency = 0.15})
    end)
    GetKeyBtn.MouseLeave:Connect(function()
        twPlay(GetKeyBtn, 0.15, {BackgroundColor3 = C.Float, TextColor3 = C.SkyMid})
        twPlay(gkStroke,  0.15, {Transparency = 0.55})
    end)
    GetKeyBtn.MouseButton1Click:Connect(function()
        local url = PROJECT_URL .. "/get-key/" .. PROJECT_ID
        if syn and syn.openURL then
            syn.openURL(url)
            StatusLbl.Text = "✅ Opening checkpoints..."
            StatusLbl.TextColor3 = C.SkyMid
        elseif setclipboard then
            setclipboard(url)
            StatusLbl.Text = "✅ Link copied! Open in your browser."
            StatusLbl.TextColor3 = C.SkyMid
        else
            StatusLbl.Text = "Open in browser: " .. url
            StatusLbl.TextColor3 = C.SkyMid
        end
    end)

    lbl(Body, "Complete checkpoints to receive your key", Enum.Font.Gotham, 10, C.T4, Enum.TextXAlignment.Left, {
        Size        = UDim2.new(1, 0, 0, 13),
        LayoutOrder = 7,
    })
end

-- ============================================================
-- AUTH LOGIC (validate + remember per PROJECT_ID+HWID)
-- ============================================================

local function getHWID() return game:GetService("RbxAnalyticsService"):GetClientId() end
local function getOS()
    local uis = game:GetService("UserInputService")
    if uis.TouchEnabled and not uis.KeyboardEnabled then return "Mobile"
    elseif uis.GamepadEnabled then return "Console"
    else return "Desktop" end
end

local function setStatus(text, col)
    StatusLbl.Text = text
    StatusLbl.TextColor3 = col or C.T2
end

local function closeUI()
    twPlay(Blur, 0.35, {Size = 0})
    twPlay(Main, 0.38, {
        BackgroundTransparency = 1,
        Size = UDim2.fromOffset(360, 0),
    }, BACK, IN)
    task.delay(0.42, function()
        pcall(function() Lighting.NullXAuthBlur:Destroy() end)
        GUI:Destroy()
        _NovaWait:Fire()
    end)
end

local function doAuth(authKey)
    local hwidNow = getHWID()
    local osNow = getOS()

    setStatus("Authenticating...", C.T2)
    AuthBtn.Text = "Verifying..."

    local success, response = pcall(function()
        return postJson(NOVA_API, {
            panel_key  = PANEL_KEY,
            project_id = PROJECT_ID,
            key         = authKey,
            hwid        = hwidNow,
            os          = osNow,
        })
    end)

    if success and response and response.Body then
        local decoded, data = pcall(function() return HttpService:JSONDecode(response.Body) end)
        if decoded and data and response.StatusCode == 200 and data.success then
            _NovaSessionId = data.session_id

            -- Remember per-project only (prevents cross-project key auto-load)
            local cacheRoot = (getgenv and getgenv() or _G)
            cacheRoot.NullXAuthCache = cacheRoot.NullXAuthCache or {}
            cacheRoot.NullXAuthCache[PROJECT_ID] = { key = authKey, hwid = hwidNow }

            setStatus("✅ Access granted.", C.Green)
            twPlay(AuthBtn, 0.2, {BackgroundColor3 = C.GreenDeep, TextColor3 = C.Green})
            task.delay(0.55, closeUI)
        else
            setStatus("❌ " .. tostring(data and data.error or "Access Denied"), C.Red)
            AuthBtn.Text = "Authenticate"
            twPlay(AuthBtn, 0.15, {BackgroundColor3 = C.RedDark, TextColor3 = C.Red})
            task.delay(0.6, function()
                twPlay(AuthBtn, 0.25, {BackgroundColor3 = C.SkyDeep, TextColor3 = C.Sky})
            end)
        end
    else
        setStatus("❌ Connection failed", C.Red)
        AuthBtn.Text = "Authenticate"
    end
end

AuthBtn.MouseButton1Click:Connect(function()
    local key = InputBox.Text
    if key == "" then
        setStatus("Please enter a key.", C.Amber)
        twPlay(InputWrap, 0.12, {BackgroundColor3 = C.AmberDark or Color3.fromRGB(60, 38, 8)})
        twPlay(inputStroke, 0.12, {Color = C.Amber, Transparency = 0.2})
        task.delay(0.7, function()
            twPlay(InputWrap, 0.2, {BackgroundColor3 = C.Raised})
            twPlay(inputStroke, 0.2, {Color = C.B1, Transparency = 0.45})
        end)
        return
    end
    doAuth(key)
end)

-- Auto re-check remembered key (per PROJECT_ID + HWID)
local cacheRoot = (getgenv and getgenv() or _G)
cacheRoot.NullXAuthCache = cacheRoot.NullXAuthCache or {}
local hwidNow = getHWID()
local cached  = cacheRoot.NullXAuthCache[PROJECT_ID]
if cached and cached.hwid == hwidNow and cached.key and cached.key ~= "" then
    InputBox.Text = cached.key
    doAuth(cached.key)
end

-- ============================================================
-- ENTRANCE ANIMATION
-- ============================================================

Main.Size                   = UDim2.fromOffset(360, 0)
Main.BackgroundTransparency = 1
mainStroke.Transparency     = 1
Vignette.ImageTransparency  = 1

task.wait(0.06)
twPlay(Vignette, 0.55, {ImageTransparency = 0.55}, QUINT)
twPlay(Main, 0.50, {
    Size = UDim2.fromOffset(360, FRAME_H),
    BackgroundTransparency = 0,
}, EXP)
task.delay(0.12, function()
    twPlay(mainStroke, 0.45, {Transparency = 0.55}, EXP)
end)

-- ============================================================
-- WAIT FOR AUTH
-- ============================================================

_NovaWait.Event:Wait()

-- ============================================================
-- MESSAGING SYSTEM (runs after auth)
-- ============================================================

local MessageHistory = {}
local ChatUI = nil
local FloatingButton = nil
local NotificationQueue = {}

-- Create ScreenGui for messaging
local MsgGui = Instance.new("ScreenGui")
MsgGui.Name = "NullX_Messaging"
MsgGui.ResetOnSpawn = false
MsgGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
MsgGui.Parent = game:GetService("CoreGui")

-- Create Notification Card
local function ShowNotification(data)
    local notifFrame = Instance.new("Frame")
    notifFrame.Size = UDim2.new(0, 320, 0, 100)
    notifFrame.Position = UDim2.new(1, 340, 1, -120)
    notifFrame.BackgroundColor3 = Color3.fromRGB(25, 25, 35)
    notifFrame.BorderSizePixel = 0
    notifFrame.Parent = MsgGui
    
    local corner = Instance.new("UICorner", notifFrame)
    corner.CornerRadius = UDim.new(0, 12)
    
    local stroke = Instance.new("UIStroke", notifFrame)
    stroke.Color = Color3.fromRGB(147, 112, 219)
    stroke.Thickness = 2
    
    -- Title
    local title = Instance.new("TextLabel", notifFrame)
    title.Size = UDim2.new(1, -20, 0, 24)
    title.Position = UDim2.new(0, 10, 0, 8)
    title.BackgroundTransparency = 1
    title.Text = data.title or "📨 Message from Admin"
    title.TextColor3 = Color3.fromRGB(147, 112, 219)
    title.Font = Enum.Font.GothamBold
    title.TextSize = 14
    title.TextXAlignment = Enum.TextXAlignment.Left
    
    -- Message preview
    local preview = Instance.new("TextLabel", notifFrame)
    preview.Size = UDim2.new(1, -20, 0, 30)
    preview.Position = UDim2.new(0, 10, 0, 32)
    preview.BackgroundTransparency = 1
    preview.Text = data.message:sub(1, 60) .. (data.message:len() > 60 and "..." or "")
    preview.TextColor3 = Color3.fromRGB(255, 255, 255)
    preview.Font = Enum.Font.Gotham
    preview.TextSize = 12
    preview.TextWrapped = true
    preview.TextXAlignment = Enum.TextXAlignment.Left
    
    -- Click to Respond button
    local respondBtn = Instance.new("TextButton", notifFrame)
    respondBtn.Size = UDim2.new(1, -20, 0, 26)
    respondBtn.Position = UDim2.new(0, 10, 1, -36)
    respondBtn.BackgroundColor3 = Color3.fromRGB(147, 112, 219)
    respondBtn.Text = "💬 Click Me to Respond and Start a Conversation"
    respondBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    respondBtn.Font = Enum.Font.GothamBold
    respondBtn.TextSize = 11
    
    local btnCorner = Instance.new("UICorner", respondBtn)
    btnCorner.CornerRadius = UDim.new(0, 6)
    
    respondBtn.MouseButton1Click:Connect(function()
        notifFrame:Destroy()
        OpenChatWindow()
    end)
    
    -- Slide in animation
    notifFrame:TweenPosition(UDim2.new(1, -340, 1, -120), Enum.EasingDirection.Out, Enum.EasingStyle.Quart, 0.5)
    
    -- Auto dismiss after 15 seconds
    task.delay(15, function()
        if notifFrame and notifFrame.Parent then
            notifFrame:TweenPosition(UDim2.new(1, 340, 1, -120), Enum.EasingDirection.In, Enum.EasingStyle.Quart, 0.5)
            task.wait(0.5)
            if notifFrame then notifFrame:Destroy() end
        end
    end)
end

-- Track if user has sent first message to open chat
local ChatStarted = false

-- Create Chat Window
local function OpenChatWindow(autoShowMessages)
    if ChatUI and ChatUI.Parent then
        ChatUI.Visible = true
        return
    end
    
    -- Main chat frame
    ChatUI = Instance.new("Frame")
    ChatUI.Name = "NullX_ChatWindow"
    ChatUI.Size = UDim2.new(0, 350, 0, 450)
    ChatUI.Position = UDim2.new(1, -370, 1, -470)
    ChatUI.BackgroundColor3 = Color3.fromRGB(20, 20, 30)
    ChatUI.BorderSizePixel = 0
    ChatUI.Parent = MsgGui
    
    local corner = Instance.new("UICorner", ChatUI)
    corner.CornerRadius = UDim.new(0, 16)
    
    local stroke = Instance.new("UIStroke", ChatUI)
    stroke.Color = Color3.fromRGB(147, 112, 219)
    stroke.Thickness = 2
    
    -- Header (draggable area)
    local header = Instance.new("Frame", ChatUI)
    header.Name = "Header"
    header.Size = UDim2.new(1, 0, 0, 40)
    header.BackgroundColor3 = Color3.fromRGB(30, 30, 45)
    header.BorderSizePixel = 0
    
    local headerCorner = Instance.new("UICorner", header)
    headerCorner.CornerRadius = UDim.new(0, 16)
    
    -- Fix corner for header bottom
    local headerFix = Instance.new("Frame", header)
    headerFix.Size = UDim2.new(1, 0, 0.5, 0)
    headerFix.Position = UDim2.new(0, 0, 0.5, 0)
    headerFix.BackgroundColor3 = Color3.fromRGB(30, 30, 45)
    headerFix.BorderSizePixel = 0
    
    -- Title
    local title = Instance.new("TextLabel", header)
    title.Size = UDim2.new(1, -80, 1, 0)
    title.Position = UDim2.new(0, 15, 0, 0)
    title.BackgroundTransparency = 1
    title.Text = "💬 nullx.fun Admin Chat"
    title.TextColor3 = Color3.fromRGB(147, 112, 219)
    title.Font = Enum.Font.GothamBold
    title.TextSize = 14
    title.TextXAlignment = Enum.TextXAlignment.Left
    
    -- Minimize button
    local minBtn = Instance.new("TextButton", header)
    minBtn.Size = UDim2.new(0, 30, 0, 30)
    minBtn.Position = UDim2.new(1, -65, 0, 5)
    minBtn.BackgroundColor3 = Color3.fromRGB(50, 50, 70)
    minBtn.Text = "−"
    minBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    minBtn.Font = Enum.Font.GothamBold
    minBtn.TextSize = 18
    local minCorner = Instance.new("UICorner", minBtn)
    minCorner.CornerRadius = UDim.new(0, 6)
    
    -- Close button
    local closeBtn = Instance.new("TextButton", header)
    closeBtn.Size = UDim2.new(0, 30, 0, 30)
    closeBtn.Position = UDim2.new(1, -35, 0, 5)
    closeBtn.BackgroundColor3 = Color3.fromRGB(200, 50, 50)
    closeBtn.Text = "×"
    closeBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    closeBtn.Font = Enum.Font.GothamBold
    closeBtn.TextSize = 18
    local closeCorner = Instance.new("UICorner", closeBtn)
    closeCorner.CornerRadius = UDim.new(0, 6)
    
    closeBtn.MouseButton1Click:Connect(function()
        ChatUI:Destroy()
        ChatUI = nil
        ShowFloatingButton()
    end)
    
    -- Minimize just hides chat (does NOT destroy), close button destroys
    local isMinimized = false
    minBtn.MouseButton1Click:Connect(function()
        isMinimized = true
        ChatUI.Visible = false
        ShowFloatingButton()
    end)
    
    -- Messages scrolling frame
    local scroll = Instance.new("ScrollingFrame", ChatUI)
    scroll.Name = "MessageList"
    scroll.Size = UDim2.new(1, -20, 1, -100)
    scroll.Position = UDim2.new(0, 10, 0, 50)
    scroll.BackgroundTransparency = 1
    scroll.BorderSizePixel = 0
    scroll.ScrollBarThickness = 4
    scroll.ScrollBarImageColor3 = Color3.fromRGB(147, 112, 219)
    scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
    scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
    
    local layout = Instance.new("UIListLayout", scroll)
    layout.Padding = UDim.new(0, 8)
    layout.SortOrder = Enum.SortOrder.LayoutOrder
    
    -- Input area
    local inputBg = Instance.new("Frame", ChatUI)
    inputBg.Size = UDim2.new(1, -20, 0, 40)
    inputBg.Position = UDim2.new(0, 10, 1, -50)
    inputBg.BackgroundColor3 = Color3.fromRGB(35, 35, 50)
    inputBg.BorderSizePixel = 0
    local inputCorner = Instance.new("UICorner", inputBg)
    inputCorner.CornerRadius = UDim.new(0, 20)
    
    local inputBox = Instance.new("TextBox", inputBg)
    inputBox.Name = "MessageInput"
    inputBox.Size = UDim2.new(1, -70, 1, -10)
    inputBox.Position = UDim2.new(0, 15, 0, 5)
    inputBox.BackgroundTransparency = 1
    inputBox.Text = ""
    -- If chat not started yet, prompt user to send first message
    inputBox.PlaceholderText = ChatStarted and "Type a message..." or "Send a message to open chat..."
    inputBox.TextColor3 = Color3.fromRGB(255, 255, 255)
    inputBox.PlaceholderColor3 = Color3.fromRGB(120, 120, 140)
    inputBox.Font = Enum.Font.Gotham
    inputBox.TextSize = 14
    inputBox.ClearTextOnFocus = false
    
    local sendBtn = Instance.new("TextButton", inputBg)
    sendBtn.Size = UDim2.new(0, 50, 0, 30)
    sendBtn.Position = UDim2.new(1, -60, 0.5, -15)
    sendBtn.BackgroundColor3 = Color3.fromRGB(147, 112, 219)
    sendBtn.Text = "Send"
    sendBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
    sendBtn.Font = Enum.Font.GothamBold
    sendBtn.TextSize = 12
    local sendCorner = Instance.new("UICorner", sendBtn)
    sendCorner.CornerRadius = UDim.new(0, 15)
    
    -- Function to add message bubble
    local function AddMessageBubble(text, isUser, messageId)
        local bubble = Instance.new("Frame")
        bubble.Size = UDim2.new(1, 0, 0, 0)
        bubble.AutomaticSize = Enum.AutomaticSize.Y
        bubble.BackgroundTransparency = 1
        bubble.Parent = scroll
        
        local inner = Instance.new("Frame", bubble)
        inner.Size = UDim2.new(0.75, 0, 0, 0)
        inner.Position = isUser and UDim2.new(1, -10, 0, 0) or UDim2.new(0, 10, 0, 0)
        inner.AnchorPoint = isUser and Vector2.new(1, 0) or Vector2.new(0, 0)
        inner.AutomaticSize = Enum.AutomaticSize.Y
        inner.BackgroundColor3 = isUser and Color3.fromRGB(59, 130, 246) or Color3.fromRGB(147, 112, 219)
        inner.BorderSizePixel = 0
        
        local innerCorner = Instance.new("UICorner", inner)
        innerCorner.CornerRadius = UDim.new(0, 12)
        
        local padding = Instance.new("UIPadding", inner)
        padding.PaddingLeft = UDim.new(0, 12)
        padding.PaddingRight = UDim.new(0, 12)
        padding.PaddingTop = UDim.new(0, 8)
        padding.PaddingBottom = UDim.new(0, 8)
        
        local msgLabel = Instance.new("TextLabel", inner)
        msgLabel.Size = UDim2.new(1, 0, 0, 0)
        msgLabel.AutomaticSize = Enum.AutomaticSize.Y
        msgLabel.BackgroundTransparency = 1
        msgLabel.Text = text
        msgLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
        msgLabel.Font = Enum.Font.Gotham
        msgLabel.TextSize = 13
        msgLabel.TextWrapped = true
        msgLabel.TextXAlignment = Enum.TextXAlignment.Left
        
        task.wait()
        scroll.CanvasPosition = Vector2.new(0, scroll.AbsoluteCanvasSize.Y)
    end
    
    -- Send message function
    local function SendMessage()
        local text = inputBox.Text:gsub("^%s*", ""):gsub("%s*$", "")
        if text == "" then return end
        
        -- Mark chat as started after first message
        if not ChatStarted then
            ChatStarted = true
            inputBox.PlaceholderText = "Type a message..."
        end
        
        -- Find the message we're replying to (most recent admin message)
        local replyToId = nil
        for i = #MessageHistory, 1, -1 do
            if MessageHistory[i].sender == "admin" and MessageHistory[i].can_reply then
                replyToId = MessageHistory[i].id
                break
            end
        end
        
        -- Add to UI
        AddMessageBubble(text, true)
        
        -- Store locally
        table.insert(MessageHistory, {
            sender = "user",
            message = text,
            timestamp = os.time()
        })
        
        -- Send to server via heartbeat (always send user messages so admin can see them)
        pcall(function()
            postJson(HEARTBEAT, {
                session_id = _NovaSessionId,
                reply_message = text,
                reply_to_id = replyToId  -- Can be nil for first message
            })
        end)
        
        inputBox.Text = ""
    end
    
    sendBtn.MouseButton1Click:Connect(SendMessage)
    inputBox.FocusLost:Connect(function(enterPressed)
        if enterPressed then SendMessage() end
    end)
    
    -- Populate existing messages
    for _, msg in ipairs(MessageHistory) do
        AddMessageBubble(msg.message, msg.sender == "user", msg.id)
    end
    
    -- Make draggable
    local dragging = false
    local dragStart = nil
    local startPos = nil
    
    header.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true
            dragStart = input.Position
            startPos = ChatUI.Position
        end
    end)
    
    header.InputEnded:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = false
        end
    end)
    
    game:GetService("UserInputService").InputChanged:Connect(function(input)
        if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            local delta = input.Position - dragStart
            ChatUI.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
        end
    end)
    
    -- Hide floating button when chat is open
    if FloatingButton then
        FloatingButton.Visible = false
    end
end

-- Create Floating Toggle Button
local function ShowFloatingButton()
    if FloatingButton and FloatingButton.Parent then
        FloatingButton.Visible = true
        return
    end
    
    FloatingButton = Instance.new("TextButton")
    FloatingButton.Name = "NullX_ChatToggle"
    FloatingButton.Size = UDim2.new(0, 50, 0, 50)
    FloatingButton.Position = UDim2.new(1, -70, 1, -70)
    FloatingButton.BackgroundColor3 = Color3.fromRGB(147, 112, 219)
    FloatingButton.Text = "💬"
    FloatingButton.TextColor3 = Color3.fromRGB(255, 255, 255)
    FloatingButton.Font = Enum.Font.GothamBold
    FloatingButton.TextSize = 20
    FloatingButton.Parent = MsgGui
    FloatingButton.ZIndex = 10
    
    local corner = Instance.new("UICorner", FloatingButton)
    corner.CornerRadius = UDim.new(1, 0)
    
    local stroke = Instance.new("UIStroke", FloatingButton)
    stroke.Color = Color3.fromRGB(255, 255, 255)
    stroke.Thickness = 2
    
    local shadow = Instance.new("ImageLabel", FloatingButton)
    shadow.Name = "Shadow"
    shadow.Size = UDim2.new(1, 8, 1, 8)
    shadow.Position = UDim2.new(0, -4, 0, -4)
    shadow.BackgroundTransparency = 1
    shadow.Image = "rbxassetid://13160452137"
    shadow.ImageColor3 = Color3.fromRGB(0, 0, 0)
    shadow.ImageTransparency = 0.6
    shadow.ZIndex = 9
    
    FloatingButton.MouseButton1Click:Connect(function()
        FloatingButton.Visible = false
        OpenChatWindow()
    end)
    
    -- Make draggable
    local dragging = false
    local dragStart = nil
    local startPos = nil
    
    FloatingButton.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true
            dragStart = input.Position
            startPos = FloatingButton.Position
        end
    end)
    
    FloatingButton.InputEnded:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = false
        end
    end)
    
    game:GetService("UserInputService").InputChanged:Connect(function(input)
        if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            local delta = input.Position - dragStart
            FloatingButton.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
        end
    end)
    
    -- Pulse animation
    task.spawn(function()
        while FloatingButton and FloatingButton.Parent do
            for i = 1, 10 do
                if not FloatingButton or not FloatingButton.Parent then break end
                FloatingButton.Size = UDim2.new(0, 50 + i, 0, 50 + i)
                FloatingButton.Position = UDim2.new(1, -70 - i/2, 1, -70 - i/2)
                task.wait(0.05)
            end
            for i = 10, 1, -1 do
                if not FloatingButton or not FloatingButton.Parent then break end
                FloatingButton.Size = UDim2.new(0, 50 + i, 0, 50 + i)
                FloatingButton.Position = UDim2.new(1, -70 - i/2, 1, -70 - i/2)
                task.wait(0.05)
            end
            task.wait(2)
        end
    end)
end

-- ============================================================
-- SESSION HEARTBEAT (runs after auth)
-- ============================================================

task.spawn(function()
    while true do
        if _NovaSessionId then
            local hSuccess, hResponse = pcall(function()
                return postJson(HEARTBEAT, { session_id = _NovaSessionId })
            end)
            if hSuccess and hResponse and hResponse.Body then
                local hDecoded, hData = pcall(function() return HttpService:JSONDecode(hResponse.Body) end)
                if hDecoded and hData and hData.success then
                    -- Handle kick
                    if hData.action == "kill" then
                        player:Kick("NullX.fun: " .. (hData.notification and hData.notification.message or "Your session has been terminated."))
                        break
                    end
                    
                    -- Handle multiple notifications
                    if hData.notifications and #hData.notifications > 0 then
                        for _, notif in ipairs(hData.notifications) do
                            table.insert(MessageHistory, {
                                id = notif.id,
                                sender = "admin",
                                message = notif.message,
                                timestamp = notif.timestamp,
                                can_reply = notif.can_reply
                            })
                            ShowNotification(notif)
                            ShowFloatingButton()
                        end
                    end
                    
                    -- Handle single notification (legacy/compat)
                    if hData.notification and not hData.notifications then
                        table.insert(MessageHistory, {
                            sender = "admin",
                            message = hData.notification.message,
                            timestamp = os.time(),
                            can_reply = hData.notification.can_reply
                        })
                        ShowNotification(hData.notification)
                        ShowFloatingButton()
                    end
                    
                    -- Handle user replies/messages sent back
                    if hData.user_messages and #hData.user_messages > 0 then
                        for _, msg in ipairs(hData.user_messages) do
                            table.insert(MessageHistory, {
                                id = msg.id,
                                sender = "user",
                                message = msg.message,
                                timestamp = msg.timestamp,
                                can_reply = true
                            })
                            -- Show notification for user message
                            ShowNotification({
                                id = msg.id,
                                message = "Reply: " .. msg.message,
                                notification_type = "message",
                                can_reply = true
                            })
                            ShowFloatingButton()
                        end
                    end
                end
            end
        end
        task.wait(2)
    end
end)
`;
      finalSource = authUIRestyled + "\n\n" + finalSource;
    }

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/lua-obfuscate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          source: finalSource,
          options: { stringEncryption, controlFlowFlattening, variableRenaming },
          mode,
          projectId: selectedProject,
          fileName,
        }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        const reason = data?.error || data?.message || `HTTP ${res.status}`;
        throw new Error(`Edge Function returned ${res.status}: ${reason}`);
      }

      if (data?.success) {
        setLoadstringSnippet(data.loadstring);
        setLoaderUrl(data.loaderUrl);
        setStats(data.stats);
        toast({
          title: 'Obfuscation complete',
          description: data?.note
            ? `Script saved to your Source Locker. ${data.note}.`
            : 'Script saved to your Source Locker',
        });
        fetchData();
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const isInvokeFailure =
        /failed to send|edge function|fetch failed|networkerror|functionsrelayerror/i.test(raw);
      const description = isInvokeFailure
        ? `${raw} — Deploy the lua-obfuscate Edge Function to this Supabase project (Dashboard → Edge Functions), or run: supabase functions deploy lua-obfuscate`
        : raw;
      toast({ title: 'Error', description, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, id?: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id || 'main');
    toast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDelete = async (scriptId: string) => {
    const { error } = await supabase.from('obfuscated_scripts').delete().eq('id', scriptId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete script', variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: 'Script removed from Source Locker' });
      setSavedScripts((prev) => prev.filter((s) => s.id !== scriptId));
    }
  };

  const getLoadstring = (scriptId: string) =>
    `loadstring(game:HttpGet("${supabaseUrl}/functions/v1/loader?id=${scriptId}"))()`;

  const getProjectName = (id: string | null) => projects.find((p) => p.id === id)?.name || '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lua Obfuscation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Protect your Lua scripts with VM-level obfuscation &amp; API-protected loadstrings
        </p>
        {isStarter && (
          <p className="text-xs text-muted-foreground mt-1">
            Starter limit: 20 obfuscations total ({starterObfuscationsRemaining} remaining).
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* File Upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCode className="h-4 w-4" /> Upload Script
            </CardTitle>
             <CardDescription>Select a project to pull its source automatically, or upload a .lua file manually</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileRef}
              type="file"
              accept=".lua,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 p-10 cursor-pointer transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-3" />
              {fileName ? (
                <div className="text-center">
                  <p className="text-sm font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground mt-1">{fileContent.length} characters · Click to replace</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">Click to upload</p>
                  <p className="text-xs text-muted-foreground mt-1">.lua or .txt files only</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Select project to link" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projects.length === 0 && (
                <p className="text-xs text-muted-foreground">Create a project first</p>
              )}
              {selectedProject && fileName && (
                <p className="text-xs text-muted-foreground">Loaded from selected project: {fileName}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Options */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> Options
            </CardTitle>
            <CardDescription>Configure obfuscation passes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="str-enc" className="text-sm">String Encryption (XOR)</Label>
              <Switch
                id="str-enc"
                checked={stringEncryption}
                onCheckedChange={setStringEncryption}
                disabled={mode !== 'balanced'}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Stability Profile</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'safe' | 'balanced' | 'aggressive')}>
                <SelectTrigger className="bg-background/50">
                  <SelectValue placeholder="Choose mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="safe">Safe (best for large scripts)</SelectItem>
                  <SelectItem value="balanced">Balanced (recommended)</SelectItem>
                  <SelectItem value="aggressive">Aggressive (strongest transforms)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="cf-flat" className="text-sm">Control Flow Flattening</Label>
              <Switch
                id="cf-flat"
                checked={controlFlowFlattening}
                onCheckedChange={setControlFlowFlattening}
                disabled={mode !== 'balanced'}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="var-ren" className="text-sm">Variable Renaming</Label>
              <Switch
                id="var-ren"
                checked={variableRenaming}
                onCheckedChange={setVariableRenaming}
                disabled={mode !== 'balanced'}
              />
            </div>
            <div className="flex items-center justify-between border-t border-border/50 pt-4 mt-2">
              <div className="space-y-0.5">
                <Label htmlFor="embed-auth" className="text-sm text-primary">Embed Auth UI (Whitelist)</Label>
                <p className="text-[10px] text-muted-foreground">Automatically injects a key login interface using your UPANEL key</p>
              </div>
              <Switch
                id="embed-auth"
                checked={embedAuth}
                onCheckedChange={setEmbedAuth}
              />
            </div>
            {embedAuth && (
              <div className="flex items-center justify-between pl-4 border-l-2 border-violet-500/30">
                <div className="space-y-0.5">
                  <Label htmlFor="embed-cp" className="text-sm text-violet-400">Auto-Embed Checkpoints</Label>
                  <p className="text-[10px] text-muted-foreground">Adds a "Get Key" button that redirects users to checkpoint completion before login</p>
                </div>
                <Switch
                  id="embed-cp"
                  checked={embedCheckpoints}
                  onCheckedChange={setEmbedCheckpoints}
                />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-2">
              With all three options off, the stored script is <strong>plain text</strong> (no byte wrapper) — best for very large scripts. Turning on any option adds the UTF-8 loadstring wrapper. Renaming skips short names (under 3 chars) and common Roblox members.
            </p>

            <Button
              className="w-full mt-4 active:scale-[0.97] transition-transform"
              onClick={handleObfuscate}
              disabled={loading || !fileContent.trim() || !selectedProject || (isStarter && starterObfuscationsRemaining <= 0)}
            >
              {loading ? 'Obfuscating...' : 'Obfuscate & Generate Loadstring'}
            </Button>

            {stats && (
              <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
                <p>Original: <span className="font-mono tabular-nums">{stats.originalSize}</span> bytes</p>
                <p>Obfuscated: <span className="font-mono tabular-nums">{stats.obfuscatedSize}</span> bytes</p>
                <p>Ratio: <span className="font-mono tabular-nums">{stats.ratio}x</span></p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Output */}
      {loadstringSnippet && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Link className="h-4 w-4" /> Your Protected Loadstring
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleCopy(loadstringSnippet)} className="active:scale-[0.97] transition-transform">
                {copied === 'main' ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied === 'main' ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <CardDescription>
              Use this loadstring in your script. The obfuscated code is stored server-side.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => handleCopy(loadstringSnippet)}>
              <code className="text-sm font-mono text-primary break-all leading-relaxed">{loadstringSnippet}</code>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source Locker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Source Locker
          </CardTitle>
          <CardDescription>All your obfuscated scripts — copy loadstrings or manage them</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingScripts ? (
            <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>
          ) : savedScripts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No scripts yet. Obfuscate a script to see it here.</p>
          ) : (
            <div className="space-y-2">
              {savedScripts.map((script) => (
                <div key={script.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{script.original_name || 'Untitled Script'}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {getProjectName(script.project_id)} · {new Date(script.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => handleCopy(getLoadstring(script.id), script.id)} className="h-7 px-2 text-xs">
                      {copied === script.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(script.id)} className="h-7 px-2 text-xs text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
