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
      className="w-full h-full flex flex-col"
    >
      {!isMobile && <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-4 sm:mb-6 md:mb-8 text-foreground">Psylo.gs</h1>}
      <div className={`max-w-4xl mx-auto w-full ${isMobile ? 'flex-1 flex flex-col h-[calc(100vh-3rem)]' : ''}`}>
        <div className={`${isMobile ? 'mb-3' : ''}`}>
          <DoseForm />
        </div>
        <div className={`${isMobile ? 'flex-1 min-h-0' : 'mt-3 sm:mt-4 md:mt-6'}`}>
          <DoseHistory />
        </div>
      </div>
    </motion.div>
  );
}
