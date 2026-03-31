import { Copy, Shield, Upload, MessageCircle, ExternalLink, Infinity as InfinityIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

export default function Instructions() {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard!' });
  };

  const exampleScript = `loadstring(game:HttpGet("https://fxshsfrixihheappkiuo.supabase.co/functions/v1/loader?id=2a24a0769d01ce8db03e191d4c9ba3f3"))()`;

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-violet-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-16 sm:py-24 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20 mb-4 animate-bounce">
            <Clock className="h-8 w-8 text-violet-400" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            Get a <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-sky-400">2-Hour Key!</span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Need more time? You can easily get a 2-hour extended key (or multiple!) by sharing our script format. Follow the steps below.
          </p>
        </div>

        {/* Step 1 */}
        <div className="glass rounded-3xl p-8 shadow-2xl space-y-8" style={{ background: 'rgba(13, 13, 26, 0.75)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <div className="flex items-center gap-4 border-b border-white/10 pb-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-violet-500/20 text-violet-300 font-bold text-xl">
              1
            </div>
            <div>
              <h2 className="text-2xl font-bold">Choose a Platform</h2>
              <p className="text-gray-400">Post your script on one of these sites.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <a href="https://scriptblox.com/" target="_blank" rel="noreferrer" className="block group">
              <div className="p-6 rounded-2xl bg-black/40 border border-white/5 hover:border-violet-500/30 transition-all hover:-translate-y-1">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  ScriptBlox <ExternalLink className="h-4 w-4 text-gray-500 group-hover:text-violet-400" />
                </h3>
                <p className="text-sm text-gray-400 mt-1">The most popular option.</p>
              </div>
            </a>
            <a href="https://rscripts.net/" target="_blank" rel="noreferrer" className="block group">
              <div className="p-6 rounded-2xl bg-black/40 border border-white/5 hover:border-violet-500/30 transition-all hover:-translate-y-1">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  RScripts <ExternalLink className="h-4 w-4 text-gray-500 group-hover:text-violet-400" />
                </h3>
                <p className="text-sm text-gray-400 mt-1">Alternative if you don't have a ScriptBlox account.</p>
              </div>
            </a>
          </div>

          {/* RScripts Format */}
          <div className="space-y-4 pt-6">
            <h3 className="text-xl font-bold text-violet-300 flex items-center gap-2">
              <span className="w-2 h-6 bg-violet-500 rounded-full" />
              RSCRIPTS FORMAT
            </h3>
            <div className="bg-black/50 border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                <span className="text-gray-500 font-bold">Title:</span>
                <span className="text-white relative group cursor-pointer" onClick={() => handleCopy("OP BIGHEAD WORLD ESP MORE")}>OP BIGHEAD WORLD ESP MORE <Copy className="h-3 w-3 inline ml-2 opacity-0 group-hover:opacity-100 transition-opacity" /></span>
                
                <span className="text-gray-500 font-bold">Game Link:</span>
                <span className="text-white relative group cursor-pointer" onClick={() => handleCopy("https://www.roblox.com/games/13253735473/Trident-Survival")}>https://www.roblox.com/games/13253735473/Trident-Survival <Copy className="h-3 w-3 inline ml-2 opacity-0 group-hover:opacity-100 transition-opacity" /></span>
                
                <span className="text-gray-500 font-bold">Thumbnail:</span>
                <span className="text-sky-400">NullX.Fun Logo <span className="text-xs text-gray-500 ml-2">(Download below)</span></span>
                
                <span className="text-gray-500 font-bold">Features:</span>
                <span className="text-indigo-400">https://discord.gg/eywcWS59FA</span>
              </div>
              
              <div className="space-y-1">
                <span className="text-sm text-gray-500 font-bold">Description:</span>
                <div className="p-3 bg-white/5 rounded-lg text-sm text-gray-300 relative group cursor-pointer" onClick={() => handleCopy("Has All Basic Features (ESP, Bighead, Aim, Silent Aim, World ESP) PLUS MORE!! Join Our Discord for more and check out the FREE EXTERNAL! Also protect your scripts at NullX.fun — https://discord.gg/eywcWS59FA")}>
                  Has All Basic Features (ESP, Bighead, Aim, Silent Aim, World ESP) PLUS MORE!! Join Our Discord for more and check out the FREE EXTERNAL! Also protect your scripts at NullX.fun — https://discord.gg/eywcWS59FA
                  <Copy className="absolute top-3 right-3 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-white" />
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-sm text-gray-500 font-bold">Script / Loadstring:</span>
                <div className="p-3 bg-white/5 rounded-lg text-sm font-mono text-violet-300 break-all relative group cursor-pointer" onClick={() => handleCopy(exampleScript)}>
                  {exampleScript}
                  <Copy className="absolute top-3 right-3 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-white" />
                </div>
              </div>
              
              {/* Optional Screenshot image slot - defaults to hiding if not found */}
              <div className="mt-4 border border-white/10 rounded-xl overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
                 <img src="/rscripts.png" alt="RScripts format example" className="w-full h-auto object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
            </div>
          </div>

          {/* ScriptBlox Format */}
          <div className="space-y-4 pt-6">
            <h3 className="text-xl font-bold text-sky-400 flex items-center gap-2">
              <span className="w-2 h-6 bg-sky-500 rounded-full" />
              SCRIPTBLOX FORMAT
            </h3>
            <div className="bg-black/50 border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                <span className="text-gray-500 font-bold">Title:</span>
                <span className="text-white relative group cursor-pointer" onClick={() => handleCopy("BEST OP SCRIPT HUB FOR THE MOST POPULAR SURVIVAL BASED GAMES, LONE TS")}>BEST OP SCRIPT HUB FOR THE MOST POPULAR SURVIVAL BASED GAMES, LONE TS <Copy className="h-3 w-3 inline ml-2 opacity-0 group-hover:opacity-100 transition-opacity" /></span>
                
                <span className="text-gray-500 font-bold">Game ID:</span>
                <span className="text-white relative group cursor-pointer" onClick={() => handleCopy("13253735473")}>13253735473 <span className="text-gray-500 ml-1">(or leave blank)</span> <Copy className="h-3 w-3 inline ml-2 opacity-0 group-hover:opacity-100 transition-opacity" /></span>
                
                <span className="text-gray-500 font-bold">Image:</span>
                <span className="text-sky-400">NullX.Fun Logo <span className="text-xs text-gray-500 ml-2">(Download below)</span></span>
              </div>
              
              <div className="space-y-1">
                <span className="text-sm text-gray-500 font-bold">Description:</span>
                <div className="p-3 bg-white/5 rounded-lg text-sm text-gray-300 relative group cursor-pointer" onClick={() => handleCopy("Has All Basic Features (ESP, Bighead, Aim, Silent Aim, World ESP) PLUS MORE!! Join Our Discord for more and check out the FREE EXTERNAL! Also protect your scripts at NullX.fun — https://discord.gg/eywcWS59FA")}>
                  Has All Basic Features (ESP, Bighead, Aim, Silent Aim, World ESP) PLUS MORE!! Join Our Discord for more and check out the FREE EXTERNAL! Also protect your scripts at NullX.fun — https://discord.gg/eywcWS59FA
                  <Copy className="absolute top-3 right-3 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-white" />
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-sm text-gray-500 font-bold">Script / Loadstring:</span>
                <div className="p-3 bg-white/5 rounded-lg text-sm font-mono text-violet-300 break-all relative group cursor-pointer" onClick={() => handleCopy(exampleScript)}>
                  {exampleScript}
                  <Copy className="absolute top-3 right-3 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-white" />
                </div>
              </div>
              
              {/* Optional Screenshot image slot - defaults to hiding if not found */}
              <div className="mt-4 border border-white/10 rounded-xl overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
                 <img src="/scriptblox.png" alt="ScriptBlox format example" className="w-full h-auto object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
            </div>
          </div>
          
          {/* Logo Download */}
          <div className="flex items-center justify-between p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl">
             <div className="flex items-center gap-3">
               <Shield className="h-6 w-6 text-sky-400" />
               <div>
                 <h4 className="font-bold text-white">NullX.Fun Logo Thumbnail</h4>
                 <p className="text-xs text-gray-400">Required for the thumbnail image on both platforms.</p>
               </div>
             </div>
             <a href="/nullx-logo.png" download="NullX-Logo.png">
               <Button variant="secondary" size="sm" className="bg-sky-500 hover:bg-sky-600 text-white border-none py-2 px-4 h-auto">
                 Download Logo
               </Button>
             </a>
          </div>
        </div>

        {/* Step 2 */}
        <div className="glass rounded-3xl p-8 shadow-2xl space-y-6" style={{ background: 'rgba(13, 13, 26, 0.75)', backdropFilter: 'blur(20px)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <div className="flex items-center gap-4 border-b border-white/10 pb-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/20 text-sky-300 font-bold text-xl">
              2
            </div>
            <div>
              <h2 className="text-2xl font-bold">Claim Your Key</h2>
              <p className="text-gray-400">Verify your post to get the extension instantly.</p>
            </div>
          </div>
          
          <div className="p-6 bg-black/40 rounded-2xl border border-white/5 text-center space-y-4">
             <Upload className="h-12 w-12 text-violet-400 mx-auto" strokeWidth={1.5} />
             <h3 className="text-xl text-white">Open a ticket in the Discord!</h3>
             <p className="text-gray-400">Send a screenshot of your post and tag <strong className="text-violet-300">@Revile_</strong></p>
             <p className="text-sm text-gray-500">We'll get back to you ASAP with your brand new key!</p>
             
             <div className="pt-4 pb-2">
               <a href="https://discord.gg/eywcWS59FA" target="_blank" rel="noreferrer">
                 <Button className="bg-[#5865F2] hover:bg-[#4752C4] text-white py-6 px-8 text-lg rounded-xl shadow-[0_0_20px_rgba(88,101,242,0.4)] transition-all hover:-translate-y-1 h-auto">
                   <MessageCircle className="mr-2 h-5 w-5" />
                   Verify in Discord!
                 </Button>
               </a>
             </div>
          </div>
        </div>

        {/* Infinite Looping Note */}
        <div className="text-center space-y-2 p-8 rounded-3xl bg-gradient-to-br from-violet-500/20 to-sky-500/20 border border-violet-500/30 shadow-xl overflow-hidden relative">
           <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
           <InfinityIcon className="h-12 w-12 text-white mx-auto mb-3" strokeWidth={1.5} />
           <h3 className="text-2xl font-bold text-white relative z-10">YOU CAN DO THIS AS MANY TIMES AS YOU WANT!</h3>
           <p className="text-violet-200 font-bold tracking-widest uppercase relative z-10">More Posts = Longer Keys</p>
        </div>

      </div>
    </div>
  );
}
