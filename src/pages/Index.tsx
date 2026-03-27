import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, Key, Webhook, Code2, ArrowRight, Link2, MessageCircle, Sparkles, Check } from 'lucide-react';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  const DISCORD_URL = 'https://discord.gg/gPcEAER3Nv';

  const features = [
    { icon: Key, title: 'License Keys', desc: 'Generate, manage, and track keys with HWID locking and expiration.' },
    { icon: Shield, title: 'Script Protection', desc: 'VM obfuscation, string encryption, and control flow flattening.' },
    { icon: Webhook, title: 'Discord Logging', desc: 'Real-time auth logs sent directly to your Discord server.' },
    { icon: Link2, title: 'Checkpoint System', desc: 'LootLabs, Work.ink & Linkvertise checkpoints for key distribution.' },
    { icon: Shield, title: 'Whitelist Service', desc: 'Panel-key protected whitelist/auth pipeline with HWID and project-scoped controls.' },
    { icon: Code2, title: 'Easy Integration', desc: 'Drop-in loader script with example auth UI for Roblox.' },
  ];
  const plans = [
    {
      name: 'Starter',
      price: '$0',
      perks: [
        '1 project slot',
        '60 key generations',
        '20 obfuscations',
        'Checkpoint System + Creator Profile (generic links only)',
        'HWID locking + key activation controls',
        'Community support',
        'No Discord bot use',
      ],
    },
    { name: 'Pro', price: '$20/mo', perks: ['5 project slots', '1,000 key generations', '200 obfuscations'] },
    { name: 'Admin Panel', price: '$120 one-time', perks: ['Everything in Pro', 'Admin tools', 'Lifetime access'] },
  ];

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'radial-gradient(ellipse at 50% 0%, hsl(262 88% 68% / 0.10) 0%, hsl(205 85% 40% / 0.07) 35%, hsl(220 20% 7%) 70%)' }}>
      <header className="flex items-center justify-between px-6 py-4 lg:px-12">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/25">
            <img src="/nullx-logo.png" alt="NullX.fun" className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">NullX.fun</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild className="active:scale-[0.97] transition-transform">
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-label="Join Discord">
              <MessageCircle className="h-4 w-4" />
            </a>
          </Button>
          {user ? (
            <Link to="/dashboard">
              <Button variant="outline" size="sm" className="active:scale-[0.97] transition-transform">Dashboard</Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button variant="outline" size="sm" className="active:scale-[0.97] transition-transform">Sign In</Button>
            </Link>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl space-y-6">
          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl" style={{ lineHeight: '1.08' }}>
            Protect your Roblox scripts
          </h1>
          <p className="mx-auto max-w-lg text-base text-muted-foreground" style={{ textWrap: 'pretty' }}>
            Full authentication system with license keys, HWID locking, Discord logging, checkpoint monetization, and script obfuscation — all in one dashboard.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {user ? (
              <Link to="/dashboard">
                <Button size="lg" className="active:scale-[0.97] transition-transform">
                  Go to Dashboard <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/auth">
                  <Button size="lg" className="active:scale-[0.97] transition-transform">
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button size="lg" variant="outline" className="active:scale-[0.97] transition-transform">
                    Sign In
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button size="lg" variant="outline" className="active:scale-[0.97] transition-transform">
                    Sign Up
                  </Button>
                </Link>
              </>
            )}
            <Button size="lg" variant="secondary" asChild className="active:scale-[0.97] transition-transform">
              <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4 mr-1" />
                Join Discord
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-12 w-full max-w-3xl rounded-xl border border-primary/20 bg-card/35 p-4 text-left">
          <div className="flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-primary mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Built for production Roblox deployments: protected loaders, whitelist/panel controls, key auth telemetry,
              Discord bot operations, and checkpoint monetization in one workflow.
            </p>
          </div>
        </div>

        <div className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border/50 bg-card/40 p-5 text-left backdrop-blur-sm transition-colors hover:bg-card/60">
              <f.icon className="h-5 w-5 text-primary mb-3" />
              <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 w-full max-w-4xl text-left">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pricing</h2>
            <Link to="/pricing">
              <Button variant="outline" size="sm">View full pricing</Button>
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p) => (
              <div key={p.name} className="rounded-xl border border-border/60 bg-card/40 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{p.name}</p>
                <p className="mt-1 text-xl font-bold">{p.price}</p>
                <div className="mt-3 space-y-1.5">
                  {p.perks.map((perk) => (
                    <p key={perk} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Check className="h-3.5 w-3.5 text-primary mt-0.5" />
                      <span>{perk}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 w-full max-w-3xl rounded-xl border border-border/60 bg-card/50 p-5 text-left">
          <h3 className="text-sm font-semibold">Whitelist service overview</h3>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            NullX.fun issues project-scoped keys, validates via API, logs events, and delivers scripts through protected
            loaders. Pair this with your UPanel workflow to keep distribution controlled while operators manage keys in Discord.
          </p>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} NullX.fun. Built for Roblox developers.
      </footer>
    </div>
  );
}
