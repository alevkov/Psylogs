import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Switch, Route, Link } from "wouter";
import "./index.css";
import { SWRConfig } from "swr";
import { fetcher } from "./lib/fetcher";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { DoseProvider } from "./contexts/DoseContext";
import { Toaster } from "./components/ui/toaster";
import { Home, Activity, History, Pill, Settings } from "lucide-react";
import { useIsMobile } from "./hooks/use-mobile";

// Pages
import HomePage from "./pages/index";
import HistoryPage from "./pages/history";
import SettingsPage from "./pages/settings";
import ActivePage from "./pages/active";
import SubstancesPage from "./pages/substances";
import SubstanceDetailPage from "./pages/substance-detail-simple";

// Initialize dark mode from localStorage on app load
const initializeDarkMode = () => {
  const darkMode = localStorage.getItem("darkMode") === "true";
  if (darkMode) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
};

// Call it before rendering
initializeDarkMode();

function Layout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  
  return (
    <div className="app-base">
      <div className="min-h-screen bg-background">
        <nav className="border-b sticky top-0 bg-background z-50">
          <div className="app-container">
            <div className="flex h-16 items-center justify-center">
              <div className="flex items-center w-full justify-between gap-1">
                <NavItem href="/" icon={<Home size={16} />} label="Home" />
                <NavItem href="/active" icon={<Activity size={16} />} label="Active" />
                <NavItem href="/history" icon={<History size={16} />} label="History" />
                <NavItem href="/substances" icon={<Pill size={16} />} label="Substances" />
                <NavItem href="/settings" icon={<Settings size={16} />} label="Settings" />
              </div>
            </div>
          </div>
        </nav>
        <main className="app-container py-4">{children}</main>
        <Toaster />
      </div>
    </div>
  );
}

// Navigation item component with icon and responsive text
function NavItem({ 
  href, 
  icon, 
  label 
}: { 
  href: string; 
  icon: React.ReactNode; 
  label: string 
}) {
  const isMobile = useIsMobile();
  
  return (
    <Link href={href}>
      <div className="flex flex-col items-center justify-center hover:text-primary transition-colors cursor-pointer py-1 px-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md">
        <span className="text-gray-600 dark:text-gray-300">{icon}</span>
        <span className={`${isMobile ? 'text-[10px]' : 'text-xs'} transition-all`}>
          {label}
        </span>
      </div>
    </Link>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SWRConfig value={{ fetcher }}>
      <DoseProvider>
        <Layout>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/active" component={ActivePage} />
            <Route path="/history" component={HistoryPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/substances" component={SubstancesPage} />
            <Route path="/substances/:id" component={SubstanceDetailPage} />
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
