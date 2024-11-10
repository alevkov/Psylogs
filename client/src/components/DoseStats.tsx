import { useEffect, useState } from "react";
import { getDoses } from "@/lib/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, ScatterChart, Scatter
} from "recharts";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, TrendingDown, TrendingUp, ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DoseEntry } from "@/lib/constants";

// Generate colors for charts
const COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEEAD",
  "#D4A5A5", "#9E9E9E", "#58B19F", "#FFD93D", "#6C5B7B"
];

interface TimeCorrelation {
  substance1: string;
  substance2: string;
  correlation: number;
}

interface StatsState {
  timeCorrelations: TimeCorrelation[];
  personalPatterns: Array<{
    substance: string;
    recentTrends?: {
      avgDailyDose?: number;
      preferredRoute?: string;
    }
  }>;
  totalDoses: number;
  uniqueSubstances: number;
  monthlyTrends: Array<{
    name: string;
    doses: number;
  }>;
  substanceDistribution: Array<{
    name: string;
    value: number;
  }>;
  routeDistribution: Array<{
    name: string;
    value: number;
  }>;
  timeDistribution: Array<{
    name: string;
    count: number;
  }>;
  recentActivity: DoseEntry[];
  substanceInteractions: Array<{
    substances: string[];
    timeGap: number;
    frequency: number;
  }>;
  recoveryPeriods: Array<{
    substance: string;
    recommendedHours: number;
  }>;
}

export function DoseStats() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsState>({
    timeCorrelations: [],
    personalPatterns: [],
    totalDoses: 0,
    uniqueSubstances: 0,
    monthlyTrends: [],
    substanceDistribution: [],
    routeDistribution: [],
    timeDistribution: [],
    recentActivity: [],
    substanceInteractions: [],
    recoveryPeriods: []
  });

  useEffect(() => {
    const calculateStats = async () => {
      try {
        setLoading(true);
        const doses = await getDoses();

        // Calculate monthly trends
        const monthlyData = Array.from({ length: 6 }, (_, i) => {
          const month = new Date();
          month.setMonth(month.getMonth() - i);
          const monthDoses = doses.filter(dose => {
            const doseDate = new Date(dose.timestamp);
            return doseDate.getMonth() === month.getMonth() &&
                   doseDate.getFullYear() === month.getFullYear();
          });
          return {
            name: format(month, "MMM yy"),
            doses: monthDoses.length
          };
        }).reverse();

        const substances = new Set(doses.map(d => d.substance));

        setStats({
          timeCorrelations: [],
          personalPatterns: [],
          totalDoses: doses.length,
          uniqueSubstances: substances.size,
          monthlyTrends: monthlyData,
          substanceDistribution: [],
          routeDistribution: [],
          timeDistribution: [],
          recentActivity: doses
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 7),
          substanceInteractions: [],
          recoveryPeriods: []
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
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
        <TabsTrigger value="safety">Safety</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="font-semibold">Usage Overview</CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Total Doses:</span>
                  <span className="font-medium">{stats.totalDoses}</span>
                </div>
                <div className="flex justify-between">
                  <span>Unique Substances:</span>
                  <span className="font-medium">{stats.uniqueSubstances}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="font-semibold">Monthly Trends</CardHeader>
            <CardContent className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.monthlyTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="doses" stroke="#8884d8" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="analysis">
        <div className="space-y-4">
          {stats.personalPatterns.map((pattern, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">{pattern.substance}</h3>
                  <Badge variant="secondary">
                    {pattern.recentTrends?.avgDailyDose?.toFixed(2)} {pattern.recentTrends?.preferredRoute}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="safety">
        <div className="space-y-4">
          {stats.timeCorrelations.map((correlation, index) => (
            <Alert key={index} variant={correlation.correlation > 0.7 ? "destructive" : "default"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Correlation Detected</AlertTitle>
              <AlertDescription>
                {correlation.substance1} and {correlation.substance2} are used together {(correlation.correlation * 100).toFixed(1)}% of the time
              </AlertDescription>
            </Alert>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}