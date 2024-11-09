import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDoses } from '@/lib/db';
import type { DoseEntry } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';

export function DoseHistory() {
  const [doses, setDoses] = useState<DoseEntry[]>([]);

  useEffect(() => {
    const loadDoses = async () => {
      const loadedDoses = await getDoses();
      setDoses(loadedDoses.reverse());
    };
    loadDoses();
  }, []);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-4">
        <h2 className="text-xl font-bold mb-4">Recent Doses</h2>
        <ScrollArea className="h-[400px] w-full">
          <AnimatePresence>
            {doses.map((dose, index) => (
              <motion.div
                key={dose.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
                className="mb-4"
              >
                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold">{dose.substance}</h3>
                        <p className="text-sm text-muted-foreground">
                          {dose.amount}mg via {dose.route}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(dose.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
