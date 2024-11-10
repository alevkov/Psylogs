import { useEffect, useState } from "react";
import { getDoses } from "@/lib/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
} from "recharts";
import { format, differenceInDays } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  calculateTimeCorrelations,
  analyzeUsagePatterns,
  generateUsageForecast,
  analyzeSubstanceInteractions,
  generateCalendarData,
  calculateRecoveryPeriods,
  INTERACTION_THRESHOLDS,
  type CalendarDataPoint,
  analyzePersonalPatterns,
  calculateUnitSpecificStats,
  type UnitSpecificStats,
} from "@/lib/analysis";
import regression from "regression";

// Generate colors for charts
const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface Stats {
  timeCorrelations: ReturnType<typeof calculateTimeCorrelations>;
  usagePatterns: ReturnType<typeof analyzeUsagePatterns>;
  usageForecasts: ReturnType<typeof generateUsageForecast>;
  substanceInteractions: ReturnType<typeof analyzeSubstanceInteractions>;
  calendarData: CalendarDataPoint[];
  recoveryPeriods: ReturnType<typeof calculateRecoveryPeriods>;
  personalPatterns: ReturnType<typeof analyzePersonalPatterns>;
  totalDoses: number;
  uniqueSubstances: number;
  monthlyTrends: Array<{ name: string; doses: number }>;
  substanceDistribution: Array<{ name: string; value: number }>;
  routeDistribution: Array<{ name: string; value: number }>;
  timeDistribution: Array<{ name: string; count: number }>;
  recentActivity: Array<{
    timestamp: string;
    substance: string;
    amount: number;
    unit: string;
    route: string;
  }>;
  unitStats: UnitSpecificStats[];
}

export function DoseStats() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    timeCorrelations: [],
    usagePatterns: [],
    usageForecasts: [],
    substanceInteractions: [],
    calendarData: [],
    recoveryPeriods: [],
    personalPatterns: [],
    totalDoses: 0,
    uniqueSubstances: 0,
    monthlyTrends: [],
    substanceDistribution: [],
    routeDistribution: [],
    timeDistribution: [],
    recentActivity: [],
    unitStats: [],
  });

  useEffect(() => {
    const calculateStats = async () => {
      try {
        setLoading(true);
        const doses = await getDoses();

        // Calculate basic stats
        const substances = new Set(doses.map((d) => d.substance));
        const routeCount = doses.reduce(
          (acc, dose) => {
            acc[dose.route] = (acc[dose.route] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        // Calculate advanced statistics
        const timeCorrelations = calculateTimeCorrelations(doses);
        const usagePatterns = analyzeUsagePatterns(doses);
        const usageForecasts = generateUsageForecast(doses);
        const substanceInteractions = analyzeSubstanceInteractions(doses);
        const calendarData = generateCalendarData(doses);
        const recoveryPeriods = calculateRecoveryPeriods(doses);
        const personalPatterns = analyzePersonalPatterns(doses);
        const unitStats = calculateUnitSpecificStats(doses);

        // Calculate monthly trends
        const monthRange = Array.from({ length: 7 }, (_, i) =>
          new Date(new Date().setMonth(new Date().getMonth() - i)),
        ).reverse();

        const monthlyData = monthRange.map((month) => ({
          name: format(month, "MMM yy"),
          doses: doses.filter(
            (dose) =>
              new Date(dose.timestamp).getMonth() === month.getMonth() &&
              new Date(dose.timestamp).getFullYear() === month.getFullYear(),
          ).length,
        }));

        // Calculate substance distribution
        const substanceCount = doses.reduce(
          (acc, dose) => {
            acc[dose.substance] = (acc[dose.substance] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        const substanceDistribution = Object.entries(substanceCount)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        // Calculate time distribution
        const timeCount = doses.reduce(
          (acc, dose) => {
            const hour = new Date(dose.timestamp).getHours();
            const timeSlot = `${hour.toString().padStart(2, "0")}:00`;
            acc[timeSlot] = (acc[timeSlot] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        setStats({
          timeCorrelations,
          usagePatterns,
          usageForecasts,
          substanceInteractions,
          calendarData,
          recoveryPeriods,
          personalPatterns,
          totalDoses: doses.length,
          uniqueSubstances: substances.size,
          monthlyTrends: monthlyData,
          substanceDistribution,
          routeDistribution: Object.entries(routeCount).map(([name, value]) => ({
            name,
            value,
          })),
          timeDistribution: Object.entries(timeCount)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          recentActivity: doses
            .sort(
              (a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
            )
            .slice(0, 7)
            .map((dose) => ({
              timestamp: dose.timestamp.toString(),
              substance: dose.substance,
              amount: dose.amount,
              unit: dose.unit,
              route: dose.route,
            })),
          unitStats,
        });
      } catch (error) {
        console.error("Error calculating stats:", error);
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

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="patterns">Patterns</TabsTrigger>
        <TabsTrigger value="units">Units</TabsTrigger>
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
        <TabsTrigger value="safety">Safety</TabsTrigger>
      </TabsList>

      {/* Units Tab Content */}
      <TabsContent value="units" className="space-y-4">
        {stats.unitStats.map((unitStat) => (
          <Card key={unitStat.unit}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="font-semibold">
                {unitStat.unit.toUpperCase()} Analysis
              </div>
              <Badge variant={unitStat.trend === 'increasing' ? 'warning' : 'default'}>
                {unitStat.trend}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Amount:</span>
                    <span>{unitStat.totalAmount.toFixed(2)}{unitStat.unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average Dose:</span>
                    <span>{unitStat.averageAmount.toFixed(2)}{unitStat.unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Median Dose:</span>
                    <span>{unitStat.medianAmount.toFixed(2)}{unitStat.unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Range:</span>
                    <span>
                      {unitStat.minAmount.toFixed(2)} - {unitStat.maxAmount.toFixed(2)}
                      {unitStat.unit}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Weekly Change:</span>
                    <span className={unitStat.recentTrends.weeklyChange > 0 ? 'text-yellow-600' : 'text-green-600'}>
                      {(unitStat.recentTrends.weeklyChange * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monthly Change:</span>
                    <span className={unitStat.recentTrends.monthlyChange > 0 ? 'text-yellow-600' : 'text-green-600'}>
                      {(unitStat.recentTrends.monthlyChange * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Daily Frequency:</span>
                    <span>
                      {unitStat.recentTrends.averageFrequency.toFixed(2)} doses/day
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Common Substances</h4>
                <div className="space-y-2">
                  {unitStat.commonSubstances.map((substance) => (
                    <div key={substance.substance} className="flex items-center justify-between">
                      <span className="text-sm">{substance.substance}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {substance.totalAmount.toFixed(1)}{unitStat.unit}
                        </Badge>
                        <Badge variant="secondary">
                          {substance.frequency} doses
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {unitStat.standardDeviation > unitStat.averageAmount * 0.5 && (
                <Alert className="mt-4" variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>High Dose Variation</AlertTitle>
                  <AlertDescription>
                    Doses vary significantly (±{unitStat.standardDeviation.toFixed(1)}{unitStat.unit}).
                    Consider maintaining more consistent dosing.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ))}
      </TabsContent>

      {/* Keep existing tab contents */}
    </Tabs>
  );
}
