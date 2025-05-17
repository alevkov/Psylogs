import React, { useMemo, useState, useEffect } from "react";

// Types
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

// Constants and helper functions in a more organized structure
const COLORS = {
  threshold: "#4caf50", // Green
  light: "#8bc34a", // Light Green
  common: "#ffeb3b", // Yellow
  strong: "#ff9800", // Orange
  heavy: "#ff0000", // Bright Red
};

const ROUTE_ABBREVIATIONS: Record<string, string> = {
  oral: "Oral",
  sublingual: "Subl.",
  buccal: "Buccal",
  insufflated: "Nasal",
  intranasal: "IN",
  intravenous: "IV",
  intramuscular: "IM",
  subcutaneous: "SC",
  rectal: "Boof",
  transdermal: "TD",
  smoked: "Smoke",
  vaporized: "Vapor",
  inhaled: "Inhaled",
};
export function MultiRouteDoseChart({
  routes,
  substance,
  className = "",
}: MultiRouteDoseChartProps) {
  // Helper to check if a value is valid (positive number)
  const isValidDose = (value: number | undefined): boolean => {
    return value !== undefined && value > 0;
  };

  // Filter routes to only include those with at least one valid dose value
  const validRoutes = useMemo(() => {
    return routes.filter((route) => {
      return (
        isValidDose(route.ranges.threshold) ||
        isValidDose(route.ranges.light?.lower) ||
        isValidDose(route.ranges.common?.lower) ||
        isValidDose(route.ranges.strong?.lower) ||
        isValidDose(route.ranges.heavy)
      );
    });
  }, [routes]);

  // If there are no valid routes, show a message
  if (validRoutes.length === 0) {
    return (
      <div className={`w-full ${className}`}>
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400">
            Specific dosage information is not available for this substance.
          </p>
        </div>
      </div>
    );
  }

 


  // Format dose value without unit for internal calculations
  const formatDoseValue = (value: number | undefined): string => {
    if (!isValidDose(value)) return "";

    // Don't add 'g' suffix here - only format the number
    if (value! >= 1000) return (value! / 1000).toFixed(1);
    return value! % 1 === 0 ? value!.toString() : value!.toFixed(1);
  };

  // Format dose with appropriate unit for display
  const formatDoseWithUnit = (
    value: number | undefined,
    unit: string,
  ): string => {
    if (!isValidDose(value)) return "-";

    // For large values, convert to a more readable format
    if (value! >= 1000 && unit.toLowerCase() === "mg") {
      return `${(value! / 1000).toFixed(1)}g`;
    }

    // For normal-sized values, use the original unit
    const valueStr = value! % 1 === 0 ? value!.toString() : value!.toFixed(1);
    return `${valueStr}${unit}`;
  };

  // Get unit display for axis labels
  const getUnitDisplay = (
    value: number,
    unit: string,
    isHeavy: boolean = false,
  ): string => {
    if (value >= 1000 && unit.toLowerCase() === "mg") {
      return `g${isHeavy ? "+" : ""}`;
    }
    return `${unit}${isHeavy ? "+" : ""}`;
  };

  const formatRouteAbbreviation = (route: string): string => {
    return ROUTE_ABBREVIATIONS[route.toLowerCase()] || route;
  };

  // Calculate scale and markers
  const { minValue, maxValue, globalHeavyMax, scaleMarkers } = useMemo(() => {
    // Find min threshold and max heavy dose across all valid routes
    let minThreshold = Infinity;
    let maxHeavy = 0;

    // First pass to find global heavy max and min threshold
    validRoutes.forEach((route) => {
      if (
        isValidDose(route.ranges.threshold) &&
        route.ranges.threshold! < minThreshold
      ) {
        minThreshold = route.ranges.threshold!;
      }

      if (isValidDose(route.ranges.heavy) && route.ranges.heavy! > maxHeavy) {
        maxHeavy = route.ranges.heavy!;
      }
    });

    // Fallback to strong upper if no heavy value exists
    if (maxHeavy === 0) {
      validRoutes.forEach((route) => {
        if (
          isValidDose(route.ranges.strong?.upper) &&
          route.ranges.strong!.upper! > maxHeavy
        ) {
          maxHeavy = route.ranges.strong!.upper!;
        }
      });
    }

    const minValue = Math.min(minThreshold, Infinity);
    const maxValue = maxHeavy;

    // Generate scale markers from all significant dose points
    const allDosePoints = new Set<number>();

    // Extract all valid dose points from routes
    validRoutes.forEach((route) => {
      const { ranges } = route;

      // Add all defined and valid dose points
      if (isValidDose(ranges.threshold)) allDosePoints.add(ranges.threshold!);

      if (isValidDose(ranges.light?.lower))
        allDosePoints.add(ranges.light!.lower!);

      if (isValidDose(ranges.light?.upper))
        allDosePoints.add(ranges.light!.upper!);

      if (isValidDose(ranges.common?.lower))
        allDosePoints.add(ranges.common!.lower!);

      if (isValidDose(ranges.common?.upper))
        allDosePoints.add(ranges.common!.upper!);

      if (isValidDose(ranges.strong?.lower))
        allDosePoints.add(ranges.strong!.lower!);

      if (isValidDose(ranges.strong?.upper))
        allDosePoints.add(ranges.strong!.upper!);

      if (isValidDose(ranges.heavy)) allDosePoints.add(ranges.heavy!);
    });

    // Create sorted markers from dose points
    let markers = Array.from(allDosePoints).sort((a, b) => a - b);

    // Ensure min and max are included
    if (minValue !== Infinity && !markers.includes(minValue)) {
      markers.unshift(minValue);
    }

    if (maxValue !== 0 && !markers.includes(maxValue)) {
      markers.push(maxValue);
    }

    // Add midpoints if we have too few markers
    if (markers.length < 4) {
      const expandedMarkers = new Set<number>(markers);

      for (let i = 0; i < markers.length - 1; i++) {
        // Add a midpoint between each pair of consecutive markers
        const midpoint = (markers[i] + markers[i + 1]) / 2;
        expandedMarkers.add(Math.round(midpoint));
      }

      markers = Array.from(expandedMarkers).sort((a, b) => a - b);
    }

    // Round large values for cleaner display
    const range = maxValue - minValue;
    if (range > 100) {
      markers = markers.map((value) => {
        // Don't round actual dose points
        if (allDosePoints.has(value)) return value;

        // Round intermediate values
        if (value > 100) return Math.round(value / 10) * 10; // Round to nearest 10
        if (value > 50) return Math.round(value / 5) * 5; // Round to nearest 5
        return value;
      });
    }

    return {
      minValue: minValue === Infinity ? 0 : minValue,
      maxValue,
      globalHeavyMax: maxHeavy,
      scaleMarkers: markers,
    };
  }, [validRoutes]);

  // Only continue if we have valid scale values
  if (minValue === 0 && maxValue === 0) {
    return (
      <div className={`w-full ${className}`}>
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p className="text-gray-500 dark:text-gray-400">
            Specific dosage information is not available for this substance.
          </p>
        </div>
      </div>
    );
  }

  // Visual positioning for the chart
  const calculatePosition = useMemo(() => {
    return (value: number) => {
      // This returns a function that efficiently calculates positions
      // First, try to find the value in markers for even distribution
      const valueIndex = scaleMarkers.indexOf(value);

      if (valueIndex !== -1 && scaleMarkers.length > 1) {
        // Distribute markers evenly with padding
        const padding = 2; // % padding on each side
        const availableWidth = 100 - 2 * padding;
        return (
          padding + valueIndex * (availableWidth / (scaleMarkers.length - 1))
        );
      }

      // Fall back to linear mapping if value not found in markers
      const range = maxValue - minValue;
      if (range === 0) return 50; // Center single value

      let percentage = ((value - minValue) / range) * 100;
      return Math.max(1, Math.min(99, percentage)); // Keep within bounds
    };
  }, [scaleMarkers, minValue, maxValue]);

  // Generate tier segment style
  const getTierStyle = (start: number, end: number, color: string) => {
    const startPos = calculatePosition(start);
    const endPos = calculatePosition(end);
    const width = endPos - startPos;

    return {
      left: `${startPos}%`,
      width: `${width}%`,
      backgroundColor: color,
    };
  };

  // Determine which row to place each marker label
  const getMarkerRow = (value: number, index: number, markers: number[]) => {
    // Determine row for label (0=bottom, 1=middle, 2=top)
    const minValue = markers[0];
    const maxValue = markers[markers.length - 1];
    const isDenseChart = markers.length > 10;

    if (value === minValue || value === maxValue || value === globalHeavyMax) {
      return 0; // Important values on bottom row
    } else if (isDenseChart) {
      // For dense charts, distribute across rows
      return index % 3;
    } else {
      return index % 3;
    }
  };

  return (
    <div className={`w-auto px-4 ${className}`}>
      <div className="relative pb-14">
        {/* X-axis grid lines */}
        <div className="absolute left-0 right-0 top-0 bottom-10 pointer-events-none">
          {scaleMarkers.map((value, i, array) => {
            const position = calculatePosition(value);

            // Only draw important grid lines to reduce clutter
            const isImportantValue =
              i === 0 ||
              i === array.length - 1 ||
              value === globalHeavyMax ||
              i % 2 === 0;

            if (!isImportantValue) return null;

            return (
              <div
                key={`grid-${i}`}
                className={`absolute h-full w-px ${
                  value === globalHeavyMax
                    ? "bg-red-200 dark:bg-red-900/30"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
                style={{ left: `${position}%` }}
              />
            );
          })}
        </div>

        {/* Horizontal axis line */}
        <div className="absolute left-0 right-0 bottom-10 h-px bg-gray-300 dark:bg-gray-600"></div>

        {/* Dose bars for each route */}
        <div className="grid gap-1">
          {validRoutes.map((route) => (
            <div key={route.route} className="relative h-6">
              {/* Route label */}
              <div className="absolute left-1 top-1/2 transform -translate-y-1/2 z-10 px-1 text-xs text-gray-900 dark:text-gray-100 bg-gray-100/70 dark:bg-gray-800/70 rounded">
                {formatRouteAbbreviation(route.route)}
              </div>

              {/* Chart background */}
              <div className="absolute left-0 right-0 h-6">
                <div className="absolute left-0 right-0 top-0 bottom-0 bg-gray-100 dark:bg-gray-800"></div>

                {/* Dose range segments */}
                <div className="relative h-full w-full overflow-hidden">
                  {/* Threshold (green) */}
                  {isValidDose(route.ranges.threshold) &&
                    isValidDose(route.ranges.light?.lower) && (
                      <div
                        className="absolute h-full"
                        style={getTierStyle(
                          route.ranges.threshold!,
                          route.ranges.light!.lower!,
                          COLORS.threshold,
                        )}
                      />
                    )}

                  {/* Light (light green) */}
                  {isValidDose(route.ranges.light?.lower) &&
                    isValidDose(route.ranges.common?.lower) && (
                      <div
                        className="absolute h-full"
                        style={getTierStyle(
                          route.ranges.light!.lower!,
                          route.ranges.common!.lower!,
                          COLORS.light,
                        )}
                      />
                    )}

                  {/* Common (yellow) */}
                  {isValidDose(route.ranges.common?.lower) &&
                    isValidDose(route.ranges.strong?.lower) && (
                      <div
                        className="absolute h-full"
                        style={getTierStyle(
                          route.ranges.common!.lower!,
                          route.ranges.strong!.lower!,
                          COLORS.common,
                        )}
                      />
                    )}

                  {/* Strong (orange) */}
                  {isValidDose(route.ranges.strong?.lower) &&
                    isValidDose(route.ranges.heavy) && (
                      <div
                        className="absolute h-full"
                        style={getTierStyle(
                          route.ranges.strong!.lower!,
                          route.ranges.heavy!,
                          COLORS.strong,
                        )}
                      />
                    )}

                  {/* Strong with no heavy */}
                  {isValidDose(route.ranges.strong?.lower) &&
                    !isValidDose(route.ranges.heavy) && (
                      <div
                        className="absolute h-full"
                        style={{
                          left: `${calculatePosition(route.ranges.strong!.lower!)}%`,
                          right: "0",
                          backgroundColor: COLORS.strong,
                        }}
                      />
                    )}

                  {/* Heavy (red) */}
                  {isValidDose(route.ranges.heavy) && (
                    <div
                      className="absolute h-full"
                      style={{
                        left: `${calculatePosition(route.ranges.heavy!)}%`,
                        right: "0",
                        backgroundColor: COLORS.heavy,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* X-axis scale labels */}
        <div className="absolute left-0 right-0 bottom-0 h-12">
          {scaleMarkers.map((value, i, array) => {
            // Skip some labels in dense charts to prevent overlap
            if (
              array.length > 15 &&
              i % 2 !== 0 &&
              value !== minValue &&
              value !== maxValue &&
              value !== globalHeavyMax
            ) {
              return null;
            }

            const row = getMarkerRow(value, i, array);

            // Only show rows 1 and 2 if chart is dense enough
            if (row > 0 && array.length < 6) {
              return null;
            }

            const position = calculatePosition(value);
            const verticalOffset = row * 10; // 10px spacing between rows

            // Style based on importance
            const fontSize = row === 0 ? "text-[0.7rem]" : "text-[0.65rem]";
            const textColor =
              value === globalHeavyMax
                ? "text-red-600 dark:text-red-400 font-semibold"
                : row === 0
                  ? "text-gray-700 dark:text-gray-300"
                  : "text-gray-500 dark:text-gray-400";

            return (
              <div
                key={i}
                className={`absolute ${fontSize} ${textColor}`}
                style={{
                  left: `${position}%`,
                  transform: "translateX(-50%)",
                  bottom: `${verticalOffset}px`,
                }}
              >
                {formatDoseValue(value)}
                {/* Add units to important values - but handle unit display consistently */}
                {row === 0 &&
                  (value === minValue ||
                    value === maxValue ||
                    value === globalHeavyMax) &&
                  validRoutes.length > 0 &&
                  getUnitDisplay(
                    value,
                    validRoutes[0].unit,
                    value === globalHeavyMax,
                  )}

                {/* Heavy value indicator */}
                {value === globalHeavyMax && (
                  <span className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-red-600 dark:text-red-400 font-bold">
                    ↓
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Dosage Ranges Table */}
      <div className="w-auto px-0 mt-4 mb-1">
        <table className="w-auto text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="py-1 px-2 text-left border border-gray-200 dark:border-gray-700">
                ROA
              </th>
              {Object.entries({
                threshold: {
                  label: "T",
                  color: COLORS.threshold,
                  bg: "bg-green-50 dark:bg-green-900/20",
                },
                light: {
                  label: "Light",
                  color: COLORS.light,
                  bg: "bg-lime-50 dark:bg-lime-900/20",
                },
                common: {
                  label: "Common",
                  color: COLORS.common,
                  bg: "bg-yellow-50 dark:bg-yellow-900/20",
                },
                strong: {
                  label: "Strong",
                  color: COLORS.strong,
                  bg: "bg-orange-50 dark:bg-orange-900/20",
                },
                heavy: {
                  label: "Heavy",
                  color: COLORS.heavy,
                  bg: "bg-red-50 dark:bg-red-900/20",
                },
              }).map(([key, { label, color, bg }]) => (
                <th
                  key={key}
                  className={`py-1 px-2 text-left border border-gray-200 dark:border-gray-700 ${bg}`}
                >
                  <span className="flex items-center">
                    <span
                      className="inline-block w-2 h-2 mr-1 rounded-full"
                      style={{ backgroundColor: color }}
                    ></span>
                    <span
                      className={
                        key === "heavy" ? "text-red-600 dark:text-red-400" : ""
                      }
                    >
                      {label}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {validRoutes.map((route) => (
              <tr
                key={`table-${route.route}`}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td className="py-1 px-2 border border-gray-200 dark:border-gray-700 font-medium">
                  {formatRouteAbbreviation(route.route)}
                </td>
                <td className="py-1 px-2 border border-gray-200 dark:border-gray-700 bg-green-50/50 dark:bg-green-900/10">
                  {formatDoseWithUnit(route.ranges.threshold, route.unit)}
                </td>
                <td className="py-1 px-2 border border-gray-200 dark:border-gray-700 bg-lime-50/50 dark:bg-lime-900/10">
                  {route.ranges.light?.lower !== undefined
                    ? `${formatDoseWithUnit(route.ranges.light.lower, route.unit)}${
                        isValidDose(route.ranges.light.upper)
                          ? " - " +
                            formatDoseWithUnit(
                              route.ranges.light.upper,
                              route.unit,
                            )
                          : ""
                      }`
                    : "-"}
                </td>
                <td className="py-1 px-2 border border-gray-200 dark:border-gray-700 bg-yellow-50/50 dark:bg-yellow-900/10">
                  {route.ranges.common?.lower !== undefined
                    ? `${formatDoseWithUnit(route.ranges.common.lower, route.unit)}${
                        isValidDose(route.ranges.common.upper)
                          ? " - " +
                            formatDoseWithUnit(
                              route.ranges.common.upper,
                              route.unit,
                            )
                          : ""
                      }`
                    : "-"}
                </td>
                <td className="py-1 px-2 border border-gray-200 dark:border-gray-700 bg-orange-50/50 dark:bg-orange-900/10">
                  {route.ranges.strong?.lower !== undefined
                    ? `${formatDoseWithUnit(route.ranges.strong.lower, route.unit)}${
                        isValidDose(route.ranges.strong.upper)
                          ? " - " +
                            formatDoseWithUnit(
                              route.ranges.strong.upper,
                              route.unit,
                            )
                          : ""
                      }`
                    : "-"}
                </td>
                <td className="py-1 px-2 border border-gray-200 dark:border-gray-700 bg-red-50/50 dark:bg-red-900/10 text-red-600 dark:text-red-400">
                  {isValidDose(route.ranges.heavy)
                    ? `${formatDoseWithUnit(route.ranges.heavy, route.unit)}+`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
