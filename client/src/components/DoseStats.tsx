import { useEffect, useState } from "react";
import { getDoses } from "@/lib/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, ScatterChart, Scatter,
} from "recharts";
import { format, subMonths, differenceInDays, isSameDay, subDays } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, TrendingDown, TrendingUp, ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { P5Visualization } from "./P5Visualization";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  calculateTimeCorrelations,
  analyzeUsagePatterns,
  analyzeSubstanceInteractions,
  convertDoseUnit,
  INTERACTION_THRESHOLDS,
  type CalendarDataPoint,
  analyzePersonalPatterns,
} from "@/lib/analysis";

// Generate colors for charts
const COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEEAD",
  "#D4A5A5", "#9E9E9E", "#58B19F", "#FFD93D", "#6C5B7B",
];

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case "increasing":
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    case "decreasing":
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    default:
      return <ArrowRight className="h-4 w-4 text-yellow-500" />;
  }
};

interface Stats {
  timeCorrelations: ReturnType<typeof calculateTimeCorrelations>;
  usagePatterns: ReturnType<typeof analyzeUsagePatterns>;
  usageForecasts: ReturnType<typeof analyzeUsagePatterns>;
  substanceInteractions: ReturnType<typeof analyzeSubstanceInteractions>;
  calendarData: CalendarDataPoint[];
  recoveryPeriods: Array<{ substance: string; recommendedHours: number }>;
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
    route?: string;
  }>;
}

export function DoseStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  });

  useEffect(() => {
    const calculateStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const doses = await getDoses();

        if (!doses || !Array.isArray(doses)) {
          throw new Error("Invalid dose data received");
        }

        // Convert all doses to standard units for consistency
        const standardizedDoses = doses.map(dose => ({
          ...dose,
          amount: convertDoseUnit(dose.amount, dose.unit, 'mg') // Convert to mg as standard
        }));

        // Calculate basic stats
        const substances = new Set(doses.map((d) => d.substance));
        const routeCount = doses.reduce(
          (acc, dose) => {
            acc[dose.route] = (acc[dose.route] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        // Sort route distribution by frequency
        const sortedRouteDistribution = Object.entries(routeCount)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        // Calculate monthly trends
        const monthRange = Array.from({ length: 7 }, (_, i) =>
          subMonths(new Date(), i),
        ).reverse();

        const monthlyData = monthRange.map((month) => {
          const monthDoses = doses.filter(
            (dose) =>
              new Date(dose.timestamp).getMonth() === month.getMonth() &&
              new Date(dose.timestamp).getFullYear() === month.getFullYear(),
          ).length;
          return {
            name: format(month, "MMM yy"),
            doses: monthDoses,
          };
        });

        // Calculate substance distribution with Others category
        const substanceCount = doses.reduce(
          (acc, dose) => {
            acc[dose.substance] = (acc[dose.substance] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        const substanceDistribution = Object.entries(substanceCount)
          .sort((a, b) => b[1] - a[1])
          .reduce(
            (acc, [name, value], index) => {
              if (index < 5) {
                acc.push({ name, value });
              } else {
                const others = acc.find((item) => item.name === "Others") || {
                  name: "Others",
                  value: 0,
                };
                others.value += value;
                if (!acc.includes(others)) acc.push(others);
              }
              return acc;
            },
            [] as Array<{ name: string; value: number }>,
          );

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

        // Calculate advanced statistics
        const timeCorrelations = calculateTimeCorrelations(standardizedDoses);
        const usagePatterns = analyzeUsagePatterns(standardizedDoses);
        const usageForecasts = analyzeUsagePatterns(standardizedDoses); // Using analyzeUsagePatterns instead of generateUsageForecast
        const substanceInteractions = analyzeSubstanceInteractions(standardizedDoses);
        const personalPatterns = analyzePersonalPatterns(standardizedDoses);

        // Map recent activity to match P5Visualization props
        const recentActivity = doses
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 7)
          .map((dose) => ({
            timestamp: new Date(dose.timestamp).toISOString(),
            substance: dose.substance,
            amount: dose.amount,
            unit: dose.unit,
            route: dose.route,
          }));

        setStats({
          timeCorrelations,
          usagePatterns,
          usageForecasts,
          substanceInteractions,
          calendarData: [], // Will be implemented when generateCalendarData is available
          recoveryPeriods: [], // Will be implemented when calculateRecoveryPeriods is available
          personalPatterns,
          totalDoses: doses.length,
          uniqueSubstances: substances.size,
          monthlyTrends: monthlyData,
          substanceDistribution,
          routeDistribution: sortedRouteDistribution,
          timeDistribution: Object.entries(timeCount)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          recentActivity,
        });
      } catch (error) {
        console.error("Error calculating stats:", error);
        setError(error instanceof Error ? error.message : "An unknown error occurred");
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

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
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
    <div className="w-full">
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex w-full space-x-2 overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="patterns">Patterns</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="safety">Safety</TabsTrigger>
          <TabsTrigger value="visualization">Visualization</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Existing overview content */}
        </TabsContent>

        <TabsContent value="patterns" className="space-y-4">
          {/* Existing patterns content */}
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          {/* Existing analysis content */}
        </TabsContent>

        <TabsContent value="safety" className="space-y-4">
          {/* Existing safety content */}
        </TabsContent>

        <TabsContent value="visualization" className="space-y-4">
          <Card>
            <CardHeader className="font-semibold">Interactive Dose Visualization</CardHeader>
            <CardContent>
              <ErrorBoundary>
                {stats.recentActivity.length > 0 ? (
                  <P5Visualization 
                    doses={stats.recentActivity}
                    width={800}
                    height={400}
                  />
                ) : (
                  <div className="text-center text-muted-foreground py-4">
                    No recent activity to visualize
                  </div>
                )}
              </ErrorBoundary>
              <div className="mt-4 text-sm text-muted-foreground">
                Interactive visualization showing recent doses. Particles represent individual doses, 
                with size corresponding to dose amount. Connected particles indicate related substances.
                Newer doses move more actively.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
