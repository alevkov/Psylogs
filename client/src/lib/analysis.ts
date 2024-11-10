import { DoseEntry } from './constants';
import { 
  eachDayOfInterval, 
  eachWeekOfInterval,
  eachMonthOfInterval,
  startOfDay,
  startOfWeek,
  format,
  getDay,
  getWeek,
  startOfMonth,
  addWeeks,
  addMonths,
  differenceInHours,
  differenceInDays,
  isSameDay,
  subMonths,
  subDays,
} from 'date-fns';
import regression from 'regression';

// Substance interaction thresholds (in hours)
export const INTERACTION_THRESHOLDS: Record<string, number> = {
  default: 24,
  high_risk: 12,
  critical: 6
};

// Effect duration estimates (in hours)
export const EFFECT_DURATIONS: Record<string, number> = {
  default: 4,
  short: 2,
  medium: 6,
  long: 12
};

// Unit conversion factors (base unit is mg)
export const UNIT_CONVERSION: Record<string, number> = {
  'mg': 1,
  'g': 1000,
  'ug': 0.001,
  'ml': 1 // Assuming 1ml = 1mg for simplicity, adjust based on substance
};

export function convertDoseUnit(amount: number, fromUnit: string, toUnit: string): number {
  const fromFactor = UNIT_CONVERSION[fromUnit.toLowerCase()] || 1;
  const toFactor = UNIT_CONVERSION[toUnit.toLowerCase()] || 1;
  return (amount * fromFactor) / toFactor;
}

export interface TimeCorrelation {
  substance1: string;
  substance2: string;
  correlation: number;
  commonDays: number;
}

export interface UsagePattern {
  substance: string;
  periodicity: number;  // Average days between doses
  consistency: number;  // 0-1 score of how consistent the pattern is
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface CalendarDataPoint {
  week: number;
  weekday: string;
  date: Date;
  doses: number;
}

export function calculateTimeCorrelations(doses: DoseEntry[]): TimeCorrelation[] {
  const substanceDays = new Map<string, Set<string>>();

  // Group doses by substance and day
  doses.forEach(dose => {
    const day = startOfDay(new Date(dose.timestamp)).toISOString();
    if (!substanceDays.has(dose.substance)) {
      substanceDays.set(dose.substance, new Set());
    }
    substanceDays.get(dose.substance)?.add(day);
  });

  const correlations: TimeCorrelation[] = [];
  const substances = Array.from(substanceDays.keys());

  // Calculate correlations between each pair of substances
  for (let i = 0; i < substances.length; i++) {
    for (let j = i + 1; j < substances.length; j++) {
      const substance1 = substances[i];
      const substance2 = substances[j];
      const days1 = Array.from(substanceDays.get(substance1) || []);
      const days2 = Array.from(substanceDays.get(substance2) || []);

      // Find common days
      const commonDays = days1.filter(day => days2.includes(day)).length;
      const totalDays = new Set([...days1, ...days2]).size;

      // Calculate correlation coefficient
      const correlation = commonDays / Math.sqrt(days1.length * days2.length);

      correlations.push({
        substance1,
        substance2,
        correlation,
        commonDays
      });
    }
  }

  return correlations.sort((a, b) => b.correlation - a.correlation);
}

export function analyzeUsagePatterns(doses: DoseEntry[]): UsagePattern[] {
  const patterns: UsagePattern[] = [];
  const substanceDoses = new Map<string, DoseEntry[]>();

  // Group doses by substance
  doses.forEach(dose => {
    if (!substanceDoses.has(dose.substance)) {
      substanceDoses.set(dose.substance, []);
    }
    substanceDoses.get(dose.substance)?.push(dose);
  });

  substanceDoses.forEach((substanceDoses, substance) => {
    if (substanceDoses.length < 2) return;

    // Sort doses by timestamp
    const sortedDoses = substanceDoses.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Calculate time gaps between doses
    const gaps = [];
    for (let i = 1; i < sortedDoses.length; i++) {
      gaps.push(differenceInDays(
        new Date(sortedDoses[i].timestamp),
        new Date(sortedDoses[i-1].timestamp)
      ));
    }

    // Calculate average gap and consistency
    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
    const stdDev = Math.sqrt(variance);
    const consistency = Math.max(0, Math.min(1, 1 - (stdDev / avgGap)));

    // Calculate trend using linear regression
    const trendData = sortedDoses.map((dose, index) => [
      index,
      dose.amount
    ]);
    
    const trendResult = regression.linear(trendData);
    const trend = trendResult.equation[0] > 0.1 ? 'increasing' 
                 : trendResult.equation[0] < -0.1 ? 'decreasing' 
                 : 'stable';

    patterns.push({
      substance,
      periodicity: avgGap,
      consistency,
      trend
    });
  });

  return patterns.sort((a, b) => b.consistency - a.consistency);
}

export function analyzeSubstanceInteractions(doses: DoseEntry[]) {
  const interactions = [];
  const recentDoses = doses.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Track substance combinations
  const combinations = new Map<string, { count: number, minGap: number }>();

  for (let i = 0; i < recentDoses.length; i++) {
    for (let j = i + 1; j < recentDoses.length; j++) {
      const dose1 = recentDoses[i];
      const dose2 = recentDoses[j];

      if (dose1.substance === dose2.substance) continue;

      const timeGap = differenceInHours(
        new Date(dose1.timestamp),
        new Date(dose2.timestamp)
      );

      if (timeGap > INTERACTION_THRESHOLDS.default) continue;

      const substancePair = [dose1.substance, dose2.substance].sort().join('_');
      const current = combinations.get(substancePair) || { count: 0, minGap: Infinity };

      combinations.set(substancePair, {
        count: current.count + 1,
        minGap: Math.min(current.minGap, timeGap)
      });
    }
  }

  // Convert combinations to interactions
  combinations.forEach((data, substancePair) => {
    const substances = substancePair.split('_');
    let riskLevel: 'low' | 'moderate' | 'high' | 'critical' = 'low';

    if (data.minGap <= INTERACTION_THRESHOLDS.critical) {
      riskLevel = 'critical';
    } else if (data.minGap <= INTERACTION_THRESHOLDS.high_risk) {
      riskLevel = 'high';
    } else if (data.minGap <= INTERACTION_THRESHOLDS.default) {
      riskLevel = 'moderate';
    }

    interactions.push({
      substances,
      riskLevel,
      timeGap: data.minGap,
      frequency: data.count
    });
  });

  return interactions.sort((a, b) => {
    const riskLevels = { critical: 3, high: 2, moderate: 1, low: 0 };
    return riskLevels[b.riskLevel] - riskLevels[a.riskLevel] || 
           b.frequency - a.frequency;
  });
}

export function analyzePersonalPatterns(doses: DoseEntry[]) {
  const patterns = [];
  const substanceDoses = new Map<string, DoseEntry[]>();

  // Group doses by substance
  doses.forEach(dose => {
    if (!substanceDoses.has(dose.substance)) {
      substanceDoses.set(dose.substance, []);
    }
    substanceDoses.get(dose.substance)?.push(dose);
  });

  substanceDoses.forEach((substanceDoses, substance) => {
    if (substanceDoses.length < 2) return;

    const sortedDoses = substanceDoses.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Calculate basic metrics
    const amounts = sortedDoses.map(d => d.amount);
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const stdDev = Math.sqrt(
      amounts.reduce((sum, amt) => sum + Math.pow(amt - avgAmount, 2), 0) / amounts.length
    );

    // Calculate trend
    const trendData = sortedDoses.map((dose, index) => [
      index,
      dose.amount
    ]);
    const trendResult = regression.linear(trendData);
    const trend = trendResult.equation[0] > 0.1 ? 'increasing' 
                 : trendResult.equation[0] < -0.1 ? 'decreasing' 
                 : 'stable';

    patterns.push({
      substance,
      avgAmount,
      stdDev,
      trend,
      totalDoses: sortedDoses.length,
      firstDose: sortedDoses[0].timestamp,
      lastDose: sortedDoses[sortedDoses.length - 1].timestamp
    });
  });

  return patterns.sort((a, b) => b.totalDoses - a.totalDoses);
}
