import React from 'react';
import { cn } from "@/lib/utils";

interface DoseRange {
  lower?: number;
  upper?: number;
}

interface DoseRanges {
  threshold?: number;
  light?: DoseRange;
  common?: DoseRange;
  strong?: DoseRange;
  heavy?: number;
}

interface DoseRangeVisualProps {
  ranges: DoseRanges;
  currentDose: number;
  unit: string;
}

export function DoseRangeVisual({ ranges, currentDose, unit }: DoseRangeVisualProps) {
  // Calculate the maximum value for scaling
  const maxValue = ranges.heavy || 
    (ranges.strong?.upper || 
    ranges.common?.upper || 
    ranges.light?.upper || 0);

  // Calculate percentage positions for the ranges
  const getPosition = (value: number) => (value / maxValue) * 100;

  // Get range style with color and position
  const getRangeStyle = (start: number, end: number, color: string) => ({
    left: `${getPosition(start)}%`,
    width: `${getPosition(end - start)}%`,
    backgroundColor: color
  });

  // Calculate current dose position
  const dosePosition = getPosition(currentDose);

  return (
    <div className="space-y-2 w-full">
      {/* Range visualization */}
      <div className="relative h-6 bg-muted rounded-lg overflow-hidden">
        {/* Light range */}
        {ranges.light && (
          <div
            className="absolute h-full opacity-30"
            style={getRangeStyle(
              ranges.threshold || 0,
              ranges.light.upper,
              'rgb(74, 222, 128)' // green
            )}
          />
        )}
        
        {/* Common range */}
        {ranges.common && (
          <div
            className="absolute h-full opacity-30"
            style={getRangeStyle(
              ranges.common.lower,
              ranges.common.upper,
              'rgb(34, 197, 94)' // darker green
            )}
          />
        )}
        
        {/* Strong range */}
        {ranges.strong && (
          <div
            className="absolute h-full opacity-30"
            style={getRangeStyle(
              ranges.strong.lower,
              ranges.strong.upper,
              'rgb(234, 179, 8)' // yellow
            )}
          />
        )}
        
        {/* Heavy indicator */}
        {ranges.heavy && (
          <div
            className="absolute h-full opacity-30"
            style={getRangeStyle(
              ranges.heavy,
              maxValue,
              'rgb(239, 68, 68)' // red
            )}
          />
        )}

        {/* Current dose indicator */}
        <div 
          className="absolute w-1 h-full bg-foreground"
          style={{ left: `${dosePosition}%` }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Threshold</span>
        <span>Light</span>
        <span>Common</span>
        <span>Strong</span>
        <span>Heavy</span>
      </div>

      {/* Current dose label */}
      <div className="text-sm text-center">
        Current: {currentDose}{unit}
      </div>
    </div>
  );
}
