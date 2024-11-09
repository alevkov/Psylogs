import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Switch, Route, Link } from "wouter";
import "./index.css";
import { SWRConfig } from "swr";
import { fetcher } from "./lib/fetcher";
import { Toaster } from "./components/ui/toaster";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { DoseProvider } from "./contexts/DoseContext";

// Pages
import HomePage from "./pages/index";
import HistoryPage from "./pages/history";
import SettingsPage from "./pages/settings";

// Initialize dark mode from localStorage on app load
const initializeDarkMode = () => {
  const darkMode = localStorage.getItem("darkMode") === "true";
  if (darkMode) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
};

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-base">
      <div className="min-h-screen bg-background">
        <nav className="border-b">
          <div className="app-container">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="font-semibold hover:text-primary transition-colors cursor-pointer">
                  <Link href="/">Home</Link>
                </div>
                <div className="font-semibold hover:text-primary transition-colors cursor-pointer">
                  <Link href="/history">History</Link>
                </div>
                <div className="font-semibold hover:text-primary transition-colors cursor-pointer">
                  <Link href="/settings">Settings</Link>
                </div>
              </div>
              <ConnectionStatus />
            </div>
          </div>
        </nav>
        <main className="app-container">
          {children}
        </main>
        <Toaster />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SWRConfig value={{ fetcher }}>
      <DoseProvider>
        <Layout>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/history" component={HistoryPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route>404 Page Not Found</Route>
          </Switch>
        </Layout>
      </DoseProvider>
    </SWRConfig>
  </StrictMode>,
);

// Register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js");
  });
}