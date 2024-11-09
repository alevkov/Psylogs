import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getDoses } from '@/lib/db';
import type { DoseEntry } from '@/lib/constants';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';
import { 
  format, 
  startOfMonth, 
  eachMonthOfInterval, 
  subMonths, 
  differenceInHours, 
  differenceInDays,
  addDays
} from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, TrendingDown, TrendingUp, ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Calendar } from '@nivo/calendar';
import { 
  calculateTimeCorrelations,
  analyzeUsagePatterns,
  generateUsageForecast,
  analyzeSubstanceInteractions,
  generateCalendarData,
  calculateRecoveryPeriods,
  INTERACTION_THRESHOLDS
} from '@/lib/analysis';

// Generate colors for charts
const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD',
  '#D4A5A5', '#9E9E9E', '#58B19F', '#FFD93D', '#6C5B7B'
];

interface Stats {
  timeCorrelations: ReturnType<typeof calculateTimeCorrelations>;
  usagePatterns: ReturnType<typeof analyzeUsagePatterns>;
  usageForecasts: ReturnType<typeof generateUsageForecast>;
  substanceInteractions: ReturnType<typeof analyzeSubstanceInteractions>;
  calendarData: ReturnType<typeof generateCalendarData>;
  recoveryPeriods: ReturnType<typeof calculateRecoveryPeriods>;
  totalDoses: number;
  uniqueSubstances: number;
  monthlyTrends: Array<{ name: string; doses: number }>;
  substanceDistribution: Array<{ name: string; value: number }>;
  routeDistribution: Array<{ name: string; value: number }>;
  timeDistribution: Array<{ name: string; count: number }>;
  recentActivity: Array<{ name: string; amount: number }>;
}

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

export function DoseStats() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    timeCorrelations: [],
    usagePatterns: [],
    usageForecasts: [],
    substanceInteractions: [],
    calendarData: [],
    recoveryPeriods: [],
    totalDoses: 0,
    uniqueSubstances: 0,
    monthlyTrends: [],
    substanceDistribution: [],
    routeDistribution: [],
    timeDistribution: [],
    recentActivity: []
  });

  useEffect(() => {
    const calculateStats = async () => {
      try {
        setLoading(true);
        const doses = await getDoses();
        
        // Calculate basic stats
        const substances = new Set(doses.map(d => d.substance));
        const routeCount = doses.reduce((acc, dose) => {
          acc[dose.route] = (acc[dose.route] || 0) + 1;
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

        // Calculate substance distribution
        const substanceCount = doses.reduce((acc, dose) => {
          acc[dose.substance] = (acc[dose.substance] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        // Calculate time distribution
        const timeCount = doses.reduce((acc, dose) => {
          const hour = new Date(dose.timestamp).getHours();
          const timeSlot = `${hour.toString().padStart(2, '0')}:00`;
          acc[timeSlot] = (acc[timeSlot] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        // Calculate recent activity
        const last7Days = doses
          .filter(d => d.timestamp > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          .reduce((acc, dose) => {
            const day = format(new Date(dose.timestamp), 'MMM d');
            acc[day] = (acc[day] || 0) + dose.amount;
            return acc;
          }, {} as Record<string, number>);

        // Calculate advanced statistics
        const timeCorrelations = calculateTimeCorrelations(doses);
        const usagePatterns = analyzeUsagePatterns(doses);
        const usageForecasts = generateUsageForecast(doses);
        const substanceInteractions = analyzeSubstanceInteractions(doses);
        const calendarData = generateCalendarData(doses);
        const recoveryPeriods = calculateRecoveryPeriods(doses);

        setStats({
          timeCorrelations,
          usagePatterns,
          usageForecasts,
          substanceInteractions,
          calendarData,
          recoveryPeriods,
          totalDoses: doses.length,
          uniqueSubstances: substances.size,
          monthlyTrends: monthlyData,
          substanceDistribution: Object.entries(substanceCount)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10),
          routeDistribution: Object.entries(routeCount)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value),
          timeDistribution: Object.entries(timeCount)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          recentActivity: Object.entries(last7Days)
            .map(([name, amount]) => ({ name, amount }))
        });
      } catch (error) {
        console.error('Error calculating stats:', error);
      } finally {
        setLoading(false);
      }
    };

    calculateStats();
  }, []);

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!stats.calendarData.length) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 text-center text-muted-foreground">
          No dose data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="patterns">Patterns</TabsTrigger>
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
        <TabsTrigger value="safety">Safety</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        {/* Basic Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
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
            <CardHeader className="font-semibold">Active Period</CardHeader>
            <CardContent>
              <span className="text-2xl">{stats.monthlyTrends.length} months</span>
            </CardContent>
          </Card>
        </div>

        {/* Calendar View */}
        <Card>
          <CardHeader className="font-semibold">Dose Frequency Calendar</CardHeader>
          <CardContent className="h-[200px] w-full">
            <div className="w-full h-full">
              <ResponsiveContainer width="100%" height={200}>
                <Calendar
                  data={stats.calendarData}
                  from={subMonths(new Date(), 12)}
                  to={new Date()}
                  width={900}
                  height={200}
                  emptyColor="#eeeeee"
                  colors={['#61cdbb', '#97e3d5', '#e8c1a0', '#f47560']}
                  margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  yearSpacing={40}
                  monthBorderColor="#ffffff"
                  dayBorderWidth={2}
                  dayBorderColor="#ffffff"
                />
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trends and Distribution */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="font-semibold">Monthly Trends</CardHeader>
            <CardContent className="h-[200px]">
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

          <Card>
            <CardHeader className="font-semibold">Top Substances</CardHeader>
            <CardContent className="h-[200px]">
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
        </div>
      </TabsContent>

      <TabsContent value="patterns" className="space-y-4">
        {/* Usage Patterns */}
        <Card>
          <CardHeader className="font-semibold">Usage Patterns & Predictions</CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.usagePatterns.map((pattern, index) => (
                <div key={index} className="space-y-2 border-b last:border-0 pb-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{pattern.substance}</h4>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(pattern.trend)}
                      <Badge variant="outline">
                        {pattern.periodicity.toFixed(1)} days between doses
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Pattern consistency: {(pattern.consistency * 100).toFixed(1)}%
                  </div>
                  {stats.usageForecasts
                    .find(f => f.substance === pattern.substance)
                    ?.predictedDoses.slice(0, 3)
                    .map((prediction, i) => (
                      <div key={i} className="text-sm">
                        {format(prediction.date, 'MMM d')}: {prediction.amount.toFixed(1)}mg
                        <span className="text-muted-foreground ml-2">
                          ({(prediction.confidence * 100).toFixed(1)}% confidence)
                        </span>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Time Patterns */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="font-semibold">Time of Day Patterns</CardHeader>
            <CardContent className="h-[200px]">
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
        </div>
      </TabsContent>

      <TabsContent value="analysis" className="space-y-4">
        {/* Route Analysis */}
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

        {/* Substance Correlations Matrix */}
        <Card>
          <CardHeader className="font-semibold">Substance Correlations</CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid />
                <XAxis 
                  dataKey="substance1" 
                  type="category"
                  name="Substance 1"
                />
                <YAxis 
                  dataKey="substance2"
                  type="category"
                  name="Substance 2"
                />
                <ZAxis 
                  dataKey="correlation"
                  range={[100, 1000]}
                  name="Correlation"
                />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background p-2 border rounded-lg shadow">
                        <p>{data.substance1} + {data.substance2}</p>
                        <p>Correlation: {(data.correlation * 100).toFixed(1)}%</p>
                        <p>Common days: {data.commonDays}</p>
                      </div>
                    );
                  }}
                />
                <Scatter 
                  data={stats.timeCorrelations}
                  fill="#8884d8"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="safety" className="space-y-4">
        {/* Substance Interactions Warnings */}
        {stats.substanceInteractions.map((interaction, index) => (
          <Alert 
            key={index}
            variant={
              interaction.riskLevel === 'critical' ? 'destructive' :
              interaction.riskLevel === 'high' ? 'destructive' :
              interaction.riskLevel === 'moderate' ? 'default' : 'default'
            }
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {interaction.riskLevel.charAt(0).toUpperCase() + interaction.riskLevel.slice(1)} 
              Interaction Risk
            </AlertTitle>
            <AlertDescription>
              {interaction.substances.join(' + ')} were taken within{' '}
              {interaction.timeGap.toFixed(1)} hours ({interaction.frequency} times)
            </AlertDescription>
          </Alert>
        ))}

        {/* Recovery Periods */}
        <Card>
          <CardHeader className="font-semibold">Recommended Recovery Periods</CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recoveryPeriods.map((period, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="font-medium">{period.substance}</span>
                  <Badge variant="secondary">
                    {period.recommendedHours} hours
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
