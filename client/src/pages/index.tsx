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
      className="w-full"
    >
      {!isMobile && <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-4 sm:mb-6 md:mb-8 text-foreground">Psylo.gs</h1>}
      <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4 md:space-y-6">
        <DoseForm />
        <DoseHistory />
      </div>
    </motion.div>
  );
}
