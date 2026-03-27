import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { VaultProvider } from "@/hooks/useVault";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Pricing from "./pages/Pricing";
import Protected from "./pages/Protected";
import GetKey from "./pages/GetKey";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/DashboardLayout";
import Projects from "./pages/dashboard/Projects";
import Keys from "./pages/dashboard/Keys";
import Checkpoints from "./pages/dashboard/Checkpoints";
import Webhooks from "./pages/dashboard/Webhooks";
import Blacklist from "./pages/dashboard/Blacklist";
import Logs from "./pages/dashboard/Logs";
import Docs from "./pages/dashboard/Docs";
import Obfuscate from "./pages/dashboard/Obfuscate";
import AdminPanel from "./pages/dashboard/AdminPanel";
import PanelKey from "./pages/dashboard/PanelKey";
import UserSettings from "./pages/dashboard/UserSettings";
import DiscordIntegration from "./pages/dashboard/DiscordIntegration";
import CreatorProfile from "./pages/dashboard/CreatorProfile";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, checkingSubscription } = useAuth();
  if (loading || checkingSubscription) return <div className="flex min-h-screen items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function SubscribedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, subscribed, isAdmin, checkingSubscription } = useAuth();
  if (loading || checkingSubscription) return <div className="flex min-h-screen items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!subscribed && !isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function DashboardHome() {
  return <Projects />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function DashboardRoutes() {
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <Routes>
          <Route index element={<DashboardHome />} />
          <Route path="keys" element={<Keys />} />
          <Route path="checkpoints" element={<Checkpoints />} />
          <Route path="webhooks" element={<SubscribedRoute><Webhooks /></SubscribedRoute>} />
          <Route path="blacklist" element={<SubscribedRoute><Blacklist /></SubscribedRoute>} />
          <Route path="logs" element={<SubscribedRoute><Logs /></SubscribedRoute>} />
          <Route path="obfuscate" element={<Obfuscate />} />
          <Route path="profile" element={<CreatorProfile />} />
          <Route path="panel-key" element={<PanelKey />} />
          <Route path="user" element={<UserSettings />} />
          <Route path="discord" element={<SubscribedRoute><DiscordIntegration /></SubscribedRoute>} />
          <Route path="docs" element={<Docs />} />
          <Route path="admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
        </Routes>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <VaultProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/protected/:id" element={<Protected />} />
              <Route path="/get-key/:projectId" element={<GetKey />} />
              <Route path="/dashboard/*" element={<DashboardRoutes />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </VaultProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
