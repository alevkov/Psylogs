import { DoseStats } from '@/components/DoseStats';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { exportData, importData } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';

export default function HistoryPage() {
  const { toast } = useToast();

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
            >
              Import Data
            </Button>
            <input
              id="import-input"
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
        </div>
        <DoseStats />
      </div>
    </motion.div>
  );
}
