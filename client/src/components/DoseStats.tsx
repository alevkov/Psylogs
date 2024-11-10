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
} from "recharts";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, TrendingUp, TrendingDown, ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  analyzeUsagePatterns,
  analyzeSubstanceInteractions,
  calculateRecoveryPeriods,
  analyzePersonalPatterns,
  type Stats
} from "@/lib/analysis";

// Simple color palette
const COLORS = [
  "#4C51BF", // Indigo
  "#38A169", // Green
  "#E53E3E", // Red
  "#D69E2E", // Yellow
  "#805AD5", // Purple
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

        // Basic stats calculation
        const substances = new Set(doses.map((d) => d.substance));
        
        // Route distribution
        const routeCount = doses.reduce(
          (acc, dose) => {
            acc[dose.route] = (acc[dose.route] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        const routeDistribution = Object.entries(routeCount)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        // Time distribution
        const timeCount = doses.reduce(
          (acc, dose) => {
            const hour = new Date(dose.timestamp).getHours();
            const timeSlot = `${hour.toString().padStart(2, "0")}:00`;
            acc[timeSlot] = (acc[timeSlot] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        const timeDistribution = Object.entries(timeCount)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name));

        // Monthly trends - last 6 months
        const monthlyTrends = Array.from({ length: 6 }, (_, i) => {
          const date = new Date();
          date.setMonth(date.getMonth() - i);
          const month = format(date, "MMM yy");
          const monthDoses = doses.filter(dose => 
            new Date(dose.timestamp).getMonth() === date.getMonth() &&
            new Date(dose.timestamp).getFullYear() === date.getFullYear()
          );
          return {
            name: month,
            doses: monthDoses.length,
          };
        }).reverse();

        // Substance distribution - top 5
        const substanceCount = doses.reduce((acc, dose) => {
          acc[dose.substance] = (acc[dose.substance] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const substanceDistribution = Object.entries(substanceCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, value]) => ({ name, value }));

        // Calculate patterns and interactions
        const usagePatterns = analyzeUsagePatterns(doses);
        const substanceInteractions = analyzeSubstanceInteractions(doses);
        const recoveryPeriods = calculateRecoveryPeriods(doses);
        const personalPatterns = analyzePersonalPatterns(doses);

        setStats({
          timeCorrelations: [],
          usagePatterns,
          usageForecasts: [],
          substanceInteractions,
          calendarData: [],
          recoveryPeriods,
          personalPatterns,
          totalDoses: doses.length,
          uniqueSubstances: substances.size,
          monthlyTrends,
          substanceDistribution,
          routeDistribution,
          timeDistribution,
          recentActivity: doses
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 5)
            .map(dose => ({
              timestamp: dose.timestamp.toString(),
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

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="patterns">Patterns</TabsTrigger>
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
        <TabsTrigger value="safety">Safety</TabsTrigger>
      </TabsList>

      {/* Overview Tab */}
      <TabsContent value="overview" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
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
            <CardHeader className="font-semibold">Monthly Trends</CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyTrends}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="doses" fill={COLORS[0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
                    innerRadius={60}
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
        </div>
      </TabsContent>

      {/* Rest of the tabs remain as in the modified code */}
      
      {/* Patterns Tab */}
      <TabsContent value="patterns" className="space-y-4">
        <Card>
          <CardHeader className="font-semibold">Usage Patterns</CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.usagePatterns}>
                <XAxis dataKey="substance" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="periodicity" 
                  name="Days Between Doses"
                  stroke={COLORS[0]} 
                />
                <Line 
                  type="monotone" 
                  dataKey="consistency" 
                  name="Consistency Score"
                  stroke={COLORS[1]} 
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Analysis Tab */}
      <TabsContent value="analysis" className="space-y-4">
        <Card>
          <CardHeader className="font-semibold">Dose Correlations</CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.personalPatterns}>
                <XAxis dataKey="substance" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="recentTrends.avgDailyDose" 
                  name="Average Daily Dose"
                  stroke={COLORS[0]} 
                />
                <Line 
                  type="monotone" 
                  dataKey="recentTrends.avgTimeBetweenDoses" 
                  name="Hours Between Doses"
                  stroke={COLORS[1]} 
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Safety Tab */}
      <TabsContent value="safety" className="space-y-4">
        {stats.substanceInteractions.map((interaction, index) => (
          <Alert
            key={index}
            variant={interaction.riskLevel === "critical" ? "destructive" : "default"}
            className="relative overflow-hidden"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {interaction.substances.join(" + ")} - {interaction.riskLevel.toUpperCase()}
            </AlertTitle>
            <AlertDescription className="mt-2">
              <div className="space-y-2">
                <p>Time Gap: {interaction.timeGap.toFixed(1)} hours</p>
                <p>Frequency: {interaction.frequency} occurrences</p>
                <div 
                  className="w-full h-2 rounded-full mt-2"
                  style={{
                    background: `linear-gradient(90deg, ${COLORS[2]} ${interaction.frequency * 10}%, transparent ${interaction.frequency * 10}%)`
                  }}
                />
              </div>
            </AlertDescription>
          </Alert>
        ))}
      </TabsContent>
    </Tabs>
  );
}