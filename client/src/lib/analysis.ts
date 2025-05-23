import { DoseEntry } from "./constants";
import {
  eachDayOfInterval,
  startOfDay,
  getDay,
  getWeek,
  differenceInHours,
  differenceInDays,
  subMonths,
} from "date-fns";
import regression from "regression";


export const INTERACTION_THRESHOLDS: Record<string, number> = {
  default: 24,
  high_risk: 12,
  critical: 6,
};


export const EFFECT_DURATIONS: Record<string, number> = {
  default: 4,
  short: 2,
  medium: 6,
  long: 12,
};

interface TimeCorrelation {
  substance1: string;
  substance2: string;
  correlation: number;
  commonDays: number;
}

interface UsagePattern {
  substance: string;
  periodicity: number; 
  consistency: number; 
  trend: "increasing" | "decreasing" | "stable";
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
  riskLevel: "low" | "moderate" | "high" | "critical";
  timeGap: number;
  frequency: number;
}

export interface CalendarDataPoint {
  week: number;
  weekday: string;
  date: Date;
  doses: number;
}

export function calculateTimeCorrelations(
  doses: DoseEntry[],
): TimeCorrelation[] {
  const substanceDays = new Map<string, Set<string>>();


  doses.forEach((dose) => {
    const day = startOfDay(new Date(dose.timestamp)).toISOString();
    if (!substanceDays.has(dose.substance)) {
      substanceDays.set(dose.substance, new Set());
    }
    substanceDays.get(dose.substance)?.add(day);
  });

  const correlations: TimeCorrelation[] = [];
  const substances = Array.from(substanceDays.keys());


  for (let i = 0; i < substances.length; i++) {
    for (let j = i + 1; j < substances.length; j++) {
      const substance1 = substances[i];
      const substance2 = substances[j];
      const days1 = Array.from(substanceDays.get(substance1) || []);
      const days2 = Array.from(substanceDays.get(substance2) || []);


      const commonDays = days1.filter((day) => days2.indexOf(day) !== -1).length;
      const totalDays = new Set([...days1, ...days2]).size;


      const correlation = commonDays / Math.sqrt(days1.length * days2.length);

      correlations.push({
        substance1,
        substance2,
        correlation,
        commonDays,
      });
    }
  }

  return correlations.sort((a, b) => b.correlation - a.correlation);
}

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

export function analyzePersonalPatterns(
  doses: DoseEntry[],
): EnhancedUsagePattern[] {
  const substanceDoses = new Map<string, DoseEntry[]>();


  doses.forEach((dose) => {
    if (!substanceDoses.has(dose.substance)) {
      substanceDoses.set(dose.substance, []);
    }
    substanceDoses.get(dose.substance)?.push(dose);
  });

  return Array.from(substanceDoses.entries()).map(([substance, doses]) => {
    const sortedDoses = doses.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );


    const timeBetweenDoses = sortedDoses
      .slice(0, -1)
      .map((dose, i) =>
        differenceInHours(
          new Date(dose.timestamp),
          new Date(sortedDoses[i + 1].timestamp),
        ),
      );


    const amounts = sortedDoses.map((d) => d.amount);
    const avgAmount =
      amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;


    let consecutiveDays = 0;
    let currentStreak = 1;
    let previousDate = null;


    const chronologicalDoses = [...sortedDoses].reverse();

    chronologicalDoses.forEach((dose, index) => {
      const doseDate = startOfDay(new Date(dose.timestamp));

      if (index === 0) {

        previousDate = doseDate;
        currentStreak = 1;
      } else {
        const dayDiff = differenceInDays(doseDate, previousDate);

        if (dayDiff === 1 || dayDiff === 0) {

          if (dayDiff === 1) {
            currentStreak++;
          }
          previousDate = doseDate;
        } else {

          consecutiveDays = Math.max(consecutiveDays, currentStreak);
          currentStreak = 1;
          previousDate = doseDate;
        }
      }
    });


    consecutiveDays = Math.max(consecutiveDays, currentStreak);


    const hourCounts = new Map<number, number>();
    sortedDoses.forEach((dose) => {
      const hour = new Date(dose.timestamp).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });
    const commonHour = Array.from(hourCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0][0];


    const routeCounts = new Map<string, number>();
    sortedDoses.forEach((dose) => {
      routeCounts.set(dose.route, (routeCounts.get(dose.route) || 0) + 1);
    });
    const preferredRoute = Array.from(routeCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0][0];


    const recentDoses = sortedDoses.slice(0, Math.min(10, sortedDoses.length));
    const olderDoses = sortedDoses.slice(Math.min(10, sortedDoses.length));

    const recentAvg =
      recentDoses.reduce((sum, d) => sum + d.amount, 0) / recentDoses.length;
    const olderAvg = olderDoses.length
      ? olderDoses.reduce((sum, d) => sum + d.amount, 0) / olderDoses.length
      : recentAvg;

    const doseSizeTrend = olderAvg ? (recentAvg - olderAvg) / olderAvg : 0;


    const now = new Date();
    const lastWeekDoses = sortedDoses.filter(
      (d) => differenceInDays(now, new Date(d.timestamp)) <= 7,
    ).length;
    const previousWeekDoses = sortedDoses.filter(
      (d) =>
        differenceInDays(now, new Date(d.timestamp)) > 7 &&
        differenceInDays(now, new Date(d.timestamp)) <= 14,
    ).length;
    const weekOverWeekChange = previousWeekDoses
      ? (lastWeekDoses - previousWeekDoses) / previousWeekDoses
      : 0;

    const lastMonthDoses = sortedDoses.filter(
      (d) => differenceInDays(now, new Date(d.timestamp)) <= 30,
    ).length;
    const previousMonthDoses = sortedDoses.filter(
      (d) =>
        differenceInDays(now, new Date(d.timestamp)) > 30 &&
        differenceInDays(now, new Date(d.timestamp)) <= 60,
    ).length;
    const monthOverMonthChange = previousMonthDoses
      ? (lastMonthDoses - previousMonthDoses) / previousMonthDoses
      : 0;


    const recentFrequency = recentDoses.length
      ? differenceInDays(
          now,
          new Date(recentDoses[recentDoses.length - 1].timestamp),
        ) / recentDoses.length
      : 0;
    const olderFrequency = olderDoses.length
      ? differenceInDays(
          new Date(olderDoses[0].timestamp),
          new Date(olderDoses[olderDoses.length - 1].timestamp),
        ) / olderDoses.length
      : 0;
    const frequencyTrend = olderFrequency
      ? (recentFrequency - olderFrequency) / olderFrequency
      : 0;


    const doseConsistency = 1 - standardDeviation(amounts) / (avgAmount || 1);
    const timeConsistency =
      timeBetweenDoses.length > 0
        ? 1 -
          standardDeviation(timeBetweenDoses) / (average(timeBetweenDoses) || 1)
        : 1;
    const routeConsistency =
      Math.max(...Array.from(routeCounts.values())) / sortedDoses.length;

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
          avg: avgAmount,
        },
      },
      changeMetrics: {
        doseSizeTrend,
        frequencyTrend,
        weekOverWeekChange,
        monthOverMonthChange,
      },
      variationMetrics: {
        doseConsistency: Math.max(0, Math.min(1, doseConsistency)),
        timingConsistency: Math.max(0, Math.min(1, timeConsistency)),
        routeConsistency,
      },
    };
  });
}


function average(numbers: number[]): number {
  return numbers.length
    ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length
    : 0;
}

function standardDeviation(numbers: number[]): number {
  const avg = average(numbers);
  const squareDiffs = numbers.map((n) => Math.pow(n - avg, 2));
  return Math.sqrt(average(squareDiffs));
}


export interface Stats {
  timeCorrelations: ReturnType<typeof calculateTimeCorrelations>;
  usagePatterns: ReturnType<typeof analyzeUsagePatterns>;
  usageForecasts: ReturnType<typeof generateUsageForecast>;
  substanceInteractions: ReturnType<typeof analyzeSubstanceInteractions>;
  calendarData: CalendarDataPoint[];
  recoveryPeriods: ReturnType<typeof calculateRecoveryPeriods>;
  personalPatterns: ReturnType<typeof analyzePersonalPatterns>;
  totalDoses: number;
  uniqueSubstances: number;
  monthlyTrends: Array<{ name: string; doses: number }>;
  substanceDistribution: Array<{ name: string; value: number }>;
  routeDistribution: Array<{ name: string; value: number }>;
  timeDistribution: Array<{ name: string; count: number }>;
  recentActivity: Array<{
    timestamp: string;
    substance: string;
    amount: number;
    unit: string;
    route: string;
  }>;
}

export function analyzeUsagePatterns(doses: DoseEntry[]): UsagePattern[] {
  const patterns: UsagePattern[] = [];
  const substanceDoses = new Map<string, DoseEntry[]>();


  doses.forEach((dose) => {
    if (!substanceDoses.has(dose.substance)) {
      substanceDoses.set(dose.substance, []);
    }
    substanceDoses.get(dose.substance)?.push(dose);
  });

  substanceDoses.forEach((substanceDoses, substance) => {
    if (substanceDoses.length < 2) return;


    const sortedDoses = substanceDoses.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );


    const gaps = [];
    for (let i = 1; i < sortedDoses.length; i++) {
      gaps.push(
        differenceInDays(
          new Date(sortedDoses[i].timestamp),
          new Date(sortedDoses[i - 1].timestamp),
        ),
      );
    }


    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const variance =
      gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) /
      gaps.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgGap;
    const consistency = Math.max(0, Math.min(1, 1 - coefficientOfVariation));


    const trendData = sortedDoses.map((dose, index) => [index, dose.amount]);
    const trendResult = regression.linear(trendData);
    const trend =
      trendResult.equation[0] > 0.1
        ? "increasing"
        : trendResult.equation[0] < -0.1
          ? "decreasing"
          : "stable";

    patterns.push({
      substance,
      periodicity: avgGap,
      consistency,
      trend,
    });
  });

  return patterns.sort((a, b) => b.consistency - a.consistency);
}

export function generateUsageForecast(
  doses: DoseEntry[],
  daysToForecast: number = 30,
): UsageForecast[] {
  const forecasts: UsageForecast[] = [];
  const substanceDoses = new Map<string, DoseEntry[]>();


  doses.forEach((dose) => {
    if (!substanceDoses.has(dose.substance)) {
      substanceDoses.set(dose.substance, []);
    }
    substanceDoses.get(dose.substance)?.push(dose);
  });

  substanceDoses.forEach((substanceDoses, substance) => {
    if (substanceDoses.length < 5) return;


    const sortedDoses = substanceDoses.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const firstDoseTime = new Date(sortedDoses[0].timestamp).getTime();

    const data = sortedDoses.map((dose) => [
      (new Date(dose.timestamp).getTime() - firstDoseTime) /
        (24 * 60 * 60 * 1000), 
      dose.amount,
    ]);


    const result = regression.linear(data);


    const n = data.length;
    const sumX = data.reduce((sum, [x]) => sum + x, 0);
    const sumXSquared = data.reduce((sum, [x]) => sum + x * x, 0);
    const xBar = sumX / n;


    const yHat = data.map(([x]) => result.equation[0] * x + result.equation[1]);
    const residuals = data.map(([x, y], i) => y - yHat[i]);
    const standardError = Math.sqrt(
      residuals.reduce((sum, r) => sum + r * r, 0) / (n - 2),
    );


    const predictedDoses = [];
    const lastDoseDay = data[data.length - 1][0];

    for (let i = 1; i <= daysToForecast; i++) {
      const futureDays = lastDoseDay + i;
      const predictedAmount =
        result.equation[0] * futureDays + result.equation[1];


      const leverage =
        1 / n +
        Math.pow(futureDays - xBar, 2) / (sumXSquared - n * xBar * xBar);
      const predictionInterval = 1.96 * standardError * Math.sqrt(1 + leverage);

      const confidence = predictedAmount <= 0 ? 0 : Math.max(
        0,
        Math.min(1, 1 - predictionInterval / Math.abs(predictedAmount)),
      );

      predictedDoses.push({
        date: new Date(firstDoseTime + futureDays * 24 * 60 * 60 * 1000),
        amount: Math.max(0, predictedAmount),
        confidence: isNaN(confidence) ? 0.5 : confidence, 
      });
    }

    forecasts.push({
      substance,
      predictedDoses,
    });
  });

  return forecasts;
}
export function analyzeSubstanceInteractions(
  doses: DoseEntry[],
): SubstanceInteraction[] {
  const interactions: SubstanceInteraction[] = [];
  const recentDoses = doses.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );


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

  return interactions.sort((a, b) => {

    const riskLevels = { critical: 3, high: 2, moderate: 1, low: 0 };
    return (
      riskLevels[b.riskLevel] - riskLevels[a.riskLevel] ||
      b.frequency - a.frequency
    );
  });
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function generateCalendarData(doses: DoseEntry[]) {
  const startDate = subMonths(new Date(), 12); 
  const endDate = new Date();


  const dosesByDay = new Map<string, number>();


  doses.forEach((dose) => {
    const date = startOfDay(new Date(dose.timestamp));
    const key = date.toISOString();
    dosesByDay.set(key, (dosesByDay.get(key) || 0) + 1);
  });


  const calendarData: CalendarDataPoint[] = [];
  let currentDate = startDate;


  eachDayOfInterval({ start: startDate, end: endDate }).forEach(date => {
    const dateKey = startOfDay(date).toISOString();
    const week = getWeek(date);
    const weekday = WEEKDAYS[getDay(date)];
    const doses = dosesByDay.get(dateKey) || 0;

    calendarData.push({
      week,
      weekday,
      date,
      doses,
    });
  });

  return calendarData;
}

export function calculateRecoveryPeriods(doses: DoseEntry[]) {
  const substanceRecovery = new Map<string, number>();
  const recentDoses = doses.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  recentDoses.forEach((dose) => {
    const prevRecovery = substanceRecovery.get(dose.substance) || 0;
    const duration =
      EFFECT_DURATIONS[dose.substance] || EFFECT_DURATIONS.default;


    const newRecovery = Math.max(
      prevRecovery,
      duration * (dose.amount / 100), 
    );

    substanceRecovery.set(dose.substance, newRecovery);
  });

  return Array.from(substanceRecovery.entries()).map(([substance, hours]) => ({
    substance,
    recommendedHours: Math.ceil(hours),
  }));
}
