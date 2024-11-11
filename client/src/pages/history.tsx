import { DoseStats } from '@/components/DoseStats';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { exportData, importData, importPWJournalData } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function HistoryPage() {
  const { toast } = useToast();
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importData(file);
      toast({
        title: "Data imported successfully",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Error importing data",
        description: "Please ensure the file is a valid JSON export",
        variant: "destructive",
      });
    }
  };

  const handlePWJournalImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        description: error instanceof Error ? error.message : "Unknown error occurred",
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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">History & Stats</h1>
          <div className="space-x-4">
            <Button onClick={exportData}>Export Data</Button>
            <Button
              variant="outline"
              onClick={() => document.getElementById('import-input')?.click()}
              disabled={isImporting}
            >
              Import Data
            </Button>
            <Button
              variant="outline"
              onClick={() => document.getElementById('pw-journal-import')?.click()}
              disabled={isImporting}
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                'Import PW Journal Data'
              )}
            </Button>
            <input
              id="import-input"
              type="file"
              accept=".json"
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