import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDoses } from "@/lib/db";
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
  type UnitSpecificStats
} from "@/lib/analysis";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
} from "recharts";
import { format, subMonths, differenceInDays, isSameDay, subDays } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  Loader2,
} from "lucide-react";

// Generate colors for charts
const COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEEAD",
  "#D4A5A5",
  "#9E9E9E",
  "#58B19F",
  "#FFD93D",
  "#6C5B7B",
];

interface Stats {
  timeCorrelations: ReturnType<typeof calculateTimeCorrelations>;
  usagePatterns: ReturnType<typeof analyzeUsagePatterns>;
  usageForecasts: ReturnType<typeof generateUsageForecast>;
  substanceInteractions: ReturnType<typeof analyzeSubstanceInteractions>;
  calendarData: CalendarDataPoint[];
  recoveryPeriods: ReturnType<typeof calculateRecoveryPeriods>;
  totalDoses: number;
  personalPatterns: ReturnType<typeof analyzePersonalPatterns>;
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
  unitSpecificStats: UnitSpecificStats[];
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
    unitSpecificStats: [],
  });

  useEffect(() => {
    const calculateStats = async () => {
      try {
        setLoading(true);
        const doses = await getDoses();

        // Calculate basic stats
        const substances = new Set(doses.map((d) => d.substance));
        
        // Calculate unit-specific statistics
        const unitSpecificStats = calculateUnitSpecificStats(doses);
        
        // Calculate other statistics...
        const timeCorrelations = calculateTimeCorrelations(doses);
        const usagePatterns = analyzeUsagePatterns(doses);
        const usageForecasts = generateUsageForecast(doses);
        const substanceInteractions = analyzeSubstanceInteractions(doses);
        const calendarData = generateCalendarData(doses);
        const recoveryPeriods = calculateRecoveryPeriods(doses);
        const personalPatterns = analyzePersonalPatterns(doses);

        // ... [Previous calculations remain the same]

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
          monthlyTrends: [], // ... previous calculation
          substanceDistribution: [], // ... previous calculation
          routeDistribution: [], // ... previous calculation
          timeDistribution: [], // ... previous calculation
          recentActivity: doses
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 7)
            .map((dose) => ({
              timestamp: dose.timestamp,
              substance: dose.substance,
              amount: dose.amount,
              unit: dose.unit,
              route: dose.route
            })),
          unitSpecificStats,
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

  // ... [Rest of the rendering logic remains the same until Analysis tab]

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="patterns">Patterns</TabsTrigger>
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
        <TabsTrigger value="safety">Safety</TabsTrigger>
      </TabsList>

      <TabsContent value="analysis" className="space-y-4">
        {/* Unit-Specific Analysis Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Unit-Specific Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Analysis breakdown by dose units
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={stats.unitSpecificStats[0]?.unit || "overview"} className="space-y-4">
              <TabsList>
                {stats.unitSpecificStats?.map((unitStat) => (
                  <TabsTrigger key={unitStat.unit} value={unitStat.unit}>
                    {unitStat.unit.toUpperCase()}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {stats.unitSpecificStats?.map((unitStat) => (
                <TabsContent key={unitStat.unit} value={unitStat.unit} className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Average Dose</p>
                      <p className="text-2xl">{unitStat.average.toFixed(2)}{unitStat.unit}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Median Dose</p>
                      <p className="text-2xl">{unitStat.median.toFixed(2)}{unitStat.unit}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Total Amount</p>
                      <p className="text-2xl">{unitStat.total.toFixed(2)}{unitStat.unit}</p>
                      <Badge variant={
                        unitStat.trend === "increasing" ? "default" :
                        unitStat.trend === "decreasing" ? "secondary" :
                        "outline"
                      }>
                        {unitStat.trend}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <h4 className="text-sm font-medium">Weekly Totals</h4>
                      </CardHeader>
                      <CardContent className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={unitStat.weeklyTotals}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="week" />
                            <YAxis />
                            <Tooltip />
                            <Bar
                              dataKey="total"
                              fill="hsl(var(--primary))"
                              name={`Total (${unitStat.unit})`}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <h4 className="text-sm font-medium">Monthly Averages</h4>
                      </CardHeader>
                      <CardContent className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={unitStat.monthlyAverages}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip />
                            <Line
                              type="monotone"
                              dataKey="average"
                              stroke="hsl(var(--primary))"
                              name={`Average (${unitStat.unit})`}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-2">
                      <h4 className="text-sm font-medium">Common Substances ({unitStat.unit})</h4>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {unitStat.commonSubstances.map((substance) => (
                          <div key={substance.substance} className="flex items-center justify-between">
                            <span className="text-sm">{substance.substance}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary"
                                  style={{ width: `${substance.percentage}%` }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {substance.percentage.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* ... [Rest of the analysis content remains the same] */}
      </TabsContent>

      {/* ... [Rest of the tabs content remains the same] */}
    </Tabs>
  );
}
