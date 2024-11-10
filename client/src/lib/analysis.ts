import { DoseEntry } from './constants';
import { 
  eachDayOfInterval, 
  differenceInHours,
  differenceInDays,
  isSameDay,
  startOfDay,
} from 'date-fns';

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

// Helper functions
function average(numbers: number[]): number {
  return numbers.length ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : 0;
}

function standardDeviation(numbers: number[]): number {
  const avg = average(numbers);
  const squareDiffs = numbers.map(n => Math.pow(n - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

export function analyzePersonalPatterns(doses: DoseEntry[]): EnhancedUsagePattern[] {
  try {
    const substanceDoses = new Map<string, DoseEntry[]>();

    // Group doses by substance
    doses.forEach(dose => {
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
          doseSizeTrend: 0,
          frequencyTrend: 0,
          weekOverWeekChange: 0,
          monthOverMonthChange: 0
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