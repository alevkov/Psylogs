import React, { useState, useEffect } from "react";
import { DoseStats } from "../components/DoseStats";
import { GeneralNotesTimeline } from "../components/GeneralNotesTimeline";
import { motion } from "framer-motion";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import {
  exportData,
  importData,
  importPWJournalData,
  importDataFromTextFile,
  getDoses,
  analyzeJSONFile,
  getGeneralNotes,
} from "../lib/db";
import { useToast } from "../hooks/use-toast";
import { useDoseContext } from "../contexts/DoseContext";
import {
  Loader2,
  Download,
  Upload,
  FileInput,
  Activity,
  AlertCircle,
  ClipboardList,
} from "lucide-react";
import { GeneralNote } from "../lib/constants";

// Empty state message component
function EmptyStateMessage() {
  return (
    <div className="w-full mb-4 relative">
      <Card className="w-full overflow-visible">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <Activity className="h-16 w-16 text-muted-foreground opacity-40" />
            <h3 className="text-xl font-medium">No Dose Data Available</h3>
            <p className="text-muted-foreground max-w-md">
              Add your first dose from the form on the home page to begin
              tracking your medication history
            </p>
            <Button
              onClick={() => (window.location.href = "/")}
              className="mt-4"
            >
              Go to Home Page
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function HistoryPage() {
  const { toast } = useToast();
  const { triggerUpdate } = useDoseContext();
  const [isImporting, setIsImporting] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("stats");
  const [generalNotes, setGeneralNotes] = useState<GeneralNote[]>([]);
  const [notesCount, setNotesCount] = useState(0);

  // Check if there is dose data and load general notes
  useEffect(() => {
    async function loadData() {
      try {
        // Get dose data
        const dosesResult = await getDoses();
        // Handle both array and object with doses property
        const doses = Array.isArray(dosesResult)
          ? dosesResult
          : dosesResult.doses;
        setHasData(doses && doses.length > 0);

        // Get general notes
        const notesResult = await getGeneralNotes();
        setGeneralNotes(notesResult.notes);
        setNotesCount(notesResult.total);
      } catch (error) {
        console.error("Error loading data:", error);
        setHasData(false);
      }
    }

    loadData();
  }, [triggerUpdate]); // Re-check when data is updated

  // Function to refresh notes when changes occur
  const handleNotesChange = async () => {
    try {
      const notesResult = await getGeneralNotes();
      setGeneralNotes(notesResult.notes);
      setNotesCount(notesResult.total);
    } catch (error) {
      console.error("Error refreshing notes:", error);
    }
  };

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
        // This is a newline-separated JSON file
        // Create a new blob with the text content and pass it as a File object
        const textBlob = new Blob([trimmedText], { type: "text/plain" });
        const textFile = new File([textBlob], "import.txt", {
          type: "text/plain",
        });

        // Call the function to handle newline-separated JSON
        await importDataFromTextFile(textFile);
      }

      setIsImporting(false);
      triggerUpdate();
      toast({
        title: "✅ Data imported successfully",
        description: "Your dose history has been updated",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error importing data",
        description:
          error instanceof Error ? error.message : "Invalid file format",
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
      triggerUpdate();
      toast({
        title: "✅ PW Journal data imported successfully",
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

  // Helper function to analyze a file format before importing
  const handleAnalyzeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    try {
      const analysis = await analyzeJSONFile(file);

      // Show analysis result
      if (analysis.isValid) {
        toast({
          title: "File Analysis Result",
          description: `Format: ${analysis.format}
                       ${analysis.sample ? `Sample data: ${JSON.stringify(analysis.sample, null, 2).substring(0, 200)}...` : "No sample data available"}`,
          duration: 10000,
        });
      } else {
        toast({
          title: "Invalid JSON File",
          description:
            analysis.error || "The file could not be parsed as valid JSON",
          variant: "destructive",
          duration: 5000,
        });
      }
    } catch (error) {
      toast({
        title: "Error analyzing file",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);

      // Reset the file input
      const fileInput = document.getElementById(
        "analyze-file",
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full"
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 sm:mb-6">
          <h1 className="text-xl sm:text-2xl md:text-4xl font-bold hidden sm:block">
            History & Stats
          </h1>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="grid grid-cols-2 sm:flex gap-2">
              <h1 className="text-base font-bold col-span-2 sm:hidden mb-1 -mt-1">
                History
              </h1>
              <Button
                onClick={exportData}
                className="flex items-center justify-center gap-1 text-sm h-9"
                size="sm"
              >
                <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>Export</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => document.getElementById("import-input")?.click()}
                disabled={isImporting}
                className="flex items-center justify-center gap-1 text-sm h-9"
                size="sm"
              >
                <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>Import</span>
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  document.getElementById("pw-journal-import")?.click()
                }
                disabled={isImporting}
                className="flex items-center justify-center gap-1 text-sm h-9 col-span-2 sm:col-span-1"
                size="sm"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <FileInput className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span>PW Journal</span>
                  </>
                )}
              </Button>
              {/* <Button
                variant="outline"
                onClick={() =>
                  document.getElementById("analyze-file")?.click()
                }
                disabled={isAnalyzing}
                className="flex items-center justify-center gap-1 text-sm h-9 col-span-2 sm:col-span-1"
                size="sm"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span>Analyze File</span>
                  </>
                )}
              </Button> */}
            </div>
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
            {/* <input
              id="analyze-file"
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleAnalyzeFile}
            /> */}
          </div>
        </div>

        {hasData || notesCount > 0 ? (
          <Tabs
            defaultValue="stats"
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="mb-4">
              <TabsTrigger value="stats" className="flex items-center gap-1">
                <Activity className="h-4 w-4" />
                <span>Stats</span>
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex items-center gap-1">
                <ClipboardList className="h-4 w-4" />
                <span>Notes {notesCount > 0 ? `(${notesCount})` : ""}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stats" className="w-full">
              {hasData ? (
                <DoseStats />
              ) : (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-center text-muted-foreground">
                      No dose data available. Add doses to see statistics.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="notes" className="w-full">
              <Card>
                <CardContent className="p-6">
                  <GeneralNotesTimeline
                    notes={generalNotes}
                    onNotesChange={handleNotesChange}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <EmptyStateMessage />
        )}
      </div>
    </motion.div>
  );
}
