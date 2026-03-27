import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  Shield,
  FolderCode,
  Key,
  Webhook,
  ScrollText,
  LogOut,
  Code2,
  Link2,
  CreditCard,
  ShieldCheck,
  Lock,
  KeyRound,
  User,
  MessageCircle,
  UserCircle2,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type NavItem = { to: string; label: string; icon: typeof FolderCode; end?: boolean };

const dashboardItems: NavItem[] = [
  { to: '/dashboard', label: 'Projects', icon: FolderCode, end: true },
  { to: '/dashboard/keys', label: 'License Keys', icon: Key },
  { to: '/dashboard/checkpoints', label: 'Checkpoints', icon: Link2 },
  { to: '/dashboard/webhooks', label: 'Webhooks', icon: Webhook },
  { to: '/dashboard/blacklist', label: 'Blacklist', icon: Ban },
  { to: '/dashboard/logs', label: 'Auth Logs', icon: ScrollText },
  { to: '/dashboard/obfuscate', label: 'Obfuscation', icon: Lock },
  { to: '/dashboard/profile', label: 'Creator Profile', icon: UserCircle2 },
  { to: '/dashboard/docs', label: 'Integration', icon: Code2 },
];

const accountItems: NavItem[] = [
  { to: '/dashboard/panel-key', label: 'Panel key', icon: KeyRound },
  { to: '/dashboard/user', label: 'User & vault', icon: User },
];

function NavButton({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-accent-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {item.label}
    </NavLink>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut, user, subscriptionEnd, isAdmin, subscribed, currentPlan } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleManageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch {
      toast({ title: 'Error', description: 'Could not open subscription portal', variant: 'destructive' });
    }
  };

  const adminItem: NavItem | null = isAdmin
    ? { to: '/dashboard/admin', label: 'Admin', icon: ShieldCheck }
    : null;
  const paid = subscribed || isAdmin;
  const starterItems: NavItem[] = [
    { to: '/dashboard', label: 'Projects', icon: FolderCode, end: true },
    { to: '/dashboard/keys', label: 'License Keys', icon: Key },
    { to: '/dashboard/checkpoints', label: 'Checkpoints', icon: Link2 },
    { to: '/dashboard/obfuscate', label: 'Obfuscation', icon: Lock },
    { to: '/dashboard/profile', label: 'Creator Profile', icon: UserCircle2 },
    { to: '/dashboard/docs', label: 'Integration', icon: Code2 },
  ];
  const visibleDashboardItems = paid ? dashboardItems : starterItems;
  const visibleAccountItems = paid
    ? [...accountItems, { to: '/dashboard/discord', label: 'Discord bot', icon: MessageCircle }]
    : accountItems;
  const planLabel = isAdmin
    ? 'Admin'
    : subscribed
    ? (currentPlan || 'Pro')
    : 'Starter';

  return (
    <div className="flex min-h-screen">
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar-background">
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/25">
            <img src="/nullx-logo.png" alt="NullX.fun" className="h-4 w-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-sidebar-foreground">NullX.fun</span>
          {isAdmin && (
            <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary ring-1 ring-primary/20">
              ADMIN
            </span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-6">
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90">
              Dashboard
            </p>
            <div className="space-y-0.5">
              {visibleDashboardItems.map((item) => (
                <NavButton key={item.to} item={item} />
              ))}
            </div>
          </div>
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90">
              Account
            </p>
            <div className="space-y-0.5">
              {visibleAccountItems.map((item) => (
                <NavButton key={item.to} item={item} />
              ))}
            </div>
          </div>
          {adminItem && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500/90">
                Administration
              </p>
              <div className="space-y-0.5">
                <NavButton item={adminItem} />
              </div>
            </div>
          )}
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-1">
          <div className="px-3 pb-1">
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary ring-1 ring-primary/20 uppercase tracking-wide">
              Plan: {planLabel}
            </span>
          </div>
          {subscriptionEnd && (
            <div className="px-3 text-[10px] text-muted-foreground">
              Sub ends: {new Date(subscriptionEnd).toLocaleDateString()}
            </div>
          )}
          <button
            onClick={handleManageSubscription}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50 active:scale-[0.97]"
          >
            <CreditCard className="h-4 w-4" />
            Manage Subscription
          </button>
          <div className="truncate px-3 text-xs text-muted-foreground">{user?.email}</div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50 active:scale-[0.97]"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="ml-60 flex-1 p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
