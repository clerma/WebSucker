import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import CheckoutSuccess from "@/pages/checkout-success";
import CheckoutCancel from "@/pages/checkout-cancel";
import Terms from "@/pages/terms";
import Admin from "@/pages/admin";
import Blog from "@/pages/blog";
import BlogPost from "@/pages/blog-post";
import Features from "@/pages/features";
import Faq from "@/pages/faq";
import AuthPage from "@/pages/auth";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import { AccountMenu } from "@/components/account-menu";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/features" component={Features} />
      <Route path="/faq" component={Faq} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/terms" component={Terms} />
      <Route path="/admin" component={Admin} />
      <Route path="/checkout/success" component={CheckoutSuccess} />
      <Route path="/checkout/cancel" component={CheckoutCancel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppShell() {
  const [location] = useLocation();
  const hideChrome = location === "/admin";
  return (
    <div className="relative min-h-screen">
      {!hideChrome && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <AccountMenu />
          <ThemeToggle />
        </div>
      )}
      <Router />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="webscraper-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppShell />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
