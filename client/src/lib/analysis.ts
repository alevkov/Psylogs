import { DoseEntry } from './constants';
import { 
  eachDayOfInterval, 
  eachWeekOfInterval,
  eachMonthOfInterval,
  startOfDay,
  startOfWeek,
  startOfMonth,
  addWeeks,
  addMonths,
  differenceInHours,
  differenceInDays,
  isSameDay,
  subMonths 
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

interface TimeCorrelation {
  substance1: string;
  substance2: string;
  correlation: number;
  commonDays: number;
}

interface UsagePattern {
  substance: string;
  periodicity: number;  // Average days between doses
  consistency: number;  // 0-1 score of how consistent the pattern is
  trend: 'increasing' | 'decreasing' | 'stable';
}

interface UsageForecast {
  substance: string;
  predictedDoses: Array<{
    date: Date;
    amount: number;
    confidence: number;
  }>;
}

interface SubstanceInteraction {
  substances: string[];
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  timeGap: number;
  frequency: number;
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
      const days1 = substanceDays.get(substance1)!;
      const days2 = substanceDays.get(substance2)!;

      // Find common days
      const commonDays = Array.from(days1).filter(day => days2.has(day)).length;
      const totalDays = new Set([...days1, ...days2]).size;

      // Calculate correlation coefficient
      const correlation = commonDays / Math.sqrt(days1.size * days2.size);

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
    const consistency = 1 / (1 + variance);

    // Calculate trend
    const recentDoses = sortedDoses.slice(-5);
    const trend = recentDoses.length > 1
      ? recentDoses[recentDoses.length - 1].amount > recentDoses[0].amount
        ? 'increasing'
        : recentDoses[recentDoses.length - 1].amount < recentDoses[0].amount
          ? 'decreasing'
          : 'stable'
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

export function generateUsageForecast(
  doses: DoseEntry[],
  daysToForecast: number = 30
): UsageForecast[] {
  const forecasts: UsageForecast[] = [];
  const substanceDoses = new Map<string, DoseEntry[]>();

  // Group doses by substance
  doses.forEach(dose => {
    if (!substanceDoses.has(dose.substance)) {
      substanceDoses.set(dose.substance, []);
    }
    substanceDoses.get(dose.substance)?.push(dose);
  });

  substanceDoses.forEach((substanceDoses, substance) => {
    if (substanceDoses.length < 5) return; // Need minimum data points

    // Prepare data for regression
    const data = substanceDoses.map(dose => [
      new Date(dose.timestamp).getTime(),
      dose.amount
    ]);

    // Perform linear regression
    const result = regression.linear(data);

    // Generate predictions
    const lastDoseTime = Math.max(...data.map(d => d[0]));
    const predictedDoses = [];

    for (let i = 1; i <= daysToForecast; i++) {
      const futureTime = lastDoseTime + (i * 24 * 60 * 60 * 1000);
      const [, predictedAmount] = result.predict(futureTime);
      
      // Calculate confidence based on R² value
      const confidence = Math.max(0, Math.min(1, result.r2));

      predictedDoses.push({
        date: new Date(futureTime),
        amount: Math.max(0, predictedAmount), // Ensure non-negative
        confidence
      });
    }

    forecasts.push({
      substance,
      predictedDoses
    });
  });

  return forecasts;
}

export function analyzeSubstanceInteractions(doses: DoseEntry[]): SubstanceInteraction[] {
  const interactions: SubstanceInteraction[] = [];
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
    let riskLevel: SubstanceInteraction['riskLevel'] = 'low';

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
    // Sort by risk level first, then frequency
    const riskLevels = { critical: 3, high: 2, moderate: 1, low: 0 };
    return riskLevels[b.riskLevel] - riskLevels[a.riskLevel] || 
           b.frequency - a.frequency;
  });
}

export function generateCalendarData(doses: DoseEntry[]) {
  const startDate = subMonths(new Date(), 12); // Last 12 months
  const endDate = new Date();
  
  // Create a map of dates to dose counts
  const doseCounts = new Map<string, number>();
  
  doses.forEach(dose => {
    const date = startOfDay(new Date(dose.timestamp)).toISOString();
    doseCounts.set(date, (doseCounts.get(date) || 0) + 1);
  });

  // Generate calendar data
  return eachDayOfInterval({ start: startDate, end: endDate })
    .map(date => ({
      day: date.toISOString(),
      value: doseCounts.get(date.toISOString()) || 0
    }));
}

export function calculateRecoveryPeriods(doses: DoseEntry[]) {
  const substanceRecovery = new Map<string, number>();
  const recentDoses = doses.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  recentDoses.forEach(dose => {
    const prevRecovery = substanceRecovery.get(dose.substance) || 0;
    const duration = EFFECT_DURATIONS[dose.substance] || EFFECT_DURATIONS.default;
    
    // Extend recovery period if doses overlap
    const newRecovery = Math.max(
      prevRecovery,
      duration * (dose.amount / 100) // Scale by dose amount
    );

    substanceRecovery.set(dose.substance, newRecovery);
  });

  return Array.from(substanceRecovery.entries()).map(([substance, hours]) => ({
    substance,
    recommendedHours: Math.ceil(hours)
  }));
}
