import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Check, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const plans = [
  {
    name: 'Starter',
    price: '$0',
    period: '',
    description: 'For new creators getting started',
    popular: false,
    features: [
      '1 project slot',
      '60 key generations',
      '20 obfuscations',
      'Checkpoint System + Creator Profile (generic links only)',
      'HWID locking + key activation controls',
      'Community support',
      'No Discord bot use',
    ],
  },
  {
    name: 'Pro',
    price: '$20',
    period: '/month',
    description: 'For serious devs actively selling scripts',
    popular: true,
    features: [
      '5 project slots',
      '1,000 key generations',
      '200 obfuscations',
      'Full checkpoint + creator profile system',
      'Discord webhook logging + auth telemetry',
      'Priority support',
    ],
  },
  {
    name: 'Admin Panel',
    price: '$120',
    period: 'one-time',
    description: 'Includes everything',
    popular: false,
    features: [
      'Everything in Pro',
      'Admin panel access',
      'Elevated limits + admin-only tools',
      'Direct staff onboarding help',
    ],
  },
];

export default function Pricing() {
  const { user, loading } = useAuth();
  const discordInvite = 'https://discord.gg/gPcEAER3Nv';

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'radial-gradient(ellipse at 50% 0%, hsl(142 60% 45% / 0.06) 0%, hsl(220 20% 7%) 70%)' }}>
      <header className="flex items-center justify-between px-6 py-4 lg:px-12">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/25">
            <img src="/nullx-logo.png" alt="NullX.fun" className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">NullX.fun</span>
        </Link>
        <Link to={user ? '/dashboard' : '/auth'}>
          <Button variant="outline" size="sm">{user ? 'Dashboard' : 'Sign In'}</Button>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 py-12">
        <div className="max-w-5xl w-full space-y-10 text-center">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl" style={{ lineHeight: '1.1' }}>
              Choose your plan
            </h1>
            <p className="text-muted-foreground mx-auto max-w-lg" style={{ textWrap: 'pretty' }}>
              Purchases and upgrades are handled in Discord via ticket for the fastest support.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <a href={discordInvite} target="_blank" rel="noopener noreferrer">
                <Button size="sm" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Join Discord to Buy / Upgrade
                </Button>
              </a>
              {!user && (
                <Link to="/auth">
                  <Button size="sm" variant="outline">Sign in</Button>
                </Link>
              )}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={cn(
                  'relative text-left transition-all hover:shadow-lg hover:shadow-primary/5',
                  plan.popular
                    ? 'border-primary/40 bg-card/90 ring-1 ring-primary/20'
                    : 'border-border/50 bg-card/60'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                    Most Popular
                  </div>
                )}
                <CardHeader className="pb-3">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider">{plan.name}</CardDescription>
                  <CardTitle className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground font-normal">{plan.period}</span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground pt-1">{plan.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs">
                        <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a href={discordInvite} target="_blank" rel="noopener noreferrer">
                    <Button
                      className={cn(
                        'w-full active:scale-[0.97] transition-transform gap-2',
                        !plan.popular && 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      )}
                      variant={plan.popular ? 'default' : 'secondary'}
                      size="sm"
                      onClick={() => toast({ title: 'Open a ticket in Discord', description: 'Join the server, then open a ticket to buy or upgrade.' })}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Join Discord
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} NullX.fun
      </footer>
    </div>
  );
}
