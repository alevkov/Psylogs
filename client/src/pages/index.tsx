import React from 'react';
import { DoseForm } from '../components/DoseForm';
import { DoseHistory } from '../components/DoseHistory';
import { motion } from 'framer-motion';
import { useIsMobile } from '../hooks/use-mobile';

export default function HomePage() {
  const isMobile = useIsMobile();
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full h-[100vh] flex flex-col"
    >
      {!isMobile && <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-4 sm:mb-6 md:mb-8 text-foreground">Psylo.gs</h1>}
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col overflow-hidden">
        <div className="sticky top-0 z-10 bg-background pb-3 shadow-sm">
          <DoseForm />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto mt-2">
          <DoseHistory />
        </div>
      </div>
    </motion.div>
  );
}
