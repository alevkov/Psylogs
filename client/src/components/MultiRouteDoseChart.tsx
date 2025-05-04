import React, { useMemo } from 'react';

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

interface RouteData {
  route: string;
  ranges: DoseRanges;
  unit: string;
}

interface MultiRouteDoseChartProps {
  routes: RouteData[];
  substance: string;
  className?: string;
}

export function MultiRouteDoseChart({ routes, substance, className = '' }: MultiRouteDoseChartProps) {
  // Define colors for each dose tier
  const colors = {
    threshold: "#4caf50", // Green
    light: "#8bc34a",     // Light Green
    common: "#ffeb3b",    // Yellow
    strong: "#ff9800",    // Orange
    heavy: "#ff0000",     // Bright Red
  };
  
  // Uncomment for debugging
  // console.log("Routes data:", routes);

  // Format dose value for display (e.g. 1000 -> 1g)
  const formatDoseValue = (value: number | undefined): string => {
    if (value === undefined) return '';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'g';
    if (value % 1 === 0) return value.toString();
    return value.toFixed(1);
  };

  // Calculate min and max values for the chart scale
  const { minValue, maxValue } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let globalHeavyMax = -Infinity;

    // First pass: find the global maximum heavy value across all routes
    routes.forEach(route => {
      // Find the largest heavy value across ALL routes to use as our chart maximum
      if (route.ranges.heavy !== undefined && route.ranges.heavy > globalHeavyMax) {
        globalHeavyMax = route.ranges.heavy;
      }
    });

    // Second pass: find minimum and use global heavy max as our maximum
    routes.forEach(route => {
      // Find minimum threshold value
      if (route.ranges.threshold !== undefined && route.ranges.threshold < min) {
        min = route.ranges.threshold;
      }
    });
    
    // If we found a global heavy max, use it; otherwise fallback to other maximums
    if (globalHeavyMax > 0) {
      max = globalHeavyMax;
    } else {
      // No heavy values found, check for strong.upper
      routes.forEach(route => {
        if (route.ranges.strong?.upper !== undefined && route.ranges.strong.upper > max) {
          max = route.ranges.strong.upper;
        }
      });
    }
    
    // Add 10% extra space after the maximum value to ensure red sections are visible
    max = max * 1.1;
    
    // Round max up to nearest 10 for cleaner scale
    max = Math.ceil(max / 10) * 10;
    
    // Ensure max is at least 100 if any route has a heavy value above 75
    // This ensures we have room to show the red section properly
    if (max > 75 && max < 100) {
      max = 100;
    }
    
    // Uncomment for debugging
    // console.log(`Chart scale: min=${min}, max=${max}, globalHeavyMax=${globalHeavyMax}`);
    
    return { minValue: min, maxValue: max };
  }, [routes]);

  // Generate x-axis markers with nice round numbers
  const scaleMarkers = useMemo(() => {
    const range = maxValue - minValue;
    
    // Determine an appropriate number of markers (we want ~5-7 markers)
    const targetMarkers = 6;
    
    // Calculate ideal step size for our target number of markers
    let idealStep = range / targetMarkers;
    
    // Find a "nice" step size that's close to the ideal step
    // Nice numbers are 1, 2, 5, 10, 20, 50, etc.
    let step = 1;
    
    if (idealStep > 100) step = 100;
    else if (idealStep > 50) step = 50;
    else if (idealStep > 20) step = 20;
    else if (idealStep > 10) step = 10;
    else if (idealStep > 5) step = 5;
    else if (idealStep > 2) step = 2;
    else if (idealStep > 1) step = 1;
    else if (idealStep > 0.5) step = 0.5;
    else step = 0.2;
    
    // Generate an array of markers at nice intervals
    const markers = [];
    
    // Start from a nice round number
    const startMarker = Math.ceil(minValue / step) * step;
    
    // Generate markers until maxValue, but limit to reasonable number
    for (let value = startMarker; value <= maxValue; value += step) {
      // Round to avoid floating point issues
      markers.push(Math.round(value * 100) / 100); 
      
      // Safety check to prevent infinite loops
      if (markers.length > 20) break;
    }
    
    // Uncomment for debugging
    // console.log("Scale markers:", markers);
    
    return markers;
  }, [minValue, maxValue]);

  // Calculate position percentage along chart for a value
  const calculatePosition = (value: number) => {
    const range = maxValue - minValue;
    return ((value - minValue) / range) * 100;
  };
  
  // Helper to generate segment style
  const getTierStyle = (start: number, end: number, color: string) => {
    const startPos = calculatePosition(start);
    const endPos = calculatePosition(end);
    const width = endPos - startPos;
    
    return {
      left: `${startPos}%`,
      width: `${width}%`,
      backgroundColor: color
    };
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="relative pb-8">
        {/* X-axis grid lines (vertical markers) */}
        <div className="absolute left-[110px] right-0 top-0 bottom-4 pointer-events-none">
          {scaleMarkers.map((value, i) => (
            <div 
              key={`grid-${i}`} 
              className="absolute h-full w-px bg-gray-200 dark:bg-gray-700"
              style={{ 
                left: `${calculatePosition(value)}%`
              }}
            />
          ))}
        </div>
      
        {/* Horizontal axis line */}
        <div className="absolute left-[110px] right-0 bottom-4 h-px bg-gray-300 dark:bg-gray-600"></div>
      
        {/* Dose bars for each route */}
        <div className="grid gap-1">
          {routes.map((route, index) => (
            <div key={route.route} className="relative h-6">
              {/* Route label */}
              <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-[100px] text-xs text-gray-600 dark:text-gray-400">
                {route.route} ({route.unit})
              </div>
              
              {/* Main chart area */}
              <div className="absolute left-[110px] right-0 h-6">
                {/* Background bar */}
                <div className="absolute left-0 right-0 top-0 bottom-0 bg-gray-100 dark:bg-gray-800"></div>
                
                {/* Dose ranges */}
                <div className="relative h-full w-full overflow-hidden">
                  {/* Create each colored segment separately in order */}
                  
                  {/* Threshold segment (green) */}
                  {route.ranges.threshold !== undefined && route.ranges.light?.lower !== undefined && (
                    <div 
                      className="absolute h-full"
                      style={getTierStyle(route.ranges.threshold, route.ranges.light.lower, colors.threshold)}
                    />
                  )}
                  
                  {/* Light segment (light green) */}
                  {route.ranges.light?.lower !== undefined && route.ranges.common?.lower !== undefined && (
                    <div 
                      className="absolute h-full"
                      style={getTierStyle(route.ranges.light.lower, route.ranges.common.lower, colors.light)}
                    />
                  )}
                  
                  {/* Common segment (yellow) */}
                  {route.ranges.common?.lower !== undefined && route.ranges.strong?.lower !== undefined && (
                    <div 
                      className="absolute h-full"
                      style={getTierStyle(route.ranges.common.lower, route.ranges.strong.lower, colors.common)}
                    />
                  )}
                  
                  {/* Strong segment (orange) */}
                  {route.ranges.strong?.lower !== undefined && route.ranges.heavy !== undefined && (
                    <div 
                      className="absolute h-full"
                      style={getTierStyle(route.ranges.strong.lower, route.ranges.heavy, colors.strong)}
                    />
                  )}
                  
                  {/* If no heavy value is defined but strong is, extend strong to the end */}
                  {route.ranges.strong?.lower !== undefined && route.ranges.heavy === undefined && (
                    <div 
                      className="absolute h-full"
                      style={{
                        left: `${calculatePosition(route.ranges.strong.lower)}%`,
                        right: '0',
                        backgroundColor: colors.strong
                      }}
                    />
                  )}
                  
                  {/* Heavy segment (bright red) - from heavy value to the end */}
                  {route.ranges.heavy !== undefined && (
                    <div 
                      className="absolute h-full"
                      style={{
                        left: `${calculatePosition(route.ranges.heavy)}%`,
                        right: '0',
                        backgroundColor: colors.heavy
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* X-axis scale */}
        <div className="absolute left-[110px] right-0 bottom-0 h-4">
          {scaleMarkers.map((value, i) => (
            <div 
              key={i} 
              className="absolute text-xs text-gray-600 dark:text-gray-400"
              style={{ 
                left: `${calculatePosition(value)}%`,
                transform: 'translateX(-50%)'
              }}
            >
              {formatDoseValue(value)}
            </div>
          ))}
        </div>
      </div>
      
      {/* Color legend */}
      <div className="flex items-center justify-start mt-2 text-xs gap-4 text-gray-700 dark:text-gray-300">
        <span className="flex items-center">
          <span className="inline-block w-2 h-2 mr-1 rounded-full" style={{ backgroundColor: colors.threshold }}></span>
          Threshold
        </span>
        <span className="flex items-center">  
          <span className="inline-block w-2 h-2 mr-1 rounded-full" style={{ backgroundColor: colors.light }}></span>
          Light
        </span>
        <span className="flex items-center">
          <span className="inline-block w-2 h-2 mr-1 rounded-full" style={{ backgroundColor: colors.common }}></span>
          Common
        </span>
        <span className="flex items-center">
          <span className="inline-block w-2 h-2 mr-1 rounded-full" style={{ backgroundColor: colors.strong }}></span>
          Strong
        </span>
        <span className="flex items-center text-red-600 dark:text-red-400 font-medium">
          <span className="inline-block w-2 h-2 mr-1 rounded-full" style={{ backgroundColor: colors.heavy }}></span>
          Heavy
        </span>
      </div>
    </div>
  );
}