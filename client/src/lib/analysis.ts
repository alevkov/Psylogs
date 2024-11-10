import { DoseEntry } from "./constants";
import {
  differenceInDays,
  differenceInHours,
} from "date-fns";
import regression from "regression";

// Substance interaction thresholds (in hours)
export const INTERACTION_THRESHOLDS = {
  default: 24,
  high_risk: 12,
  critical: 6,
};

interface SubstanceInteraction {
  substances: string[];
  riskLevel: "low" | "moderate" | "high" | "critical";
  timeGap: number;
  frequency: number;
}

export function analyzeSubstanceInteractions(doses: DoseEntry[]): SubstanceInteraction[] {
  const interactions: SubstanceInteraction[] = [];
  const recentDoses = doses.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Track substance combinations
  const combinations = new Map<string, { count: number; minGap: number }>();

  for (let i = 0; i < recentDoses.length; i++) {
    for (let j = i + 1; j < recentDoses.length; j++) {
      const dose1 = recentDoses[i];
      const dose2 = recentDoses[j];

      if (dose1.substance === dose2.substance) continue;

      const timeGap = differenceInHours(
        new Date(dose1.timestamp),
        new Date(dose2.timestamp),
      );

      if (timeGap > INTERACTION_THRESHOLDS.default) continue;

      const substancePair = [dose1.substance, dose2.substance].sort().join("_");
      const current = combinations.get(substancePair) || {
        count: 0,
        minGap: Infinity,
      };

      combinations.set(substancePair, {
        count: current.count + 1,
        minGap: Math.min(current.minGap, timeGap),
      });
    }
  }

  // Convert combinations to interactions
  combinations.forEach((data, substancePair) => {
    const substances = substancePair.split("_");
    let riskLevel: SubstanceInteraction["riskLevel"] = "low";

    if (data.minGap <= INTERACTION_THRESHOLDS.critical) {
      riskLevel = "critical";
    } else if (data.minGap <= INTERACTION_THRESHOLDS.high_risk) {
      riskLevel = "high";
    } else if (data.minGap <= INTERACTION_THRESHOLDS.default) {
      riskLevel = "moderate";
    }

    interactions.push({
      substances,
      riskLevel,
      timeGap: data.minGap,
      frequency: data.count,
    });
  });

  return interactions.sort((a, b) => a.timeGap - b.timeGap);
}

export interface UnitSpecificStats {
  unit: string;
  totalAmount: number;
  averageAmount: number;
  medianAmount: number;
  minAmount: number;
  maxAmount: number;
  standardDeviation: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  commonSubstances: Array<{
    substance: string;
    totalAmount: number;
    frequency: number;
  }>;
  recentTrends: {
    weeklyChange: number;
    monthlyChange: number;
    averageFrequency: number; // doses per day
  };
}

export function calculateUnitSpecificStats(doses: DoseEntry[]): UnitSpecificStats[] {
  const unitDoses = new Map<string, DoseEntry[]>();
  
  // Group doses by unit
  doses.forEach(dose => {
    if (!unitDoses.has(dose.unit)) {
      unitDoses.set(dose.unit, []);
    }
    unitDoses.get(dose.unit)?.push(dose);
  });

  return Array.from(unitDoses.entries()).map(([unit, unitDoses]) => {
    const amounts = unitDoses.map(d => d.amount);
    const sortedAmounts = [...amounts].sort((a, b) => a - b);
    const totalAmount = amounts.reduce((sum, amt) => sum + amt, 0);
    const averageAmount = totalAmount / amounts.length;
    const medianAmount = sortedAmounts.length % 2 === 0
      ? (sortedAmounts[sortedAmounts.length / 2 - 1] + sortedAmounts[sortedAmounts.length / 2]) / 2
      : sortedAmounts[Math.floor(sortedAmounts.length / 2)];

    // Calculate standard deviation
    const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - averageAmount, 2), 0) / amounts.length;
    const standardDeviation = Math.sqrt(variance);

    // Calculate trend
    const sortedDoses = unitDoses.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const trendData = sortedDoses.map((dose, index) => [index, dose.amount]);
    const trendResult = regression.linear(trendData);
    const trend = trendResult.equation[0] > 0.1 
      ? 'increasing' 
      : trendResult.equation[0] < -0.1 
        ? 'decreasing' 
        : 'stable';

    // Calculate substance-specific stats
    const substanceStats = new Map<string, { totalAmount: number; frequency: number }>();
    unitDoses.forEach(dose => {
      if (!substanceStats.has(dose.substance)) {
        substanceStats.set(dose.substance, { totalAmount: 0, frequency: 0 });
      }
      const stats = substanceStats.get(dose.substance)!;
      stats.totalAmount += dose.amount;
      stats.frequency += 1;
    });

    const commonSubstances = Array.from(substanceStats.entries())
      .map(([substance, stats]) => ({
        substance,
        totalAmount: stats.totalAmount,
        frequency: stats.frequency,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    // Calculate recent trends
    const now = new Date();
    const lastWeekDoses = unitDoses.filter(d => 
      differenceInDays(now, new Date(d.timestamp)) <= 7
    );
    const previousWeekDoses = unitDoses.filter(d => 
      differenceInDays(now, new Date(d.timestamp)) > 7 &&
      differenceInDays(now, new Date(d.timestamp)) <= 14
    );
    const weeklyChange = previousWeekDoses.length
      ? (lastWeekDoses.length - previousWeekDoses.length) / previousWeekDoses.length
      : 0;

    const lastMonthDoses = unitDoses.filter(d =>
      differenceInDays(now, new Date(d.timestamp)) <= 30
    );
    const previousMonthDoses = unitDoses.filter(d =>
      differenceInDays(now, new Date(d.timestamp)) > 30 &&
      differenceInDays(now, new Date(d.timestamp)) <= 60
    );
    const monthlyChange = previousMonthDoses.length
      ? (lastMonthDoses.length - previousMonthDoses.length) / previousMonthDoses.length
      : 0;

    return {
      unit,
      totalAmount,
      averageAmount,
      medianAmount,
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      standardDeviation,
      trend,
      commonSubstances,
      recentTrends: {
        weeklyChange,
        monthlyChange,
        averageFrequency: unitDoses.length / Math.max(1, differenceInDays(
          now,
          new Date(sortedDoses[0].timestamp)
        )),
      },
    };
  });
}
