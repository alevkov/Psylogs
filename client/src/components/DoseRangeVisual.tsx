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
      <div className="relative h-6 bg-muted/20 rounded-lg overflow-hidden">
        {/* Light range */}
        {ranges.light && (
          <div
            className="absolute h-full bg-primary/60"
            style={getRangeStyle(
              ranges.threshold || 0,
              ranges.light.upper || 0,
              'hsl(var(--primary))' // Using theme primary color
            )}
          />
        )}
        
        {/* Common range */}
        {ranges.common && (
          <div
            className="absolute h-full bg-secondary/70"
            style={getRangeStyle(
              ranges.common.lower || 0,
              ranges.common.upper || 0,
              'hsl(var(--secondary))' // Using theme secondary color
            )}
          />
        )}
        
        {/* Strong range */}
        {ranges.strong && (
          <div
            className="absolute h-full bg-warning/80"
            style={getRangeStyle(
              ranges.strong.lower || 0,
              ranges.strong.upper || 0,
              'hsl(48 96% 53%)' // Warm warning color
            )}
          />
        )}
        
        {/* Heavy range */}
        {ranges.heavy && (
          <div
            className="absolute h-full bg-destructive/90"
            style={getRangeStyle(
              ranges.heavy,
              maxValue,
              'hsl(var(--destructive))' // Using theme destructive color
            )}
          />
        )}

        {/* Current dose indicator */}
        <div 
          className={cn(
            "absolute w-1 h-full transition-all duration-300",
            currentDose >= (ranges.heavy || Infinity) 
              ? "bg-destructive animate-pulse shadow-lg shadow-destructive/50" 
              : "bg-foreground shadow-md"
          )}
          style={{ 
            left: `${dosePosition}%`,
            zIndex: 10
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
      <div className="text-sm text-center font-medium">
        Current: {currentDose}{unit}
      </div>
    </div>
  );
}
