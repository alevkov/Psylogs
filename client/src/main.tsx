import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Switch, Route, Link } from "wouter";
import "./index.css";
import { SWRConfig } from "swr";
import { fetcher } from "./lib/fetcher";
import { Toaster } from "@/components/ui/toaster";

// Pages
import HomePage from "./pages/index";
import HistoryPage from "./pages/history";
import SettingsPage from "./pages/settings";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center space-x-4">
            <Link href="/" className="font-semibold">
              Home
            </Link>
            <Link href="/history" className="font-semibold">
              History
            </Link>
            <Link href="/settings" className="font-semibold">
              Settings
            </Link>
          </div>
        </div>
      </nav>
      {children}
      <Toaster />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SWRConfig value={{ fetcher }}>
      <Layout>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/history" component={HistoryPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route>404 Page Not Found</Route>
        </Switch>
      </Layout>
    </SWRConfig>
  </StrictMode>
);

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');
  });
}
