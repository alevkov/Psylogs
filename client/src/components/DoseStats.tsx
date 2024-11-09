import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getDoses } from '@/lib/db';
import type { DoseEntry } from '@/lib/constants';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export function DoseStats() {
  const [stats, setStats] = useState<{
    totalDoses: number;
    uniqueSubstances: number;
    averageDose: number;
    recentActivity: { name: string; amount: number; }[];
  }>({
    totalDoses: 0,
    uniqueSubstances: 0,
    averageDose: 0,
    recentActivity: [],
  });

  useEffect(() => {
    const calculateStats = async () => {
      const doses = await getDoses();
      const substances = new Set(doses.map(d => d.substance));
      const total = doses.reduce((sum, d) => sum + d.amount, 0);
      
      // Calculate recent activity
      const last7Days = doses
        .filter(d => d.timestamp > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .reduce((acc, dose) => {
          const day = dose.timestamp.toLocaleDateString();
          acc[day] = (acc[day] || 0) + dose.amount;
          return acc;
        }, {} as Record<string, number>);

      const recentActivity = Object.entries(last7Days).map(([name, amount]) => ({
        name,
        amount,
      }));

      setStats({
        totalDoses: doses.length,
        uniqueSubstances: substances.size,
        averageDose: doses.length ? total / doses.length : 0,
        recentActivity,
      });
    };

    calculateStats();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="font-semibold">Total Doses</CardHeader>
          <CardContent>
            <span className="text-2xl">{stats.totalDoses}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="font-semibold">Unique Substances</CardHeader>
          <CardContent>
            <span className="text-2xl">{stats.uniqueSubstances}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="font-semibold">Average Dose</CardHeader>
          <CardContent>
            <span className="text-2xl">{stats.averageDose.toFixed(1)}mg</span>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="font-semibold">Recent Activity</CardHeader>
        <CardContent className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.recentActivity}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="amount" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
