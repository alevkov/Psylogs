import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDoses } from '@/lib/db';
import type { DoseEntry } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useDoseContext } from '@/contexts/DoseContext';

// Generate consistent colors for substances
const getSubstanceColor = (substance: string) => {
  let hash = 0;
  for (let i = 0; i < substance.length; i++) {
    hash = substance.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 90%)`;
};

export function DoseHistory() {
  const [doses, setDoses] = useState<DoseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoStack, setUndoStack] = useState<DoseEntry[]>([]);
  const { toast } = useToast();
  const { updateTrigger } = useDoseContext();

  useEffect(() => {
    const loadDoses = async () => {
      try {
        const loadedDoses = await getDoses();
        setDoses(loadedDoses.reverse());
      } catch (error) {
        console.error('Error loading doses:', error);
      } finally {
        setLoading(false);
      }
    };
    loadDoses();
  }, [updateTrigger]); // Add updateTrigger as dependency

  const handleUndo = async () => {
    if (undoStack.length === 0) return;

    const lastDose = undoStack[undoStack.length - 1];
    try {
      // Remove from undo stack
      setUndoStack(prev => prev.slice(0, -1));
      // Remove from doses
      setDoses(prev => prev.filter(d => d.id !== lastDose.id));

      toast({
        title: "Dose removed",
        description: "The last dose has been removed",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error removing dose",
        description: "Could not remove the dose",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-4">
          <div className="flex items-center justify-center h-[400px]">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Recent Doses</h2>
          {undoStack.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleUndo}>
              Undo Last Action
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px] w-full">
          <AnimatePresence>
            {doses.map((dose, index) => (
              <motion.div
                key={dose.id || index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
                className="mb-4 relative"
              >
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="relative"
                >
                  <Card
                    style={{
                      backgroundColor: getSubstanceColor(dose.substance),
                      transition: 'all 0.2s ease-in-out',
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold">{dose.substance}</h3>
                          <p className="text-sm text-muted-foreground">
                            {dose.amount}mg via {dose.route}
                          </p>
                          {!navigator.onLine && dose.id === undefined && (
                            <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full">
                              Pending Sync
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(dose.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
          {doses.length === 0 && (
            <div className="text-center text-muted-foreground p-4">
              No doses logged yet
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
