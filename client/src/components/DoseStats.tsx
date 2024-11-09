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
import { AlertTriangle, TrendingDown, TrendingUp, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Calendar } from '@nivo/calendar';
import { HeatMap } from '@nivo/heatmap';
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
  // ... existing stats interface ...
  timeCorrelations: ReturnType<typeof calculateTimeCorrelations>;
  usagePatterns: ReturnType<typeof analyzeUsagePatterns>;
  usageForecasts: ReturnType<typeof generateUsageForecast>;
  substanceInteractions: ReturnType<typeof analyzeSubstanceInteractions>;
  calendarData: ReturnType<typeof generateCalendarData>;
  recoveryPeriods: ReturnType<typeof calculateRecoveryPeriods>;
}

export function DoseStats() {
  const [stats, setStats] = useState<Stats>({
    // ... existing initial state ...
    timeCorrelations: [],
    usagePatterns: [],
    usageForecasts: [],
    substanceInteractions: [],
    calendarData: [],
    recoveryPeriods: []
  });

  useEffect(() => {
    const calculateStats = async () => {
      const doses = await getDoses();
      
      // Calculate all statistics
      const timeCorrelations = calculateTimeCorrelations(doses);
      const usagePatterns = analyzeUsagePatterns(doses);
      const usageForecasts = generateUsageForecast(doses);
      const substanceInteractions = analyzeSubstanceInteractions(doses);
      const calendarData = generateCalendarData(doses);
      const recoveryPeriods = calculateRecoveryPeriods(doses);

      // ... existing stats calculations ...

      setStats({
        // ... existing stats ...
        timeCorrelations,
        usagePatterns,
        usageForecasts,
        substanceInteractions,
        calendarData,
        recoveryPeriods
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

      {/* Usage Calendar */}
      <Card>
        <CardHeader className="font-semibold">Dose Frequency Calendar</CardHeader>
        <CardContent style={{ height: '200px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <Calendar
              data={stats.calendarData}
              from={subMonths(new Date(), 12)}
              to={new Date()}
              emptyColor="#eeeeee"
              colors={['#61cdbb', '#97e3d5', '#e8c1a0', '#f47560']}
              margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
              yearSpacing={40}
              monthBorderColor="#ffffff"
              dayBorderWidth={2}
              dayBorderColor="#ffffff"
            />
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Substance Correlations Matrix */}
      <Card>
        <CardHeader className="font-semibold">Substance Correlations</CardHeader>
        <CardContent style={{ height: '400px' }}>
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

      {/* Usage Patterns */}
      <Card>
        <CardHeader className="font-semibold">Usage Patterns & Predictions</CardHeader>
        <CardContent>
          <div className="space-y-6">
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

      {/* ... existing visualization components ... */}
    </motion.div>
  );
}

// ... rest of the file remains the same ...
