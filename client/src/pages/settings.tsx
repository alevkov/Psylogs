import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { clearDoses } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

export default function SettingsPage() {
  const { toast } = useToast();

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("darkMode") === "true",
  );

  // Ensure the theme is set correctly on initial load
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  const toggleTheme = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    document.documentElement.classList.toggle("dark");
    localStorage.setItem("darkMode", newDarkMode);
  };

  const handleClearData = async () => {
    if (
      confirm("Are you sure you want to clear all data? This cannot be undone.")
    ) {
      await clearDoses();
      toast({
        title: "Data cleared successfully",
        duration: 2000,
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="container mx-auto px-4 py-8"
    >
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Settings</h1>

        <div className="space-y-4">
          <Card>
            <CardHeader>Appearance</CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span>Dark Mode</span>
                <Switch checked={darkMode} onCheckedChange={toggleTheme} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>Data Management</CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleClearData}>
                Clear All Data
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
