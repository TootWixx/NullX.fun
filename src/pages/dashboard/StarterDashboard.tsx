import { Link } from 'react-router-dom';
import { MessageCircle, Check, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const DISCORD_URL = 'https://discord.gg/gPcEAER3Nv';

const highlights = [
  'Protected API key validation flow',
  'Project-scoped license keys + HWID support',
  'Discord bot operations with UPanel login',
  'Webhook event logs and checkpoint support',
];

const plans = [
  {
    name: 'Starter',
    price: '$0',
    points: [
      '1 project slot',
      '60 key generations',
      '20 obfuscations',
      'Checkpoint System + Creator Profile (generic links only)',
      'HWID locking + key activation controls',
      'Community support',
      'No Discord bot use',
    ],
  },
  { name: 'Pro', price: '$20/mo', points: ['5 project slots', '1,000 key generations', '200 obfuscations'] },
  { name: 'Admin Panel', price: '$120 one-time', points: ['Everything in Pro', 'Admin tooling', 'Lifetime panel access'] },
];

export default function StarterDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <img src="/nullx-logo.png" alt="NullX.fun" className="h-7 w-7" />
          Welcome to NullX.fun
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your new account starts on the Starter plan. Open a ticket in Discord to buy or upgrade.
        </p>
      </div>

      <Card className="border-primary/20 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Platform overview
          </CardTitle>
          <CardDescription>
            Build and run a secure whitelist/auth pipeline for Roblox scripts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {highlights.map((item) => (
            <div key={item} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className="border-border/60">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wider">{plan.name}</CardDescription>
              <CardTitle className="text-xl">{plan.price}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {plan.points.map((p) => (
                <p key={p} className="text-xs text-muted-foreground">• {p}</p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/pricing">
            View all plans <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4 mr-1" />
            Open Ticket in Discord
          </a>
        </Button>
      </div>
    </div>
  );
}
