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
import { format, differenceInDays } from "date-fns";
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
  analyzePersonalPatterns,
  type Stats
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

        // Calculate basic stats
        const substances = new Set(doses.map((d) => d.substance));
        const routeCount = doses.reduce(
          (acc, dose) => {
            acc[dose.route] = (acc[dose.route] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        // Calculate route distribution
        const sortedRouteDistribution = Object.entries(routeCount)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        // Calculate substance distribution
        const substanceCount = doses.reduce(
          (acc, dose) => {
            acc[dose.substance] = (acc[dose.substance] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        const substanceDistribution = Object.entries(substanceCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, value]) => ({ name, value }));

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

        // Calculate monthly trends (last 6 months)
        const monthlyTrends = Array.from({ length: 6 }, (_, i) => {
          const date = new Date();
          date.setMonth(date.getMonth() - i);
          const month = format(date, "MMM yy");
          const monthDoses = doses.filter(
            (dose) =>
              new Date(dose.timestamp).getMonth() === date.getMonth() &&
              new Date(dose.timestamp).getFullYear() === date.getFullYear(),
          );
          return {
            name: month,
            doses: monthDoses.length,
          };
        }).reverse();

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
          monthlyTrends,
          substanceDistribution,
          routeDistribution: sortedRouteDistribution,
          timeDistribution: Object.entries(timeCount)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          recentActivity: doses
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 7)
            .map((dose) => ({
              timestamp: dose.timestamp,
              substance: dose.substance,
              amount: dose.amount,
              unit: dose.unit,
              route: dose.route,
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

      {/* Overview Tab Content */}
      <TabsContent value="overview" className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="font-semibold">Total Doses</CardHeader>
            <CardContent>
              <div className="flex flex-col">
                <span className="text-2xl">{stats.totalDoses}</span>
                {stats.monthlyTrends.length >= 2 && (
                  <div className="flex items-center mt-2">
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
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="font-semibold">Unique Substances</CardHeader>
            <CardContent>
              <div className="flex flex-col">
                <span className="text-2xl">{stats.uniqueSubstances}</span>
                {stats.substanceDistribution[0] && (
                  <div className="mt-2">
                    <Badge variant="secondary" className="text-xs">
                      Most used: {stats.substanceDistribution[0].name}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="font-semibold">Main Route</CardHeader>
            <CardContent>
              <div className="flex flex-col">
                <span className="text-2xl">
                  {stats.routeDistribution[0]?.name || "N/A"}
                </span>
                {stats.routeDistribution[0] && (
                  <div className="mt-2">
                    <Badge variant="secondary" className="text-xs">
                      {((stats.routeDistribution[0].value / stats.totalDoses) * 100).toFixed(1)}% of doses
                    </Badge>
                  </div>
                )}
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
                  <Line
                    type="monotone"
                    dataKey="doses"
                    stroke={COLORS[0]}
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

        <Card>
          <CardHeader className="font-semibold">Recent Activity</CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recentActivity.map((dose, index) => (
                <div key={index} className="flex items-center justify-between border-b last:border-0 pb-2">
                  <div className="flex flex-col">
                    <div className="font-medium">
                      {format(new Date(dose.timestamp), "MMM d, h:mm a")}
                    </div>
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
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Patterns Tab Content */}
      <TabsContent value="patterns" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {stats.personalPatterns.map((pattern, index) => (
            <Card key={index}>
              <CardHeader className="font-semibold">{pattern.substance}</CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-sm text-muted-foreground">Average Dose</div>
                      <div className="font-medium">
                        {pattern.recentTrends.typicalDoseRange.avg.toFixed(1)}mg
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Frequency</div>
                      <div className="font-medium">
                        Every {pattern.recentTrends.avgTimeBetweenDoses.toFixed(1)}h
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Usage Pattern</div>
                    <div className="flex gap-2">
                      {pattern.changeMetrics.monthOverMonthChange > 0.1 && (
                        <Badge variant="warning">Increasing</Badge>
                      )}
                      {pattern.changeMetrics.monthOverMonthChange < -0.1 && (
                        <Badge variant="default">Decreasing</Badge>
                      )}
                      {Math.abs(pattern.changeMetrics.monthOverMonthChange) <= 0.1 && (
                        <Badge variant="secondary">Stable</Badge>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Consistency</div>
                    <div className="grid grid-cols-3 gap-2">
                      <Badge
                        variant={pattern.variationMetrics.timingConsistency > 0.7 ? "default" : "secondary"}
                        className="w-full justify-center"
                      >
                        Timing {(pattern.variationMetrics.timingConsistency * 100).toFixed(0)}%
                      </Badge>
                      <Badge
                        variant={pattern.variationMetrics.doseConsistency > 0.7 ? "default" : "secondary"}
                        className="w-full justify-center"
                      >
                        Dose {(pattern.variationMetrics.doseConsistency * 100).toFixed(0)}%
                      </Badge>
                      <Badge
                        variant={pattern.variationMetrics.routeConsistency > 0.7 ? "default" : "secondary"}
                        className="w-full justify-center"
                      >
                        Route {(pattern.variationMetrics.routeConsistency * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      {/* Analysis Tab Content */}
      <TabsContent value="analysis" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="font-semibold">Usage Forecasts</CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.usageForecasts.flatMap(f => f.predictedDoses)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => format(new Date(date), "MMM d")}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(date) => format(new Date(date), "MMM d, yyyy")}
                    formatter={(value: number) => [`${value.toFixed(1)}mg`, "Predicted Amount"]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    name="Predicted Usage"
                    stroke={COLORS[0]}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="font-semibold">Interaction Patterns</CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.timeCorrelations}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="substance1"
                    tickFormatter={(value) => value.substring(0, 3)}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number, name: string, props: any) => [
                      `${(value * 100).toFixed(1)}%`,
                      "Correlation"
                    ]}
                    labelFormatter={(label) => `${label} + ${props.payload.substance2}`}
                  />
                  <Legend />
                  <Bar
                    dataKey="correlation"
                    name="Interaction Strength"
                    fill={COLORS[0]}
                  >
                    {stats.timeCorrelations.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="font-semibold">Time Correlation Analysis</CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="timeBetweenDoses"
                  name="Hours Between Doses"
                  unit="h"
                />
                <YAxis
                  type="number"
                  dataKey="amount"
                  name="Dose Amount"
                  unit="mg"
                />
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(1)}`}
                  labelFormatter={(label) => `Time between doses: ${label}h`}
                />
                <Legend />
                {stats.usagePatterns.map((pattern, index) => (
                  <Scatter
                    key={pattern.substance}
                    name={pattern.substance}
                    data={[{
                      timeBetweenDoses: pattern.periodicity * 24,
                      amount: pattern.consistency * 100
                    }]}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Safety Tab Content */}
      <TabsContent value="safety" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="font-semibold">Current Risk Assessment</CardHeader>
            <CardContent className="space-y-4">
              {stats.substanceInteractions.map((interaction, index) => (
                <Alert
                  key={index}
                  variant={
                    interaction.riskLevel === "critical"
                      ? "destructive"
                      : interaction.riskLevel === "high"
                        ? "warning"
                        : "default"
                  }
                  className="relative overflow-hidden"
                >
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      background: interaction.riskLevel === "critical"
                        ? "linear-gradient(45deg, #ff0000, #ff6b6b)"
                        : interaction.riskLevel === "high"
                          ? "linear-gradient(45deg, #ffa500, #ffd700)"
                          : "linear-gradient(45deg, #4ecdc4, #45b7d1)"
                    }}
                  />
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="flex items-center gap-2">
                    <span>Interaction Warning</span>
                    <Badge
                      variant={
                        interaction.riskLevel === "critical"
                          ? "destructive"
                          : interaction.riskLevel === "high"
                            ? "warning"
                            : "default"
                      }
                    >
                      {interaction.riskLevel.toUpperCase()}
                    </Badge>
                  </AlertTitle>
                  <AlertDescription className="mt-2">
                    <div className="space-y-2">
                      <p><strong>Substances:</strong> {interaction.substances.join(" + ")}</p>
                      <p><strong>Time Gap:</strong> {interaction.timeGap.toFixed(1)} hours</p>
                      <p><strong>Frequency:</strong> {interaction.frequency} occurrences</p>
                      <p className="text-sm italic mt-1">
                        {interaction.riskLevel === "critical"
                          ? "Immediate attention required - High risk combination detected"
                          : interaction.riskLevel === "high"
                            ? "Caution advised - Potentially dangerous interaction"
                            : "Monitor carefully - Known interaction present"}
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="font-semibold">Recovery Periods</CardHeader>
            <CardContent className="space-y-4">
              {stats.recoveryPeriods.map((period, index) => (
                <Alert
                  key={index}
                  variant={period.adherenceRate > 0.7 ? "default" : "warning"}
                  className="relative overflow-hidden"
                >
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      background: period.adherenceRate > 0.7
                        ? "linear-gradient(45deg, #4ecdc4, #45b7d1)"
                        : "linear-gradient(45deg, #ffa500, #ffd700)"
                    }}
                  />
                  <AlertTitle className="flex items-center gap-2">
                    <span>{period.substance}</span>
                    <Badge variant={period.adherenceRate > 0.7 ? "default" : "warning"}>
                      {(period.adherenceRate * 100).toFixed(0)}% Adherence
                    </Badge>
                  </AlertTitle>
                  <AlertDescription className="mt-2">
                    <div className="space-y-2">
                      <p>
                        <strong>Recommended Break:</strong> {period.recommendedRecoveryTime}h
                      </p>
                      <p>
                        <strong>Current Break:</strong>{" "}
                        {differenceInDays(new Date(), new Date(period.lastDose))} days
                      </p>
                      <div className="w-full bg-secondary h-2 rounded-full mt-2">
                        <div
                          className="bg-primary h-full rounded-full transition-all"
                          style={{
                            width: `${period.adherenceRate * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="font-semibold">Safety Recommendations</CardHeader>
          <CardContent className="space-y-4">
            {stats.personalPatterns.map((pattern, index) => (
              <Alert key={index}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{pattern.substance} Usage Guidelines</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2 mt-2">
                    <p>
                      <strong>Typical Dose Range:</strong>{" "}
                      {pattern.recentTrends.typicalDoseRange.min.toFixed(1)} -{" "}
                      {pattern.recentTrends.typicalDoseRange.max.toFixed(1)}mg
                    </p>
                    <p>
                      <strong>Recommended Frequency:</strong>{" "}
                      Every {pattern.recentTrends.avgTimeBetweenDoses.toFixed(1)}h
                    </p>
                    {pattern.changeMetrics.monthOverMonthChange > 0.1 && (
                      <p className="text-warning">
                        ⚠️ Usage frequency has increased significantly
                      </p>
                    )}
                    {pattern.variationMetrics.doseConsistency < 0.5 && (
                      <p className="text-warning">
                        ⚠️ High dose variability detected
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
