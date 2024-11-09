import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getDoses } from '@/lib/db';
import type { DoseEntry } from '@/lib/constants';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { 
  BarChart, 
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { format, startOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';

// Generate colors for charts
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD',
  '#D4A5A5', '#9E9E9E', '#58B19F', '#FFD93D', '#6C5B7B'
];

interface Stats {
  totalDoses: number;
  uniqueSubstances: number;
  averageDose: number;
  recentActivity: { name: string; amount: number }[];
  substanceDistribution: { name: string; value: number }[];
  monthlyTrends: { name: string; doses: number }[];
  routeDistribution: { name: string; value: number }[];
  timeDistribution: { name: string; count: number }[];
}

export function DoseStats() {
  const [stats, setStats] = useState<Stats>({
    totalDoses: 0,
    uniqueSubstances: 0,
    averageDose: 0,
    recentActivity: [],
    substanceDistribution: [],
    monthlyTrends: [],
    routeDistribution: [],
    timeDistribution: [],
  });

  useEffect(() => {
    const calculateStats = async () => {
      const doses = await getDoses();
      const substances = new Set(doses.map(d => d.substance));
      const total = doses.reduce((sum, d) => sum + d.amount, 0);
      
      // Calculate recent activity (last 7 days)
      const last7Days = doses
        .filter(d => d.timestamp > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .reduce((acc, dose) => {
          const day = format(new Date(dose.timestamp), 'MMM d');
          acc[day] = (acc[day] || 0) + dose.amount;
          return acc;
        }, {} as Record<string, number>);

      // Calculate substance distribution
      const substanceCount = doses.reduce((acc, dose) => {
        acc[dose.substance] = (acc[dose.substance] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate monthly trends
      const sixMonthsAgo = subMonths(new Date(), 6);
      const monthRange = eachMonthOfInterval({
        start: sixMonthsAgo,
        end: new Date()
      });

      const monthlyData = monthRange.map(month => {
        const monthDoses = doses.filter(dose => 
          startOfMonth(new Date(dose.timestamp)).getTime() === startOfMonth(month).getTime()
        ).length;
        return {
          name: format(month, 'MMM yy'),
          doses: monthDoses
        };
      });

      // Calculate route distribution
      const routeCount = doses.reduce((acc, dose) => {
        acc[dose.route] = (acc[dose.route] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate time of day distribution
      const timeCount = doses.reduce((acc, dose) => {
        const hour = new Date(dose.timestamp).getHours();
        const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
        acc[timeSlot] = (acc[timeSlot] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      setStats({
        totalDoses: doses.length,
        uniqueSubstances: substances.size,
        averageDose: doses.length ? total / doses.length : 0,
        recentActivity: Object.entries(last7Days).map(([name, amount]) => ({ name, amount })),
        substanceDistribution: Object.entries(substanceCount)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        monthlyTrends: monthlyData,
        routeDistribution: Object.entries(routeCount)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
        timeDistribution: Object.entries(timeCount)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    };

    calculateStats();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
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

      <div className="grid gap-6 md:grid-cols-2">
        {/* Monthly Trends */}
        <Card>
          <CardHeader className="font-semibold">Monthly Trends</CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.monthlyTrends}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="doses" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Substance Distribution */}
        <Card>
          <CardHeader className="font-semibold">Top Substances</CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.substanceDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {stats.substanceDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Route Distribution */}
        <Card>
          <CardHeader className="font-semibold">Administration Routes</CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.routeDistribution}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))">
                  {stats.routeDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Time Distribution */}
        <Card>
          <CardHeader className="font-semibold">Time of Day Patterns</CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.timeDistribution}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
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
