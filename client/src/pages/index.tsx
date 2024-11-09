import { DoseForm } from '@/components/DoseForm';
import { DoseHistory } from '@/components/DoseHistory';
import { motion } from 'framer-motion';

export default function HomePage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="container mx-auto px-4 py-8"
    >
      <h1 className="text-4xl font-bold text-center mb-8 text-foreground">Psylo.gs</h1>
      <div className="max-w-4xl mx-auto space-y-8">
        <DoseForm />
        <DoseHistory />
      </div>
    </motion.div>
  );
}
