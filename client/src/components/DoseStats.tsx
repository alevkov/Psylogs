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
import { format, startOfMonth, eachMonthOfInterval, subMonths, differenceInHours, differenceInDays } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, TrendingDown, TrendingUp, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  mostCommonRoute: {
    route: string;
    count: number;
    percentage: number;
  };
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
  substanceAnalysis: Array<{
    substance: string;
    minDose: number;
    maxDose: number;
    avgDose: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    timeBetweenDoses: number;
    lastDose: Date;
    dosesCount: number;
  }>;
}

export function DoseStats() {
  const [stats, setStats] = useState<Stats>({
    totalDoses: 0,
    uniqueSubstances: 0,
    mostCommonRoute: { route: '', count: 0, percentage: 0 },
    recentActivity: [],
    substanceDistribution: [],
    monthlyTrends: [],
    routeDistribution: [],
    timeDistribution: [],
    safetyAlerts: [],
    substanceAnalysis: []
  });

  useEffect(() => {
    const calculateStats = async () => {
      const doses = await getDoses();
      
      // Basic stats calculation
      const substances = new Set(doses.map(d => d.substance));
      
      // Calculate most common route
      const routeCount = doses.reduce((acc, dose) => {
        acc[dose.route] = (acc[dose.route] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const mostCommonRoute = Object.entries(routeCount)
        .sort((a, b) => b[1] - a[1])[0];

      // Substance-specific analysis
      const substanceAnalysis = Array.from(substances).map(substance => {
        const substanceDoses = doses.filter(d => d.substance === substance)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Calculate dose statistics
        const doseAmounts = substanceDoses.map(d => d.amount);
        const minDose = Math.min(...doseAmounts);
        const maxDose = Math.max(...doseAmounts);
        const avgDose = doseAmounts.reduce((a, b) => a + b, 0) / doseAmounts.length;

        // Calculate trend
        const recentDoses = substanceDoses.slice(0, Math.min(5, substanceDoses.length));
        const trend = recentDoses.length > 1
          ? recentDoses[0].amount > recentDoses[recentDoses.length - 1].amount
            ? 'increasing'
            : recentDoses[0].amount < recentDoses[recentDoses.length - 1].amount
              ? 'decreasing'
              : 'stable'
          : 'stable';

        // Calculate average time between doses
        let totalTimeBetween = 0;
        for (let i = 1; i < substanceDoses.length; i++) {
          totalTimeBetween += differenceInHours(
            new Date(substanceDoses[i - 1].timestamp),
            new Date(substanceDoses[i].timestamp)
          );
        }
        const timeBetweenDoses = substanceDoses.length > 1
          ? totalTimeBetween / (substanceDoses.length - 1)
          : 0;

        return {
          substance,
          minDose,
          maxDose,
          avgDose,
          trend,
          timeBetweenDoses,
          lastDose: new Date(substanceDoses[0]?.timestamp || 0),
          dosesCount: substanceDoses.length
        };
      }).sort((a, b) => b.dosesCount - a.dosesCount);

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

      // Calculate other stats
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

      const timeCount = doses.reduce((acc, dose) => {
        const hour = new Date(dose.timestamp).getHours();
        const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
        acc[timeSlot] = (acc[timeSlot] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      setStats({
        totalDoses: doses.length,
        uniqueSubstances: substances.size,
        mostCommonRoute: {
          route: mostCommonRoute[0],
          count: mostCommonRoute[1],
          percentage: (mostCommonRoute[1] / doses.length) * 100
        },
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
        substanceAnalysis
      });
    };

    calculateStats();
  }, []);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'decreasing':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <ArrowRight className="h-4 w-4 text-yellow-500" />;
    }
  };

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
          <CardHeader className="font-semibold">Most Common Route</CardHeader>
          <CardContent>
            <div className="flex flex-col">
              <span className="text-2xl capitalize">{stats.mostCommonRoute.route}</span>
              <span className="text-sm text-muted-foreground">
                {stats.mostCommonRoute.count} doses ({stats.mostCommonRoute.percentage.toFixed(1)}%)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Substance Analysis */}
      <Card>
        <CardHeader className="font-semibold">Substance Analysis</CardHeader>
        <CardContent className="space-y-6">
          {stats.substanceAnalysis.map((analysis, index) => (
            <div key={index} className="space-y-2 border-b last:border-0 pb-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-lg">{analysis.substance}</h4>
                <div className="flex items-center gap-2">
                  {getTrendIcon(analysis.trend)}
                  <Badge variant="outline">
                    {analysis.dosesCount} doses
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Dose Range:</span>
                  <br />
                  {analysis.minDose.toFixed(1)} - {analysis.maxDose.toFixed(1)}mg
                </div>
                <div>
                  <span className="text-muted-foreground">Average Dose:</span>
                  <br />
                  {analysis.avgDose.toFixed(1)}mg
                </div>
                <div>
                  <span className="text-muted-foreground">Time Between:</span>
                  <br />
                  {analysis.timeBetweenDoses.toFixed(1)} hours
                </div>
                <div>
                  <span className="text-muted-foreground">Last Dose:</span>
                  <br />
                  {differenceInDays(new Date(), analysis.lastDose)} days ago
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Charts Section */}
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
