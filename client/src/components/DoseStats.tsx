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
} from "@/lib/analysis";

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
  recentActivity: Array<{ name: string; amount: number }>;
}

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
  });

  useEffect(() => {
    const calculateStats = async () => {
      try {
        setLoading(true);
        const doses = await getDoses();

        console.log(doses)

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
        const sixMonthsAgo = subMonths(new Date(), 6);
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
        const timeCorrelations = calculateTimeCorrelations(doses);
        const usagePatterns = analyzeUsagePatterns(doses);
        const usageForecasts = generateUsageForecast(doses);
        const substanceInteractions = analyzeSubstanceInteractions(doses);
        const calendarData = generateCalendarData(doses);
        const recoveryPeriods = calculateRecoveryPeriods(doses);
        const personalPatterns = analyzePersonalPatterns(doses);
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
          routeDistribution: sortedRouteDistribution,
          timeDistribution: Object.entries(timeCount)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name)),
            recentActivity: doses
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 7)  // Last 7 doses
            .map((dose) => ({
              timestamp: dose.timestamp,
              substance: dose.substance,
              amount: dose.amount,
              unit: dose.unit,
              route: dose.route
            })),

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
  {/* Enhanced Stats Grid */}
  <div className="grid grid-cols-4 gap-4">
    <Card>
      <CardHeader className="font-semibold">Total Doses</CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <span className="text-2xl">{stats.totalDoses}</span>
          <div className="flex items-center mt-2">
            {stats.monthlyTrends.length >= 2 && (
              <>
                {getTrendIcon(
                  stats.monthlyTrends[stats.monthlyTrends.length - 1].doses >
                  stats.monthlyTrends[stats.monthlyTrends.length - 2].doses
                    ? "increasing"
                    : "decreasing"
                )}
                <span className="text-sm text-muted-foreground ml-1">
                  {Math.abs(
                    ((stats.monthlyTrends[stats.monthlyTrends.length - 1].doses -
                      stats.monthlyTrends[stats.monthlyTrends.length - 2].doses) /
                      stats.monthlyTrends[stats.monthlyTrends.length - 2].doses) *
                      100
                  ).toFixed(1)}% MoM
                </span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="font-semibold">Unique Substances</CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <span className="text-2xl">{stats.uniqueSubstances}</span>
          <div className="mt-2">
            <Badge variant="secondary" className="text-xs">
              Most used: {stats.substanceDistribution[0]?.name}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="font-semibold">Administration</CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <span className="text-2xl">{stats.routeDistribution[0]?.name}</span>
          <div className="mt-2">
            <Badge variant="secondary" className="text-xs">
              {((stats.routeDistribution[0]?.value / stats.totalDoses) * 100).toFixed(1)}% of doses
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="font-semibold">Peak Hours</CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <span className="text-2xl">
            {stats.timeDistribution
              .reduce((max, curr) => 
                curr.count > max.count ? curr : max
              ).name.split(':')[0]}:00
          </span>
          <div className="mt-2">
            <Badge variant="secondary" className="text-xs">
              {Math.max(...stats.timeDistribution.map(t => t.count))} doses
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>

  {/* Charts Grid */}
  <div className="grid grid-cols-2 gap-4">
    <Card>
      <CardHeader className="font-semibold">Usage Trends</CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={stats.monthlyTrends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              name="Monthly Doses"
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
      <CardHeader className="font-semibold">Substance Distribution</CardHeader>
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
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  </div>

  {/* Additional Charts */}
  <div className="grid grid-cols-2 gap-4">
    <Card>
      <CardHeader className="font-semibold">Time of Day Distribution</CardHeader>
      <CardContent className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.timeDistribution}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="name" 
              interval={2}
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis />
            <Tooltip />
            <Bar 
              name="Doses"
              dataKey="count" 
              fill="hsl(var(--primary))"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>

    <Card>
  <CardHeader className="font-semibold">Recent Activity</CardHeader>
  <CardContent>
    <div className="space-y-3">
      {stats.recentActivity.map((dose, index) => (
        <div key={index} className="flex items-center justify-between border-b last:border-0 pb-2">
          <div className="flex flex-col">
            <div className="font-medium">{format(new Date(dose.timestamp), "MMM d, h:mm a")}</div>
            <div className="text-sm text-muted-foreground">{dose.substance}</div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              {dose.amount}{dose.unit}
            </Badge>
            <Badge variant="secondary">
              {dose.route}
            </Badge>
          </div>
        </div>
      ))}
      {stats.recentActivity.length === 0 && (
        <div className="text-center text-muted-foreground py-4">
          No recent activity
        </div>
      )}
    </div>
  </CardContent>
</Card>
  </div>
</TabsContent>
<TabsContent value="patterns" className="space-y-4">
  <div className="grid grid-cols-2 gap-4">
  <Card>
    <CardHeader className="font-semibold">Usage Regularity</CardHeader>
    <CardContent>
      <div className="space-y-3">
        {stats.personalPatterns.map((pattern, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="font-medium min-w-[100px]">{pattern.substance}</div>
              <div className="text-sm text-muted-foreground">
                every {pattern.recentTrends.avgTimeBetweenDoses.toFixed(1)}h
              </div>
            </div>
            <div className="w-32">
              <Badge 
                variant={pattern.variationMetrics.timingConsistency > 0.7 ? "default" : "secondary"}
                className="w-full justify-center"
              >
                {(pattern.variationMetrics.timingConsistency * 100).toFixed(0)}% regular
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader className="font-semibold">Recent Trends</CardHeader>
    <CardContent>
      <div className="space-y-3">
        {stats.personalPatterns.map((pattern, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="font-medium min-w-[100px]">{pattern.substance}</div>
            <div className="flex gap-2">
              {pattern.changeMetrics.monthOverMonthChange > 0.1 && (
                <Badge variant="warning">More frequent</Badge>
              )}
              {pattern.changeMetrics.monthOverMonthChange < -0.1 && (
                <Badge variant="default">Less frequent</Badge>
              )}
              {pattern.changeMetrics.doseSizeTrend > 0.1 && (
                <Badge variant="warning">Doses increasing</Badge>
              )}
              {pattern.changeMetrics.doseSizeTrend < -0.1 && (
                <Badge variant="default">Doses decreasing</Badge>
              )}
              {Math.abs(pattern.changeMetrics.monthOverMonthChange) <= 0.1 && 
               Math.abs(pattern.changeMetrics.doseSizeTrend) <= 0.1 && (
                <Badge variant="secondary">Stable</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
  </div>

  <Card>
    <CardHeader className="font-semibold">Detailed Usage Patterns</CardHeader>
    <CardContent>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.personalPatterns.map((pattern, index) => (
          <Card key={index} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{pattern.substance}</h4>
                  {pattern.changeMetrics.doseSizeTrend > 0.1 && (
                    <Badge variant="warning" className="h-5">Increasing</Badge>
                  )}
                  {pattern.recentTrends.consecutiveDays > 5 && (
                    <Badge variant="secondary" className="h-5">
                      {pattern.recentTrends.consecutiveDays}d streak
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div className="text-muted-foreground">Average dose</div>
                  <div className="text-right font-medium">
                    {pattern.recentTrends.typicalDoseRange.avg.toFixed(1)}mg
                    <span className="text-xs text-muted-foreground ml-1">
                      ({pattern.recentTrends.typicalDoseRange.min}-
                      {pattern.recentTrends.typicalDoseRange.max}mg)
                    </span>
                  </div>

                  <div className="text-muted-foreground">Most active time</div>
                  <div className="text-right font-medium">
                    {pattern.recentTrends.commonTimeOfDay}
                  </div>

                  <div className="text-muted-foreground">Average interval</div>
                  <div className="text-right font-medium">
                    {pattern.recentTrends.avgTimeBetweenDoses.toFixed(1)}h
                  </div>

                  <div className="text-muted-foreground">Preferred method</div>
                  <div className="text-right font-medium">
                    {pattern.recentTrends.preferredRoute}
                  </div>

                  <div className="text-muted-foreground">Longest break</div>
                  <div className="text-right font-medium">
                    {(pattern.recentTrends.longestBreak / 24).toFixed(1)} days
                  </div>
                </div>

                <div className="pt-3 border-t">
                  <div className="text-sm font-medium mb-2">Pattern Consistency</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Schedule</div>
                      <Badge 
                        variant={pattern.variationMetrics.timingConsistency > 0.7 ? "default" : "secondary"}
                        className="w-full justify-center"
                      >
                        {(pattern.variationMetrics.timingConsistency * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Dosing</div>
                      <Badge 
                        variant={pattern.variationMetrics.doseConsistency > 0.7 ? "default" : "secondary"}
                        className="w-full justify-center"
                      >
                        {(pattern.variationMetrics.doseConsistency * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Method</div>
                      <Badge 
                        variant={pattern.variationMetrics.routeConsistency > 0.7 ? "default" : "secondary"}
                        className="w-full justify-center"
                      >
                        {(pattern.variationMetrics.routeConsistency * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </div>

                  {(pattern.changeMetrics.weekOverWeekChange !== 0 || 
                    pattern.changeMetrics.monthOverMonthChange !== 0) && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-sm font-medium mb-2">Usage Trends</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Week over Week</div>
                          <Badge 
                            variant={pattern.changeMetrics.weekOverWeekChange > 0 ? "warning" : "default"}
                            className="w-full justify-center"
                          >
                            {(pattern.changeMetrics.weekOverWeekChange * 100).toFixed(0)}%
                          </Badge>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Month over Month</div>
                          <Badge 
                            variant={pattern.changeMetrics.monthOverMonthChange > 0 ? "warning" : "default"}
                            className="w-full justify-center"
                          >
                            {(pattern.changeMetrics.monthOverMonthChange * 100).toFixed(0)}%
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader className="font-semibold flex flex-row items-center justify-between">
      <span>Weekly Patterns</span>
      <Badge variant="outline" className="h-5">Last 90 days</Badge>
    </CardHeader>
    <CardContent className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={Array.from({ length: 7 }, (_, i) => ({
            day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
            doses: stats.calendarData
              .filter(d => {
                const date = new Date(d.date);
                return date.getDay() === i && 
                       differenceInDays(new Date(), date) <= 90;
              })
              .reduce((sum, d) => sum + d.doses, 0)
          }))}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Bar 
            dataKey="doses" 
            name="Total Doses"
            fill="hsl(var(--primary))" 
          />
        </BarChart>
      </ResponsiveContainer>
    </CardContent>
  </Card>
</TabsContent>
      <TabsContent value="analysis" className="space-y-4">
        {/* Route Analysis */}
        <Card>
          <CardHeader className="font-semibold">
            Administration Routes
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.routeDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))">
                  {stats.routeDistribution.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Substance Correlations Matrix */}
        <Card>
          <CardHeader className="font-semibold">
            Substance Correlations
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4">
              {stats.timeCorrelations.map((corr, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">
                          {corr.substance1} + {corr.substance2}
                        </h4>
                        <div className="text-sm text-muted-foreground">
                          {(corr.correlation * 100).toFixed(1)}% correlation
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">
                          {corr.commonDays} common days
                        </div>
                        <Badge
                          variant={
                            corr.correlation > 0.7
                              ? "destructive"
                              : corr.correlation > 0.4
                                ? "default"
                                : "secondary"
                          }
                        >
                          {corr.correlation > 0.7
                            ? "High"
                            : corr.correlation > 0.4
                              ? "Moderate"
                              : "Low"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="safety" className="space-y-4">
        {/* Substance Interactions Warnings */}
        {stats.substanceInteractions.map((interaction, index) => (
          <Alert
            key={index}
            variant={
              interaction.riskLevel === "critical"
                ? "destructive"
                : interaction.riskLevel === "high"
                  ? "destructive"
                  : interaction.riskLevel === "moderate"
                    ? "default"
                    : "default"
            }
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {interaction.riskLevel.charAt(0).toUpperCase() +
                interaction.riskLevel.slice(1)}
              Interaction Risk
            </AlertTitle>
            <AlertDescription>
              {interaction.substances.join(" + ")} were taken within{" "}
              {interaction.timeGap.toFixed(1)} hours ({interaction.frequency}{" "}
              times)
            </AlertDescription>
          </Alert>
        ))}

        {/* Recovery Periods */}
        <Card>
          <CardHeader className="font-semibold">
            Recommended Recovery Periods
          </CardHeader>
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

        {/* Safety Thresholds */}
        <Card>
          <CardHeader className="font-semibold">
            Interaction Time Thresholds
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span>Critical</span>
                <Badge variant="destructive">
                  {INTERACTION_THRESHOLDS.critical} hours
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>High Risk</span>
                <Badge variant="destructive">
                  {INTERACTION_THRESHOLDS.high_risk} hours
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>Moderate</span>
                <Badge>{INTERACTION_THRESHOLDS.default} hours</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
