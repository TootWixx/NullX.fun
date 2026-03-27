import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const ADMIN_EMAILS = ['real5wagger5oup@gmail.com'];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  subscribed: boolean;
  subscriptionEnd: string | null;
  checkingSubscription: boolean;
  isAdmin: boolean;
  currentPlan: string | null;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);

  const checkUserStatus = async (userId: string, email?: string) => {
    setCheckingSubscription(true);

    // Check admin first (instant for hardcoded emails)
    let adminStatus = false;
    if (email && ADMIN_EMAILS.includes(email.toLowerCase())) {
      adminStatus = true;
    } else {
      try {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('role', 'admin')
          .maybeSingle();
        adminStatus = !!data;
      } catch {
        adminStatus = false;
      }
    }
    setIsAdmin(adminStatus);

    // If admin, skip subscription check — they bypass it anyway
    if (adminStatus) {
      setSubscribed(true);
      setCheckingSubscription(false);
      return;
    }

    // Check subscription for non-admins
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (!error && data) {
        const isSubscribed = data.subscribed ?? false;
        setSubscribed(isSubscribed);
        setSubscriptionEnd(data.subscription_end ?? null);
        setCurrentPlan(isSubscribed ? (data.product_id ?? 'pro') : 'starter');
      } else {
        setSubscribed(false);
        setSubscriptionEnd(null);
        setCurrentPlan('starter');
      }
    } catch {
      setSubscribed(false);
      setSubscriptionEnd(null);
      setCurrentPlan('starter');
    } finally {
      setCheckingSubscription(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
      if (sess?.user) {
        setTimeout(() => checkUserStatus(sess.user.id, sess.user.email), 0);
      } else {
        setSubscribed(false);
        setSubscriptionEnd(null);
        setIsAdmin(false);
        setCurrentPlan(null);
        setCheckingSubscription(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
      if (sess?.user) {
        checkUserStatus(sess.user.id, sess.user.email);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || isAdmin) return;
    const interval = setInterval(() => {
      if (user) checkUserStatus(user.id, user.email ?? undefined);
    }, 60000);
    return () => clearInterval(interval);
  }, [user, isAdmin]);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          plan: 'starter',
          plan_access: 'starter',
        },
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSubscribed(false);
    setSubscriptionEnd(null);
    setIsAdmin(false);
    setCurrentPlan(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, subscribed, subscriptionEnd, checkingSubscription, isAdmin, currentPlan, signUp, signIn, signOut, refreshSubscription: () => user ? checkUserStatus(user.id, user.email ?? undefined) : Promise.resolve() }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
