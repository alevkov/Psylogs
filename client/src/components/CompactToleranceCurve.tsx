import { useIsMobile } from "../hooks/use-mobile";
import { differenceInDays } from "date-fns";
import React, { useMemo } from "react";
import { getSubstanceColor } from "../lib/color-utils";
import { useTheme } from "../hooks/use-theme";

// Define types for the component
interface DoseEntry {
  id?: number;
  substance: string;
  amount: number;
  unit: string;
  route: string;
  timestamp: string | Date;
  notes?: string;
}

interface ToleranceDataItem {
  substance: string;
  toleranceLevel: number;
  color: string;
  recoveryDays: number;
}

interface CompactToleranceCurveProps {
  substances: string[];
  recentDoses: DoseEntry[];
}

// Tolerance visualization matching original design
export const CompactToleranceCurve = ({ substances, recentDoses }: CompactToleranceCurveProps) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Create tolerance prediction data
  const toleranceData = useMemo(() => {
    const now = new Date();
    const data: ToleranceDataItem[] = [];
    const dosesBySubstance: Record<string, DoseEntry[]> = {};
    
    // Group doses by substance
    recentDoses.forEach((dose: DoseEntry) => {
      if (!dosesBySubstance[dose.substance]) {
        dosesBySubstance[dose.substance] = [];
      }
      dosesBySubstance[dose.substance].push(dose);
    });

    // Calculate tolerance for each substance
    Object.entries(dosesBySubstance).forEach(([substance, doses]) => {
      // Sort doses (newest first)
      doses.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      const latestDose = doses[0];
      const daysSince = differenceInDays(now, new Date(latestDose.timestamp));
      const toleranceLevel = Math.max(0, 100 - daysSince * 7.14); // ~14 days to reset
      
      if (toleranceLevel > 1) {
        data.push({
          substance,
          toleranceLevel, 
          color: getSubstanceColor(substance, isDarkMode),
          recoveryDays: Math.ceil(toleranceLevel / 7.14)
        });
      }
    });

    return data.sort((a, b) => b.toleranceLevel - a.toleranceLevel);
  }, [recentDoses]);

  // Empty state
  if (toleranceData.length === 0) {
    return <div className="text-xs text-gray-500">No active tolerance</div>;
  }

  // Display in the original list format with progress bars
  return (
    <div className="space-y-1">
      {toleranceData.map((entry, index) => (
        <div key={index} className="flex items-center justify-between">
          {/* Substance and color dot */}
          <div className="flex items-center min-w-[80px] max-w-[120px]">
            <div
              className="w-2 h-2 rounded-full mr-1.5 flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <div className="text-xs font-medium truncate">
              {entry.substance}
            </div>
          </div>

          {/* Progress bar with percentage and days to reset */}
          <div className="flex-grow flex items-center">
            <div className="relative w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full rounded-full"
                style={{
                  width: `${entry.toleranceLevel}%`,
                  backgroundColor: entry.color,
                }}
              />
            </div>
            <span className="text-xs ml-1.5 text-gray-600 dark:text-gray-300 w-[32px] text-right">
              {Math.round(entry.toleranceLevel)}%
            </span>
            <span className="text-[9px] text-gray-500 ml-1 whitespace-nowrap">
              {entry.recoveryDays}d to reset
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
