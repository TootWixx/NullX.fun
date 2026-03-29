import { useParams } from 'react-router-dom';
import { Lock, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function Protected() {
  const { id } = useParams();

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'radial-gradient(ellipse at 50% 0%, hsl(142 60% 45% / 0.06) 0%, hsl(220 20% 7%) 70%)' }}>
      <Card className="w-full max-w-lg border-primary/20 bg-card/80 backdrop-blur-sm">
        <CardContent className="flex flex-col items-center gap-6 py-14 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <img src="/nullx-logo.png" alt="NullX.fun" className="h-10 w-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight" style={{ lineHeight: '1.1' }}>
              This Script is Protected by
            </h1>
            <p className="text-2xl font-bold text-primary tracking-tight">NullX.fun</p>
          </div>

          {/* Active status indicator */}
          <div className="flex items-center gap-2.5 rounded-full bg-primary/10 px-5 py-2.5 ring-1 ring-primary/20">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
            <span className="text-sm font-medium text-primary">Active &amp; Protected</span>
          </div>

          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            This script has been obfuscated and encrypted with VM-level protection. 
            It can only be executed through an authenticated Roblox executor with a valid license key.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Encrypted &amp; HWID-locked
            </div>
            <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              VM Obfuscated
            </div>
          </div>

          {id && (
            <p className="text-[11px] text-muted-foreground/50 font-mono mt-2">
              Script ID: {id.slice(0, 8)}…
            </p>
          )}

          <a 
            href="/" 
            className="mt-1 text-xs text-primary/70 hover:text-primary transition-colors"
          >
            Learn more about NullX.fun →
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
