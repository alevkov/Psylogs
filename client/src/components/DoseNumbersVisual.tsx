import React from "react";

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

interface DoseNumbersVisualProps {
  ranges: DoseRanges;
  unit: string;
}

export function DoseNumbersVisual({ ranges, unit }: DoseNumbersVisualProps) {
  // Format the dose value
  const formatDoseValue = (value?: number) => {
    if (value === undefined) return "";
    return value.toString();
  };

  return (
    <div className="w-full mb-2">
      {/* Gray line to represent range */}
      <div className="relative w-full h-1 bg-gray-200 dark:bg-gray-700 my-4">
        {/* Numbers at exact boundaries */}
        <div className="absolute top-[-30px] left-0 transform translate-x-[-50%]">
          <span className="text-lg font-bold" style={{ color: "hsl(142, 76%, 36%)" }}>
            {formatDoseValue(ranges.threshold)}
          </span>
        </div>
        
        <div className="absolute top-[-30px] left-[25%] transform translate-x-[-50%]">
          <span className="text-lg font-bold" style={{ color: "hsl(142, 71%, 45%)" }}>
            {formatDoseValue(ranges.light?.lower)}
          </span>
        </div>
        
        <div className="absolute top-[-30px] left-[50%] transform translate-x-[-50%]">
          <span className="text-lg font-bold" style={{ color: "hsl(194, 71%, 45%)" }}>
            {formatDoseValue(ranges.common?.lower)}
          </span>
        </div>
        
        <div className="absolute top-[-30px] left-[75%] transform translate-x-[-50%]">
          <span className="text-lg font-bold" style={{ color: "hsl(48, 96%, 53%)" }}>
            {formatDoseValue(ranges.strong?.lower)}
          </span>
        </div>
        
        <div className="absolute top-[-30px] right-0 transform translate-x-[50%]">
          <span className="text-lg font-bold flex items-center" style={{ color: "hsl(0, 84%, 60%)" }}>
            <span>{formatDoseValue(ranges.heavy)}</span>
            <span className="ml-1">+</span>
          </span>
        </div>
        
        {/* Category labels */}
        <div className="absolute bottom-[-25px] left-[12.5%] transform translate-x-[-50%]">
          <span className="text-xs text-gray-500 dark:text-gray-400">Threshold</span>
        </div>
        
        <div className="absolute bottom-[-25px] left-[37.5%] transform translate-x-[-50%]">
          <span className="text-xs text-gray-500 dark:text-gray-400">Light</span>
        </div>
        
        <div className="absolute bottom-[-25px] left-[62.5%] transform translate-x-[-50%]">
          <span className="text-xs text-gray-500 dark:text-gray-400">Common</span>
        </div>
        
        <div className="absolute bottom-[-25px] left-[87.5%] transform translate-x-[-50%]">
          <span className="text-xs text-gray-500 dark:text-gray-400">Strong</span>
        </div>
        
        <div className="absolute bottom-[-25px] right-0 transform translate-x-[50%]">
          <span className="text-xs text-gray-500 dark:text-gray-400">Heavy</span>
        </div>
      </div>
    </div>
  );
}