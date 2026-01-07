import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import TenantsPage from "@/pages/tenants";
import FirewallsPage from "@/pages/firewalls";
import FirewallDetails from "@/pages/firewall-details";
import Layout from "@/components/layout";
import { useAuth, useAuthInit } from "@/hooks/use-auth";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isInitialized } = useAuth();
  
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }
  
  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <Layout>
      <Component {...rest} />
    </Layout>
  );
}

function Router() {
  useAuthInit();
  const { user, isInitialized } = useAuth();

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/auth">
        {user ? <Redirect to="/" /> : <AuthPage />}
      </Route>
      
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>

      <Route path="/tenants">
        {() => <ProtectedRoute component={TenantsPage} />}
      </Route>

      <Route path="/firewalls">
        {() => <ProtectedRoute component={FirewallsPage} />}
      </Route>
      
      <Route path="/firewalls/:id">
        {() => <ProtectedRoute component={FirewallDetails} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
