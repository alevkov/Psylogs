import { DoseEntry } from './constants';
import { 
  eachDayOfInterval, 
  differenceInHours,
  differenceInDays,
  isSameDay,
  startOfDay,
} from 'date-fns';

// Unit conversion constants
export const UNIT_CONVERSION = {
  ML_TO_MG: 1000, // 1ml = 1000mg
};

// Substance interaction thresholds (in hours)
export const INTERACTION_THRESHOLDS = {
  default: 24,
  high_risk: 12,
  critical: 6
};

// Interface definitions
export interface EnhancedUsagePattern {
  substance: string;
  recentTrends: {
    avgDailyDose: number;
    avgTimeBetweenDoses: number;
    consecutiveDays: number;
    longestBreak: number;
    commonTimeOfDay: string;
    preferredRoute: string;
    typicalDoseRange: {
      min: number;
      max: number;
      avg: number;
    };
  };
  changeMetrics: {
    doseSizeTrend: number;
    frequencyTrend: number;
    weekOverWeekChange: number;
    monthOverMonthChange: number;
  };
  variationMetrics: {
    doseConsistency: number;
    timingConsistency: number;
    routeConsistency: number;
  };
}

// Unit conversion functions
export function convertDoseUnit(amount: number, fromUnit: string, toUnit: string): number {
  try {
    const normalizedFromUnit = normalizeUnit(fromUnit);
    const normalizedToUnit = normalizeUnit(toUnit);
    
    if (normalizedFromUnit === normalizedToUnit) return amount;
    
    // Handle ml to mg conversion
    if (normalizedFromUnit === 'ml' && normalizedToUnit === 'mg') {
      return amount * UNIT_CONVERSION.ML_TO_MG;
    }
    
    // Handle mg to ml conversion
    if (normalizedFromUnit === 'mg' && normalizedToUnit === 'ml') {
      return amount / UNIT_CONVERSION.ML_TO_MG;
    }
    
    throw new Error(`Unsupported unit conversion: ${fromUnit} to ${toUnit}`);
  } catch (error) {
    console.error(`Error converting units: ${error}`);
    throw error;
  }
}

// Normalize units to standard format
function normalizeUnit(unit: string): string {
  const unitMap: Record<string, string> = {
    'mg': 'mg',
    'g': 'mg',
    'mcg': 'mg',
    'ug': 'mg',
    'ml': 'ml',
    'mL': 'ml',
  };
  
  const normalized = unitMap[unit.toLowerCase()];
  if (!normalized) {
    throw new Error(`Unsupported unit: ${unit}`);
  }
  
  return normalized;
}

// Helper functions
function average(numbers: number[]): number {
  return numbers.length ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : 0;
}

function standardDeviation(numbers: number[]): number {
  const avg = average(numbers);
  const squareDiffs = numbers.map(n => Math.pow(n - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

// Time correlation analysis
export function calculateTimeCorrelations(doses: DoseEntry[]) {
  try {
    const substanceDays = new Map<string, Set<string>>();

    // Group doses by substance and day
    doses.forEach(dose => {
      const day = startOfDay(new Date(dose.timestamp)).toISOString();
      if (!substanceDays.has(dose.substance)) {
        substanceDays.set(dose.substance, new Set());
      }
      substanceDays.get(dose.substance)?.add(day);
    });

    const correlations = [];
    const substances = Array.from(substanceDays.keys());

    // Calculate correlations between substance pairs
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

        if (correlation > 0) {
          correlations.push({
            substance1,
            substance2,
            correlation,
            commonDays
          });
        }
      }
    }

    return correlations.sort((a, b) => b.correlation - a.correlation);
  } catch (error) {
    console.error('Error calculating time correlations:', error);
    return [];
  }
}

// Update the function to normalize units before calculations
export function analyzePersonalPatterns(doses: DoseEntry[]): EnhancedUsagePattern[] {
  try {
    const normalizedDoses = doses.map(dose => ({
      ...dose,
      amount: dose.unit.toLowerCase() === 'ml' 
        ? convertDoseUnit(dose.amount, 'ml', 'mg')
        : dose.amount,
      unit: dose.unit.toLowerCase() === 'ml' ? 'mg' : dose.unit
    }));

    const substanceDoses = new Map<string, DoseEntry[]>();

    // Group doses by substance
    normalizedDoses.forEach(dose => {
      if (!substanceDoses.has(dose.substance)) {
        substanceDoses.set(dose.substance, []);
      }
      substanceDoses.get(dose.substance)?.push(dose);
    });

    return Array.from(substanceDoses.entries()).map(([substance, doses]) => {
      const sortedDoses = doses.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Calculate time between doses
      const timeBetweenDoses = sortedDoses.slice(1).map((dose, i) => 
        differenceInHours(new Date(sortedDoses[i].timestamp), new Date(dose.timestamp))
      );

      // Calculate dose amounts statistics
      const amounts = sortedDoses.map(d => d.amount);
      const avgAmount = average(amounts);

      // Calculate consecutive days
      let consecutiveDays = 0;
      let currentStreak = 0;
      let currentDate = startOfDay(new Date(sortedDoses[0].timestamp));

      sortedDoses.forEach(dose => {
        if (isSameDay(currentDate, new Date(dose.timestamp)) || 
            differenceInDays(currentDate, new Date(dose.timestamp)) === 1) {
          currentStreak++;
          currentDate = startOfDay(new Date(dose.timestamp));
        } else {
          consecutiveDays = Math.max(consecutiveDays, currentStreak);
          currentStreak = 1;
          currentDate = startOfDay(new Date(dose.timestamp));
        }
      });
      consecutiveDays = Math.max(consecutiveDays, currentStreak);

      // Find most common time of day
      const hourCounts = new Map<number, number>();
      sortedDoses.forEach(dose => {
        const hour = new Date(dose.timestamp).getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      });
      const commonHour = Array.from(hourCounts.entries())
        .sort((a, b) => b[1] - a[1])[0][0];

      // Calculate route preferences
      const routeCounts = new Map<string, number>();
      sortedDoses.forEach(dose => {
        routeCounts.set(dose.route, (routeCounts.get(dose.route) || 0) + 1);
      });
      const preferredRoute = Array.from(routeCounts.entries())
        .sort((a, b) => b[1] - a[1])[0][0];

      // Calculate metrics
      const doseConsistency = 1 - (standardDeviation(amounts) / (avgAmount || 1));
      const timeConsistency = timeBetweenDoses.length > 0 ? 
        1 - (standardDeviation(timeBetweenDoses) / (average(timeBetweenDoses) || 1)) : 1;
      const routeConsistency = Math.max(...Array.from(routeCounts.values())) / sortedDoses.length;

      return {
        substance,
        recentTrends: {
          avgDailyDose: avgAmount,
          avgTimeBetweenDoses: average(timeBetweenDoses),
          consecutiveDays,
          longestBreak: Math.max(...timeBetweenDoses, 0),
          commonTimeOfDay: `${commonHour}:00`,
          preferredRoute,
          typicalDoseRange: {
            min: Math.min(...amounts),
            max: Math.max(...amounts),
            avg: avgAmount
          }
        },
        changeMetrics: {
          doseSizeTrend: 0, // Placeholder for trend calculation
          frequencyTrend: 0, // Placeholder for trend calculation
          weekOverWeekChange: 0, // Placeholder for trend calculation
          monthOverMonthChange: 0 // Placeholder for trend calculation
        },
        variationMetrics: {
          doseConsistency: Math.max(0, Math.min(1, doseConsistency)),
          timingConsistency: Math.max(0, Math.min(1, timeConsistency)),
          routeConsistency
        }
      };
    });
  } catch (error) {
    console.error('Error in analyzePersonalPatterns:', error);
    throw error;
  }
}
