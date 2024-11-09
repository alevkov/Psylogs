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
  Legend,
  CartesianGrid
} from 'recharts';
import { format, startOfMonth, eachMonthOfInterval, subMonths, differenceInHours } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

// Generate colors for charts
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD',
  '#D4A5A5', '#9E9E9E', '#58B19F', '#FFD93D', '#6C5B7B'
];

// Safety thresholds (in hours)
const SAFETY_THRESHOLDS: Record<string, number> = {
  default: 24, // Default minimum hours between doses
  high_risk: 12 // High-risk threshold for frequent dosing
};

interface Stats {
  totalDoses: number;
  uniqueSubstances: number;
  averageDose: number;
  recentActivity: { name: string; amount: number }[];
  substanceDistribution: { name: string; value: number }[];
  monthlyTrends: { name: string; doses: number }[];
  routeDistribution: { name: string; value: number }[];
  timeDistribution: { name: string; count: number }[];
  safetyAlerts: Array<{
    substance: string;
    message: string;
    severity: 'warning' | 'error';
  }>;
  frequencyBySubstance: Array<{
    substance: string;
    daily: number;
    weekly: number;
    monthly: number;
  }>;
  combinationPatterns: Array<{
    combination: string;
    count: number;
  }>;
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
    safetyAlerts: [],
    frequencyBySubstance: [],
    combinationPatterns: []
  });

  useEffect(() => {
    const calculateStats = async () => {
      const doses = await getDoses();
      
      // Basic stats calculation
      const substances = new Set(doses.map(d => d.substance));
      const total = doses.reduce((sum, d) => sum + d.amount, 0);

      // Safety analysis
      const safetyAlerts = [];
      const now = new Date();
      const recentDoses = doses.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Check for frequent dosing
      const substanceLastDoses = new Map<string, Date>();
      for (const dose of recentDoses) {
        const lastDose = substanceLastDoses.get(dose.substance);
        if (lastDose) {
          const hoursSinceLastDose = differenceInHours(now, new Date(dose.timestamp));
          const threshold = SAFETY_THRESHOLDS.default;
          
          if (hoursSinceLastDose < threshold) {
            safetyAlerts.push({
              substance: dose.substance,
              message: `Frequent dosing detected: ${hoursSinceLastDose} hours between doses`,
              severity: hoursSinceLastDose < SAFETY_THRESHOLDS.high_risk ? 'error' : 'warning'
            });
          }
        }
        substanceLastDoses.set(dose.substance, new Date(dose.timestamp));
      }

      // Calculate frequency by substance
      const frequencyBySubstance = Array.from(substances).map(substance => {
        const substanceDoses = doses.filter(d => d.substance === substance);
        const now = new Date();
        const daily = substanceDoses.filter(d => 
          differenceInHours(now, new Date(d.timestamp)) <= 24
        ).length;
        const weekly = substanceDoses.filter(d => 
          differenceInHours(now, new Date(d.timestamp)) <= 24 * 7
        ).length;
        const monthly = substanceDoses.filter(d => 
          differenceInHours(now, new Date(d.timestamp)) <= 24 * 30
        ).length;

        return { substance, daily, weekly, monthly };
      }).sort((a, b) => b.monthly - a.monthly);

      // Calculate combination patterns
      const combinations = new Map<string, number>();
      const timeWindow = 24; // hours
      for (let i = 0; i < doses.length; i++) {
        const currentDose = doses[i];
        const windowStart = new Date(currentDose.timestamp);
        const windowEnd = new Date(windowStart.getTime() + timeWindow * 60 * 60 * 1000);
        
        const concurrent = doses.filter(d => 
          d !== currentDose &&
          new Date(d.timestamp) >= windowStart &&
          new Date(d.timestamp) <= windowEnd
        );

        for (const other of concurrent) {
          const combo = [currentDose.substance, other.substance]
            .sort()
            .join(' + ');
          combinations.set(combo, (combinations.get(combo) || 0) + 1);
        }
      }

      const combinationPatterns = Array.from(combinations.entries())
        .map(([combination, count]) => ({ combination, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Original stats calculations...
      const last7Days = doses
        .filter(d => d.timestamp > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .reduce((acc, dose) => {
          const day = format(new Date(dose.timestamp), 'MMM d');
          acc[day] = (acc[day] || 0) + dose.amount;
          return acc;
        }, {} as Record<string, number>);

      const substanceCount = doses.reduce((acc, dose) => {
        acc[dose.substance] = (acc[dose.substance] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

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

      const routeCount = doses.reduce((acc, dose) => {
        acc[dose.route] = (acc[dose.route] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

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
        safetyAlerts,
        frequencyBySubstance,
        combinationPatterns
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
      {/* Safety Alerts */}
      {stats.safetyAlerts.length > 0 && (
        <div className="space-y-2">
          {stats.safetyAlerts.map((alert, index) => (
            <Alert key={index} variant={alert.severity === 'error' ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Safety Alert - {alert.substance}</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Summary Cards */}
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

      {/* Detailed Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Monthly Trends */}
        <Card>
          <CardHeader className="font-semibold">Monthly Trends</CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" />
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
                <CartesianGrid strokeDasharray="3 3" />
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
                <CartesianGrid strokeDasharray="3 3" />
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

        {/* Frequency Analysis */}
        <Card>
          <CardHeader className="font-semibold">Substance Frequency</CardHeader>
          <CardContent className="h-[300px] overflow-auto">
            <div className="space-y-4">
              {stats.frequencyBySubstance.map((item, index) => (
                <div key={index} className="space-y-2">
                  <h4 className="font-medium">{item.substance}</h4>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>Daily: {item.daily}</div>
                    <div>Weekly: {item.weekly}</div>
                    <div>Monthly: {item.monthly}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Combination Patterns */}
        <Card>
          <CardHeader className="font-semibold">Common Combinations (24h window)</CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.combinationPatterns} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="combination" type="category" width={150} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
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
              <CartesianGrid strokeDasharray="3 3" />
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
