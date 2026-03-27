import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function Docs() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const projectUrl = window.location.origin;

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: 'Copied to clipboard' });
  };

  const loadstringLoader = `-- NullX.fun Loadstring Loader (one-liner)
-- Use your UPANEL key from Dashboard → Panel key (one key per account, all projects)

loadstring(game:HttpGet("${supabaseUrl}/functions/v1/loader?panel_key=YOUR-UPANEL-KEY&key=YOUR-USER-KEY&hwid=" .. game:GetService("RbxAnalyticsService"):GetClientId()))()`;

  const uiExample = `-- NullX.fun Example Auth UI
local Players = game:GetService("Players")
local player = Players.LocalPlayer
local HttpService = game:GetService("HttpService")

local NOVA_API = "${supabaseUrl}/functions/v1/validate"
local PANEL_KEY = "YOUR-UPANEL-KEY"
local PROJECT_ID = "YOUR-PROJECT-ID"
local GET_KEY_URL = "${projectUrl}/get-key/" .. PROJECT_ID
local _NovaSessionId = nil
local requestFn = request or http_request or (syn and syn.request) or (fluxus and fluxus.request)

local function postJson(url, body)
    if requestFn then
        return requestFn({
            Url = url,
            Method = "POST",
            Headers = { ["Content-Type"] = "application/json" },
            Body = HttpService:JSONEncode(body)
        })
    end

    return HttpService:RequestAsync({
        Url = url,
        Method = "POST",
        Headers = { ["Content-Type"] = "application/json" },
        Body = HttpService:JSONEncode(body)
    })
end

-- Create ScreenGui
local gui = Instance.new("ScreenGui")
gui.Name = "NullXAuth"
gui.Parent = player:WaitForChild("PlayerGui")
gui.ResetOnSpawn = false

local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 320, 0, 240)
frame.Position = UDim2.new(0.5, -160, 0.5, -100)
frame.BackgroundColor3 = Color3.fromRGB(20, 22, 30)
frame.BorderSizePixel = 0
frame.Parent = gui

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 12)
corner.Parent = frame

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, 0, 0, 40)
title.Position = UDim2.new(0, 0, 0, 10)
title.BackgroundTransparency = 1
title.Text = "NullX.fun"
title.TextColor3 = Color3.fromRGB(80, 200, 120)
title.TextSize = 18
title.Font = Enum.Font.GothamBold
title.Parent = frame

local input = Instance.new("TextBox")
input.Size = UDim2.new(0.85, 0, 0, 36)
input.Position = UDim2.new(0.075, 0, 0, 60)
input.BackgroundColor3 = Color3.fromRGB(30, 32, 42)
input.TextColor3 = Color3.new(1, 1, 1)
input.PlaceholderText = "Enter License Key..."
input.PlaceholderColor3 = Color3.fromRGB(100, 100, 120)
input.TextSize = 14
input.Font = Enum.Font.GothamMedium
input.ClearTextOnFocus = false
input.Parent = frame

local inputCorner = Instance.new("UICorner")
inputCorner.CornerRadius = UDim.new(0, 8)
inputCorner.Parent = input

local submitBtn = Instance.new("TextButton")
submitBtn.Size = UDim2.new(0.85, 0, 0, 36)
submitBtn.Position = UDim2.new(0.075, 0, 0, 110)
submitBtn.BackgroundColor3 = Color3.fromRGB(50, 180, 100)
submitBtn.TextColor3 = Color3.new(1, 1, 1)
submitBtn.Text = "Authenticate"
submitBtn.TextSize = 14
submitBtn.Font = Enum.Font.GothamBold
submitBtn.Parent = frame

local btnCorner = Instance.new("UICorner")
btnCorner.CornerRadius = UDim.new(0, 8)
btnCorner.Parent = submitBtn

local status = Instance.new("TextLabel")
status.Size = UDim2.new(1, 0, 0, 20)
status.Position = UDim2.new(0, 0, 0, 190)
status.BackgroundTransparency = 1
status.Text = ""
status.TextColor3 = Color3.fromRGB(150, 150, 170)
status.TextSize = 12
status.Font = Enum.Font.Gotham
status.Parent = frame

-- Get Key button (checkpoint system)
local getKeyBtn = Instance.new("TextButton")
getKeyBtn.Size = UDim2.new(0.85, 0, 0, 36)
getKeyBtn.Position = UDim2.new(0.075, 0, 0, 150)
getKeyBtn.BackgroundColor3 = Color3.fromRGB(56, 189, 248)
getKeyBtn.TextColor3 = Color3.new(1, 1, 1)
getKeyBtn.Text = "🛡️ Get key via checkpoints"
getKeyBtn.TextSize = 12
getKeyBtn.Font = Enum.Font.GothamBold
getKeyBtn.Parent = frame

local getKeyCorner = Instance.new("UICorner")
getKeyCorner.CornerRadius = UDim.new(0, 8)
getKeyCorner.Parent = getKeyBtn

getKeyBtn.MouseButton1Click:Connect(function()
    if syn and syn.openURL then
        syn.openURL(GET_KEY_URL)
        status.Text = "✅ Opening checkpoints..."
        status.TextColor3 = Color3.fromRGB(56, 189, 248)
    elseif setclipboard then
        setclipboard(GET_KEY_URL)
        status.Text = "✅ Link copied! Open in your browser."
        status.TextColor3 = Color3.fromRGB(56, 189, 248)
    else
        status.Text = "Open this in your browser: " .. GET_KEY_URL
        status.TextColor3 = Color3.fromRGB(56, 189, 248)
    end
end)

local function getHWID()
    return game:GetService("RbxAnalyticsService"):GetClientId()
end

local function getOS()
    local uis = game:GetService("UserInputService")
    if uis.TouchEnabled and not uis.KeyboardEnabled then return "Mobile"
    elseif uis.GamepadEnabled then return "Console"
    else return "Desktop" end
end

submitBtn.MouseButton1Click:Connect(function()
    local key = input.Text
    if key == "" then
        status.Text = "Please enter a key"
        status.TextColor3 = Color3.fromRGB(255, 100, 100)
        return
    end

    status.Text = "Authenticating..."
    status.TextColor3 = Color3.fromRGB(150, 150, 170)

    local success, response = pcall(function()
        return postJson(NOVA_API, {
            panel_key = PANEL_KEY,
            project_id = PROJECT_ID,
            key = key,
            hwid = getHWID(),
            os = getOS()
        })
    end)

    if success and response and response.Body then
        local decoded, data = pcall(function()
            return HttpService:JSONDecode(response.Body)
        end)

        if decoded and data and response.StatusCode == 200 and data.success then
            local projectName = data.project_name or "Unknown Project"
            local keyState = data.key_active and "ACTIVE" or "INACTIVE"
            _NovaSessionId = data.session_id
            status.Text = "✅ Validated | Project: " .. projectName .. " | Key: " .. keyState
            status.TextColor3 = Color3.fromRGB(80, 200, 120)

            -- Hide UI after success, continue heartbeat silently.
            task.delay(0.25, function()
                if gui then gui:Destroy() end
            end)
        else
            status.Text = "❌ " .. tostring((data and data.error) or ("HTTP " .. tostring(response.StatusCode)))
            status.TextColor3 = Color3.fromRGB(255, 100, 100)
        end
        else
            status.Text = "❌ Invalid API response"
            status.TextColor3 = Color3.fromRGB(255, 100, 100)
        end
    else
        status.Text = "❌ Connection failed"
        status.TextColor3 = Color3.fromRGB(255, 100, 100)
    end
end)

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

  const webhookFieldsDoc = `The Discord webhook logs the following fields (each can be toggled on/off per webhook):

• IP Address — The client's public IP
• ISP — Internet Service Provider (resolved via IP geolocation)
• Location — City, Region, Country (resolved via IP geolocation)
• OS — Desktop / Mobile / Console (sent by the client script)
• HWID — Hardware ID used for device locking

These fields appear as embed fields in your Discord channel.
Toggle them in Dashboard → Webhooks → Logged Fields.`;

  const CodeBlock = ({ code, label }: { code: string; label: string }) => (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-7 w-7 opacity-60 hover:opacity-100"
        onClick={() => copyCode(code)}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <pre className="rounded-lg bg-muted p-4 overflow-x-auto text-xs font-mono leading-relaxed text-foreground/90">{code}</pre>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integration Guide</h1>
        <p className="text-sm text-muted-foreground mt-1">How to integrate NullX.fun into your Roblox scripts</p>
      </div>

      <Tabs defaultValue="ui" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="loadstring">Loadstring URL</TabsTrigger>
          <TabsTrigger value="ui">Auth UI Example</TabsTrigger>
          <TabsTrigger value="api">API Reference</TabsTrigger>
          <TabsTrigger value="webhooks">Webhook Logging</TabsTrigger>
        </TabsList>

        <TabsContent value="loadstring">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Loadstring URL (One-Liner)</CardTitle>
              <CardDescription>
                Use this format to load your protected script via <code className="text-xs bg-muted px-1 py-0.5 rounded">loadstring(game:HttpGet(...))()</code>. 
                The <code className="text-xs bg-muted px-1 py-0.5 rounded">/loader</code> endpoint returns raw Lua text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CodeBlock code={loadstringLoader} label="loadstring" />
               <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm space-y-2">
                <p className="font-medium text-primary">How it works:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
                    <li>The URL hits the <code className="bg-muted px-1 rounded">/loader</code> endpoint with your universal UPANEL key plus the user key & HWID</li>
                    <li>It validates your account panel key first, then validates the user license key, locks HWID, and increments usage</li>
                  <li>Returns your script as <strong>raw Lua text</strong> (not JSON) — compatible with <code className="bg-muted px-1 rounded">loadstring</code></li>
                  <li>On failure, returns a Lua comment like <code className="bg-muted px-1 rounded">-- Invalid key</code></li>
                </ol>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                If you still see a connection error in the UI example, the script environment is blocking outgoing POST requests; the one-line loader usually works better because it uses <code className="bg-muted px-1 rounded text-xs">game:HttpGet</code>.
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm">
                <p className="font-medium mb-1">Example usage in your script loader:</p>
                  <pre className="text-xs font-mono text-foreground/80">{`loadstring(game:HttpGet("${supabaseUrl}/functions/v1/loader?panel_key=YOUR-UPANEL-KEY-HERE&key=ABCDE-12345-FGHIJ-67890&hwid=" .. game:GetService("RbxAnalyticsService"):GetClientId()))()`}</pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ui">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Auth UI Example</CardTitle>
              <CardDescription>
                Validation/debug example only. It checks panel key + user key and shows result info, but does not run any script automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={uiExample} label="ui" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">API Endpoints</CardTitle>
              <CardDescription>Use these endpoints to authenticate scripts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">POST /functions/v1/validate</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Validate your embedded universal UPANEL key, then validate a user license key and return validation/result metadata.
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Request Body</p>
                    <pre className="rounded-lg bg-muted p-3 text-xs font-mono">{`{
  "panel_key": "UPANEL-XXXXX-XXXXX-XXXXX-XXXXX",
  "key": "XXXXX-XXXXX-XXXXX-XXXXX",
  "hwid": "client-hardware-id",
  "os": "Desktop"
}`}</pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Success Response (200)</p>
                    <pre className="rounded-lg bg-muted p-3 text-xs font-mono">{`{
  "success": true,
  "script": "-- your protected Lua code"
}`}</pre>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">GET /functions/v1/loader</h3>
                <p className="text-sm text-muted-foreground mb-3">Returns raw Lua text after validating the panel key and user key. Compatible with <code className="bg-muted px-1 rounded text-xs">loadstring(game:HttpGet(...))()</code>.</p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Query Parameters</p>
                     <pre className="rounded-lg bg-muted p-3 text-xs font-mono">{`panel_key=UPANEL-XXXXX-XXXXX-XXXXX-XXXXX
key=XXXXX-XXXXX-XXXXX-XXXXX
hwid=client-hardware-id (optional)`}</pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Response (text/plain)</p>
                    <pre className="rounded-lg bg-muted p-3 text-xs font-mono">{`-- On success: your raw Lua script content
-- On failure: "-- Invalid key" or "-- Key is disabled" etc.`}</pre>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Webhook Logging Fields</CardTitle>
              <CardDescription>What data gets sent to your Discord webhook on each auth event</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <pre className="rounded-lg bg-muted p-4 text-xs font-mono leading-relaxed text-foreground/90 whitespace-pre-wrap">{webhookFieldsDoc}</pre>
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm space-y-3">
                <p className="font-medium">Client-side integration for full logging:</p>
                <p className="text-xs text-muted-foreground">To send OS info with auth requests, include the <code className="bg-muted px-1 rounded">os</code> field in your request body:</p>
                <pre className="rounded-lg bg-muted p-3 text-xs font-mono">{`Body = HttpService:JSONEncode({
    key = LICENSE_KEY,
    hwid = getHWID(),
    os = getOS()  -- "Desktop" / "Mobile" / "Console"
})`}</pre>
                <p className="text-xs text-muted-foreground">IP, ISP, and Location are resolved server-side from the request IP — no client code needed.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
