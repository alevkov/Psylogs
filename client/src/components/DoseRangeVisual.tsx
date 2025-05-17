import React from "react";
import { cn } from "../lib/utils";

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

// Helper function to format dose values
const formatDoseValue = (value: number | undefined): string => {
  if (value === undefined) return "";
  if (value >= 1000) return (value / 1000).toFixed(1) + "g";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
};

export function DoseRangeVisual({
  ranges,
  currentDose,
  unit,
}: DoseRangeVisualProps) {
  // Only continue if we have valid ranges
  if (!ranges || Object.keys(ranges).length === 0) {
    return <div className="text-muted-foreground text-sm">No dose data available</div>;
  }

  // Extract the dose boundary values in order
  const thresholdValue = ranges.threshold;
  const lightLower = ranges.light?.lower;
  const commonLower = ranges.common?.lower;
  const strongLower = ranges.strong?.lower;
  const heavyValue = ranges.heavy;

  // Calculate proportional widths based on actual values
  const calculateProportionalWidths = () => {
    // Default to equal widths if we're missing values
    if (!thresholdValue || !lightLower || !commonLower || !strongLower || !heavyValue) {
      return {
        thresholdWidth: '25%',
        lightWidth: '25%',
        commonWidth: '25%',
        strongWidth: '25%'
      };
    }

    // Calculate the total range to normalize the widths
    const totalRange = heavyValue;
    
    // Calculate each segment's width as a percentage of the total range
    const thresholdWidth = (lightLower - thresholdValue) / totalRange * 100;
    const lightWidth = (commonLower - lightLower) / totalRange * 100;
    const commonWidth = (strongLower - commonLower) / totalRange * 100;
    const strongWidth = (heavyValue - strongLower) / totalRange * 100;
    
    return {
      thresholdWidth: `${thresholdWidth}%`,
      lightWidth: `${lightWidth}%`,
      commonWidth: `${commonWidth}%`,
      strongWidth: `${strongWidth}%`
    };
  };
  
  // Calculate the positions for the boundary numbers
  const calculateNumberPositions = () => {
    if (!thresholdValue || !lightLower || !commonLower || !strongLower || !heavyValue) {
      return {
        lightPos: '25%',
        commonPos: '50%',
        strongPos: '75%'
      };
    }
    
    const totalRange = heavyValue;
    
    // Position numbers exactly at the boundaries
    return {
      lightPos: `${lightLower / totalRange * 100}%`,
      commonPos: `${commonLower / totalRange * 100}%`,
      strongPos: `${strongLower / totalRange * 100}%`
    };
  };
  
  // Handle the scenario where values might be too close to each other
  const adjustTextPositions = (positions: {lightPos: string, commonPos: string, strongPos: string}) => {
    // Convert the percentages to numbers
    const lightPosNum = parseFloat(positions.lightPos);
    const commonPosNum = parseFloat(positions.commonPos);
    const strongPosNum = parseFloat(positions.strongPos);
    
    // Check if the positions are too close (less than 10% apart)
    const adjusted = { ...positions };
    
    // Apply adjustments to text positions if needed
    if (commonPosNum - lightPosNum < 10) {
      adjusted.lightPos = `${lightPosNum - 3}%`;
      adjusted.commonPos = `${commonPosNum + 3}%`;
    }
    
    if (strongPosNum - commonPosNum < 10) {
      adjusted.commonPos = `${commonPosNum - 3}%`;
      adjusted.strongPos = `${strongPosNum + 3}%`;
    }
    
    return adjusted;
  };
  
  const widths = calculateProportionalWidths();
  // Calculate and adjust positions to prevent overlapping text 
  const positions = adjustTextPositions(calculateNumberPositions());
  
  return (
    <div className="w-full mt-4">
      {/* Dose boundary numbers at the top */}
      <div className="flex relative h-6 mb-2">
        {/* Threshold */}
        <div className="absolute left-0" style={{ color: "rgb(22, 163, 74)" }}>
          <span className="font-bold text-xs inline-block">{formatDoseValue(thresholdValue)}</span>
        </div>
        
        {/* Light */}
        <div className="absolute" style={{ 
          color: "rgb(34, 197, 94)", 
          left: positions.lightPos,
          transform: "translateX(-50%)" 
        }}>
          <span className="font-bold text-xs inline-block">{formatDoseValue(lightLower)}</span>
        </div>
        
        {/* Common */}
        <div className="absolute" style={{ 
          color: "rgb(56, 189, 248)", 
          left: positions.commonPos,
          transform: "translateX(-50%)" 
        }}>
          <span className="font-bold text-xs inline-block">{formatDoseValue(commonLower)}</span>
        </div>
        
        {/* Strong */}
        <div className="absolute" style={{ 
          color: "rgb(250, 204, 21)", 
          left: positions.strongPos,
          transform: "translateX(-50%)" 
        }}>
          <span className="font-bold text-xs inline-block">{formatDoseValue(strongLower)}</span>
        </div>
        
        {/* Heavy */}
        <div className="absolute right-0" style={{ color: "rgb(239, 68, 68)" }}>
          <span className="font-bold text-xs inline-block">{formatDoseValue(heavyValue)}+</span>
        </div>
      </div>
      
      {/* Colored dose bar - aligned with numbers */}
      <div className="h-5 w-full flex overflow-hidden rounded">
        {/* Threshold to Light */}
        <div 
          className="h-full" 
          style={{ 
            width: widths.thresholdWidth, 
            backgroundColor: "rgb(22, 163, 74)"
          }}
        ></div>
        
        {/* Light to Common */}
        <div 
          className="h-full" 
          style={{ 
            width: widths.lightWidth, 
            backgroundColor: "rgb(34, 197, 94)"
          }}
        ></div>
        
        {/* Common to Strong */}
        <div 
          className="h-full" 
          style={{ 
            width: widths.commonWidth, 
            backgroundColor: "rgb(56, 189, 248)"
          }}
        ></div>
        
        {/* Strong to Heavy */}
        <div 
          className="h-full" 
          style={{ 
            width: widths.strongWidth, 
            backgroundColor: "rgb(250, 204, 21)"
          }}
        ></div>
        
        {/* Extra small red section for heavy+ */}
        <div 
          className="h-full" 
          style={{ 
            width: '3%', 
            backgroundColor: "rgb(239, 68, 68)"
          }}
        ></div>
      </div>
      
      {/* Evenly spaced fixed labels */}
      <div className="flex text-[10px] text-gray-500 dark:text-gray-400 mt-2 px-1">
        <div style={{ width: '20%' }} className="text-left">
          <span>Threshold</span>
        </div>
        <div style={{ width: '20%' }} className="text-center">
          <span>Light</span>
        </div>
        <div style={{ width: '20%' }} className="text-center">
          <span>Common</span>
        </div>
        <div style={{ width: '20%' }} className="text-center">
          <span>Strong</span>
        </div>
        <div style={{ width: '20%' }} className="text-right">
          <span>Heavy</span>
        </div>
      </div>
      
      {/* Current dose indicator - only show if currentDose is > 0 */}
      {currentDose > 0 && (
        <div className="relative mt-2">
          <div className="text-center text-[10px]">
            <span className="text-blue-600 dark:text-blue-400 font-semibold">
              Current dose: {formatDoseValue(currentDose)} {unit}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
