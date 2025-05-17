import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Switch } from "../components/ui/switch";
import { clearAllData } from "../lib/db";
import { useToast } from "../hooks/use-toast";

export default function SettingsPage() {
  const { toast } = useToast();

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("darkMode") === "true",
  );

  const [hideTimestampButtons, setHideTimestampButtons] = useState(
    () => localStorage.getItem("hideTimestampButtons") === "true",
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
    localStorage.setItem("darkMode", String(newDarkMode));
  };

  const toggleTimestampButtons = () => {
    const newHideTimestampButtons = !hideTimestampButtons;
    setHideTimestampButtons(newHideTimestampButtons);
    localStorage.setItem(
      "hideTimestampButtons",
      String(newHideTimestampButtons),
    );
  };

  const handleClearData = async () => {
    if (
      confirm(
        "Are you sure you want to clear all data (doses, dose notes, and general notes)? This action cannot be undone.",
      )
    ) {
      await clearAllData();
      toast({
        title: "All data cleared successfully",
        description:
          "All doses, dose notes, and general notes have been removed",
        duration: 3000,
        variant: "success",
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full"
    >
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6">
          Settings
        </h1>

        <div className="space-y-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">Appearance</CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Dark Mode</span>
                  <Switch checked={darkMode} onCheckedChange={toggleTheme} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    Hide (Onset) (Peak) (Offset) Buttons
                  </span>

                  <Switch
                    checked={hideTimestampButtons}
                    onCheckedChange={toggleTimestampButtons}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 sm:p-6">Data Management</CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <Button
                variant="destructive"
                onClick={handleClearData}
                className="w-full sm:w-auto"
              >
                Clear All Data
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
