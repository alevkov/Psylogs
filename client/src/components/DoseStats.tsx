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
  Rectangle,
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

// Custom component for the heatmap cells
const HeatMapCell = (props: any) => {
  const { x, y, width, height, value } = props;
  const intensity = Math.min(value / 10, 1);
  return (
    <Rectangle
      x={x}
      y={y}
      width={width}
      height={height}
      fill={`rgba(255, 107, 107, ${intensity})`}
      stroke="#fff"
    />
  );
};

export function DoseStats() {
  // ... [Previous state and useEffect code remains the same up to the Analysis tab] ...

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="patterns">Patterns</TabsTrigger>
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
        <TabsTrigger value="safety">Safety</TabsTrigger>
      </TabsList>

      {/* Previous tabs content remains the same */}

      {/* Analysis Tab Content */}
      <TabsContent value="analysis" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Correlation Matrix */}
          <Card>
            <CardHeader className="font-semibold">Substance Correlation Matrix</CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="category"
                    dataKey="substance1"
                    name="Substance 1"
                    interval={0}
                    tick={{ fontSize: 12, angle: -45, textAnchor: 'end' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="substance2"
                    name="Substance 2"
                    interval={0}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 border rounded shadow-lg">
                            <p>{`${data.substance1} + ${data.substance2}`}</p>
                            <p>{`Correlation: ${(data.correlation * 100).toFixed(1)}%`}</p>
                            <p>{`Common Days: ${data.commonDays}`}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter
                    data={stats.timeCorrelations}
                    shape={HeatMapCell}
                    fill="#FF6B6B"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Time Distribution Heat Map */}
          <Card>
            <CardHeader className="font-semibold">Usage Time Distribution</CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 60, left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="category"
                    dataKey="hour"
                    name="Hour"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="day"
                    name="Day"
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 border rounded shadow-lg">
                            <p>{`${data.day} at ${data.hour}:00`}</p>
                            <p>{`${data.value} doses`}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter
                    data={stats.timeDistribution.map((t) => ({
                      hour: t.name,
                      day: "All Days",
                      value: t.count,
                    }))}
                    shape={HeatMapCell}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Substance Interaction Network */}
          <Card>
            <CardHeader className="font-semibold">Substance Interactions</CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.substanceInteractions}
                  margin={{ top: 20, right: 20, bottom: 60, left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey={(interaction) => interaction.substances.join(" + ")}
                    tick={{ fontSize: 12, angle: -45, textAnchor: 'end' }}
                  />
                  <YAxis />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 border rounded shadow-lg">
                            <p className="font-semibold">{data.substances.join(" + ")}</p>
                            <p>{`Risk Level: ${data.riskLevel}`}</p>
                            <p>{`Time Gap: ${data.timeGap.toFixed(1)}h`}</p>
                            <p>{`Frequency: ${data.frequency} times`}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="frequency"
                    fill="#FF6B6B"
                    name="Interaction Frequency"
                  >
                    {stats.substanceInteractions.map((_, index) => (
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

          {/* Pattern Analysis */}
          <Card>
            <CardHeader className="font-semibold">Pattern Analysis</CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 60, left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="consistency"
                    name="Pattern Consistency"
                    domain={[0, 1]}
                    label={{ value: 'Consistency Score', position: 'bottom' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="periodicity"
                    name="Days Between Doses"
                    label={{ value: 'Days Between Doses', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 border rounded shadow-lg">
                            <p className="font-semibold">{data.substance}</p>
                            <p>{`Consistency: ${(data.consistency * 100).toFixed(1)}%`}</p>
                            <p>{`Period: ${data.periodicity.toFixed(1)} days`}</p>
                            <p>{`Trend: ${data.trend}`}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  {stats.usagePatterns.map((pattern, index) => (
                    <Scatter
                      key={pattern.substance}
                      name={pattern.substance}
                      data={[pattern]}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* Safety tab content remains the same */}
    </Tabs>
  );
}
