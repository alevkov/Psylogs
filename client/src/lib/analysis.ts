// ... [Previous imports and interfaces remain the same]

export interface UnitSpecificStats {
  unit: string;
  average: number;
  median: number;
  total: number;
  trend: "increasing" | "decreasing" | "stable";
  weeklyTotals: Array<{ week: string; total: number }>;
  monthlyAverages: Array<{ month: string; average: number }>;
  commonSubstances: Array<{ substance: string; percentage: number }>;
}

export function calculateUnitSpecificStats(doses: DoseEntry[]): UnitSpecificStats[] {
  // Group doses by unit
  const dosesByUnit = doses.reduce((acc, dose) => {
    if (!acc[dose.unit]) {
      acc[dose.unit] = [];
    }
    acc[dose.unit].push(dose);
    return acc;
  }, {} as Record<string, DoseEntry[]>);

  return Object.entries(dosesByUnit).map(([unit, unitDoses]) => {
    // Sort doses by timestamp
    const sortedDoses = unitDoses.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Calculate weekly totals
    const weeklyTotals = calculateWeeklyTotals(sortedDoses);
    
    // Calculate monthly averages
    const monthlyAverages = calculateMonthlyAverages(sortedDoses);

    // Calculate common substances
    const substanceStats = calculateSubstancePercentages(sortedDoses);

    // Calculate trend
    const trend = determineTrend(monthlyAverages);

    return {
      unit,
      average: calculateAverageAmount(sortedDoses),
      median: calculateMedianAmount(sortedDoses),
      total: calculateTotalAmount(sortedDoses),
      trend,
      weeklyTotals,
      monthlyAverages,
      commonSubstances: substanceStats
    };
  });
}

function calculateWeeklyTotals(doses: DoseEntry[]): Array<{ week: string; total: number }> {
  const weekMap = new Map<string, number>();
  
  doses.forEach(dose => {
    const week = format(new Date(dose.timestamp), 'yyyy-ww');
    weekMap.set(week, (weekMap.get(week) || 0) + dose.amount);
  });

  return Array.from(weekMap.entries())
    .map(([week, total]) => ({ week, total }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

function calculateMonthlyAverages(doses: DoseEntry[]): Array<{ month: string; average: number }> {
  const monthMap = new Map<string, { total: number; count: number }>();
  
  doses.forEach(dose => {
    const month = format(new Date(dose.timestamp), 'yyyy-MM');
    const current = monthMap.get(month) || { total: 0, count: 0 };
    monthMap.set(month, {
      total: current.total + dose.amount,
      count: current.count + 1
    });
  });

  return Array.from(monthMap.entries())
    .map(([month, { total, count }]) => ({
      month,
      average: total / count
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function calculateSubstancePercentages(doses: DoseEntry[]): Array<{ substance: string; percentage: number }> {
  const substanceCounts = doses.reduce((acc, dose) => {
    acc[dose.substance] = (acc[dose.substance] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const total = Object.values(substanceCounts).reduce((sum, count) => sum + count, 0);

  return Object.entries(substanceCounts)
    .map(([substance, count]) => ({
      substance,
      percentage: (count / total) * 100
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5); // Top 5 substances
}

function determineTrend(monthlyAverages: Array<{ month: string; average: number }>): "increasing" | "decreasing" | "stable" {
  if (monthlyAverages.length < 2) return "stable";

  const recent = monthlyAverages.slice(-3); // Last 3 months
  if (recent.length < 2) return "stable";

  const firstAvg = recent[0].average;
  const lastAvg = recent[recent.length - 1].average;
  const percentChange = ((lastAvg - firstAvg) / firstAvg) * 100;

  if (percentChange > 10) return "increasing";
  if (percentChange < -10) return "decreasing";
  return "stable";
}

function calculateAverageAmount(doses: DoseEntry[]): number {
  if (doses.length === 0) return 0;
  return doses.reduce((sum, dose) => sum + dose.amount, 0) / doses.length;
}

function calculateMedianAmount(doses: DoseEntry[]): number {
  if (doses.length === 0) return 0;
  const sorted = [...doses].sort((a, b) => a.amount - b.amount);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1].amount + sorted[mid].amount) / 2
    : sorted[mid].amount;
}

function calculateTotalAmount(doses: DoseEntry[]): number {
  return doses.reduce((sum, dose) => sum + dose.amount, 0);
}

// ... [Rest of the existing code remains the same]
