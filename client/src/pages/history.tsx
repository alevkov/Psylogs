import { DoseStats } from "@/components/DoseStats";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  exportData,
  importData,
  importPWJournalData,
  importDataFromTextFile,
} from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Loader2, Download, Upload, FileInput } from "lucide-react";

export default function HistoryPage() {
  const { toast } = useToast();
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Read the file content
      const text = await file.text();

      // Check if the content starts with '{' or '[', which indicates standard JSON
      const trimmedText = text.trim();
      if (trimmedText.startsWith("{") || trimmedText.startsWith("[")) {
        // Likely a valid JSON object or array
        await importData(file); // Call the standard import function
      } else {
        // Handle newline-separated JSON objects
        const lines = trimmedText.split("\n").filter(line => line.trim()); // Remove empty lines
        const doses = lines.map((line, index) => {
          try {
            return JSON.parse(line); // Parse each line as a JSON object
          } catch (error) {
            throw new Error(`Error parsing JSON on line ${index + 1}: ${error.message}`);
          }
        });

        // Call the function to handle newline-separated JSON
        await importDataFromTextFile(doses); // Pass parsed doses to the custom import function
      }

      toast({
        title: "Data imported successfully",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Error importing data",
        description: error instanceof Error ? error.message : "Invalid file format",
        variant: "destructive",
      });
    }
  };


  const handlePWJournalImport = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await importPWJournalData(file);
      toast({
        title: "PW Journal data imported successfully",
        description: result.message,
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error importing PW Journal data",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="container mx-auto px-4 py-8"
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold">History & Stats</h1>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
            <Button
              onClick={exportData}
              className="w-full sm:w-auto flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export Data
            </Button>
            <Button
              variant="outline"
              onClick={() => document.getElementById("import-input")?.click()}
              disabled={isImporting}
              className="w-full sm:w-auto flex items-center justify-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Import Data
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                document.getElementById("pw-journal-import")?.click()
              }
              disabled={isImporting}
              className="w-full sm:w-auto flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FileInput className="h-4 w-4" />
                  Import PW Journal
                </>
              )}
            </Button>
            <input
              id="import-input"
              type="file"
              accept=".json, .txt"
              className="hidden"
              onChange={handleImport}
            />
            <input
              id="pw-journal-import"
              type="file"
              accept=".json"
              className="hidden"
              onChange={handlePWJournalImport}
            />
          </div>
        </div>
        <DoseStats />
      </div>
    </motion.div>
  );
}
