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
  // Calculate the maximum value for scaling, extending 20% beyond heavy threshold
  const maxValue = (ranges.heavy || 0) * 1.2;

  // Calculate percentage positions for the ranges
  const getPosition = (value: number) => (value / maxValue) * 100;

  // Get range style with color and position
  const getRangeStyle = (start: number, end: number, color: string) => ({
    left: `${getPosition(start)}%`,
    width: `${getPosition(end - start)}%`,
    backgroundColor: color
  });

  // Update the dose position calculation to cap at slightly before heavy threshold
  const dosePosition = Math.min(
    getPosition(
      currentDose >= (ranges.heavy || Infinity)
        ? ranges.heavy * 0.99  // Cap at 99% of heavy threshold
        : currentDose
    ),
    100
  );

  return (
    <div className="space-y-2 w-full">
      {/* Range visualization */}
      <div className="relative h-6 bg-muted rounded-lg overflow-hidden">
        {/* Light range */}
        {ranges.light && (
          <div
            className="absolute h-full opacity-40"
            style={getRangeStyle(
              ranges.threshold || 0,
              ranges.light.upper || 0,
              'hsl(142, 76%, 36%)' // Emerald green
            )}
          />
        )}
        
        {/* Common range */}
        {ranges.common && (
          <div
            className="absolute h-full opacity-40"
            style={getRangeStyle(
              ranges.common.lower || 0,
              ranges.common.upper || 0,
              'hsl(142, 71%, 45%)' // Lighter emerald
            )}
          />
        )}
        
        {/* Strong range */}
        {ranges.strong && (
          <div
            className="absolute h-full opacity-40"
            style={getRangeStyle(
              ranges.strong.lower || 0,
              ranges.strong.upper || 0,
              'hsl(48, 96%, 53%)' // Bright yellow
            )}
          />
        )}
        
        {/* Heavy range */}
        {ranges.heavy && (
          <div
            className="absolute h-full opacity-40"
            style={getRangeStyle(
              ranges.heavy,
              maxValue,
              'hsl(0, 84%, 60%)' // Vibrant red
            )}
          />
        )}

        {/* Current dose indicator */}
        <div 
          className={cn(
            "absolute w-1 h-full transition-all duration-300",
            currentDose >= (ranges.heavy || Infinity) 
              ? "bg-red-500 animate-pulse" 
              : "bg-foreground"
          )}
          style={{ 
            left: `${dosePosition}%`,
            zIndex: 10  // Ensure indicator is always visible
          }}
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
