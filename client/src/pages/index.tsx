import React from 'react';
import { DoseForm } from '../components/DoseForm';
import { DoseHistory } from '../components/DoseHistory';
import { motion } from 'framer-motion';

export default function HomePage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full"
    >
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-4 sm:mb-6 md:mb-8 text-foreground">Psylo.gs</h1>
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
        <DoseForm />
        <DoseHistory />
      </div>
    </motion.div>
  );
}
