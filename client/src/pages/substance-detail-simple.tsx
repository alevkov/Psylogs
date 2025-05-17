import React, { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { MultiRouteDoseChart } from "../components/MultiRouteDoseChart";
import { SubstanceTimeline } from "../components/SubstanceTimeline";
import { getSubstanceColor, getContrastTextColor } from "../lib/color-utils";
import { DurationCurve } from "../lib/timeline.types";
import articleData from "../lib/articles_refined.json";
import { useTheme } from "../hooks/use-theme";
import { useIsMobile } from "../hooks/use-mobile";

// Basic interface definitions
interface DoseRange {
  min: number;
  max: number | null;
}

interface AdminRoute {
  route: string;
  units: string;
  dose_ranges: {
    threshold?: DoseRange;
    light?: DoseRange;
    common?: DoseRange;
    strong?: DoseRange;
    heavy?: DoseRange;
  };
}

interface DoseRangeForVisual {
  lower?: number;
  upper?: number;
}

interface DoseRangesForVisual {
  threshold?: number;
  light?: DoseRangeForVisual;
  common?: DoseRangeForVisual;
  strong?: DoseRangeForVisual;
  heavy?: number;
}

interface RouteData {
  route: string;
  ranges: DoseRangesForVisual;
  unit: string;
}

interface DurationData {
  total_duration: string;
  onset: string;
  peak: string;
  offset: string;
  after_effects?: string;
}

interface SubstanceData {
  id: number;
  title: string;
  content: string;
  drug_info: {
    drug_name: string;
    search_url?: string;
    chemical_class?: string;
    psychoactive_class?: string;
    dosages: {
      routes_of_administration: any[];
      routes_of_administration_parsed: AdminRoute[];
    };
    duration: DurationData;
    durations_parsed?: {
      [key: string]: {
        // Route as key (e.g., "oral", "insufflated")
        drug: string;
        method: string;
        duration_curve: DurationCurve;
      };
    };
    addiction_potential?: string;
    interactions?: {
      dangerous?: string[];
      unsafe?: string[];
      caution?: string[];
    };
    notes?: string;
    subjective_effects?: string[];
    tolerance?: {
      full_tolerance?: string;
      half_tolerance?: string;
      zero_tolerance?: string;
      cross_tolerances?: string[];
    };
    half_life?: string;
    categories: string[];
  };
}

export default function SubstanceDetailPage() {
  const { id } = useParams();
  const [substance, setSubstance] = useState<SubstanceData | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string>("");
  const [doseRanges, setDoseRanges] = useState<DoseRangesForVisual | null>(
    null,
  );
  const [unit, setUnit] = useState<string>("");
  const [durationCurve, setDurationCurve] = useState<DurationCurve | null>(
    null,
  );
  const [allRouteData, setAllRouteData] = useState<RouteData[]>([]);
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
  const isMobile = useIsMobile();

  // Load substance data
  useEffect(() => {
    if (id) {
      const articleId = parseInt(id);
      const foundSubstance = articleData.find(
        (article) => article.id === articleId,
      );

      if (foundSubstance) {
        // Type assertion to help TypeScript understand the structure
        setSubstance(foundSubstance as unknown as SubstanceData);

        // Set the default selected route to the first one
        if (
          foundSubstance.drug_info.dosages.routes_of_administration_parsed
            .length > 0
        ) {
          const route =
            foundSubstance.drug_info.dosages.routes_of_administration_parsed[0]
              .route;
          setSelectedRoute(route);
        }
      }
    }
  }, [id]);

  // Update dose ranges when substance or route changes
  useEffect(() => {
    if (substance && selectedRoute) {
      const route =
        substance.drug_info.dosages.routes_of_administration_parsed.find(
          (r) => r.route === selectedRoute,
        );

      if (route) {
        setUnit(route.units);

        const ranges: DoseRangesForVisual = {};

        if (route.dose_ranges.threshold) {
          ranges.threshold = route.dose_ranges.threshold.min;
        }

        if (route.dose_ranges.light) {
          ranges.light = {
            lower: route.dose_ranges.light.min,
            upper: route.dose_ranges.light.max || undefined,
          };
        }

        if (route.dose_ranges.common) {
          ranges.common = {
            lower: route.dose_ranges.common.min,
            upper: route.dose_ranges.common.max || undefined,
          };
        }

        if (route.dose_ranges.strong) {
          ranges.strong = {
            lower: route.dose_ranges.strong.min,
            upper: route.dose_ranges.strong.max || undefined,
          };
        }

        if (route.dose_ranges.heavy) {
          ranges.heavy = route.dose_ranges.heavy.min;
        }

        setDoseRanges(ranges);
      }
    }
  }, [substance, selectedRoute]);

  // Prepare data for MultiRouteDoseChart (all routes in one view)
  useEffect(() => {
    if (substance) {
      const routesData: RouteData[] = [];

      // Process each route
      substance.drug_info.dosages.routes_of_administration_parsed.forEach(
        (route) => {
          const ranges: DoseRangesForVisual = {};

          if (route.dose_ranges.threshold) {
            ranges.threshold = route.dose_ranges.threshold.min;
          }

          if (route.dose_ranges.light) {
            ranges.light = {
              lower: route.dose_ranges.light.min,
              upper: route.dose_ranges.light.max || undefined,
            };
          }

          if (route.dose_ranges.common) {
            ranges.common = {
              lower: route.dose_ranges.common.min,
              upper: route.dose_ranges.common.max || undefined,
            };
          }

          if (route.dose_ranges.strong) {
            ranges.strong = {
              lower: route.dose_ranges.strong.min,
              upper: route.dose_ranges.strong.max || undefined,
            };
          }

          if (route.dose_ranges.heavy) {
            ranges.heavy = route.dose_ranges.heavy.min;
          }

          routesData.push({
            route: route.route,
            ranges,
            unit: route.units,
          });
        },
      );

      setAllRouteData(routesData);
    }
  }, [substance]);

  // Update duration curve when substance or route changes
  useEffect(() => {
    if (substance && selectedRoute && substance.drug_info.durations_parsed) {
      // Try to find the exact route
      let routeKey = selectedRoute;

      // Handle any route mapping needed (e.g., "oral" vs "ingested")
      if (selectedRoute === "oral") {
        // Check if "ingested" exists instead
        if (substance.drug_info.durations_parsed["ingested"]) {
          routeKey = "ingested";
        }
      } else if (selectedRoute === "insufflated") {
        // Check if "snorted" or "intranasal" exists instead
        if (substance.drug_info.durations_parsed["snorted"]) {
          routeKey = "snorted";
        } else if (substance.drug_info.durations_parsed["intranasal"]) {
          routeKey = "intranasal";
        }
      }

      // Get the duration curve for the selected route
      const routeData = substance.drug_info.durations_parsed[routeKey];

      if (routeData && routeData.duration_curve) {
        setDurationCurve(routeData.duration_curve);
      } else {
        // Reset if no data is available for this route
        setDurationCurve(null);
      }
    } else {
      setDurationCurve(null);
    }
  }, [substance, selectedRoute]);

  // Handle the case where substance is not found
  if (!substance) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-500">
          Loading substance details...
        </div>
      </div>
    );
  }

  // Parse drug name utility function
  const parseDrugName = (
    drugName: string,
  ): { mainName: string; alternatives: string | null } => {
    const match = drugName.match(/^(.*?)\s*\((.*?)\)$/);

    if (match) {
      return {
        mainName: match[1].trim(),
        alternatives: match[2].trim(),
      };
    }

    return {
      mainName: drugName,
      alternatives: null,
    };
  };

  // Extract main name and alternatives
  const { mainName, alternatives } = parseDrugName(
    substance.drug_info.drug_name,
  );
  const substanceColor = getSubstanceColor(substance.title, isDarkMode);
  const textColor = getContrastTextColor(substanceColor);

  // Format dose values for display
  const formatDoseValue = (value: number | undefined) => {
    if (value === undefined) return "-";
    return value.toString();
  };

  const hasValidDoseData = (routesData: RouteData[]): boolean => {
    if (!routesData || routesData.length === 0) return false;

    // Check if ALL values are negative or undefined across all routes
    for (const route of routesData) {
      // Check if any valid value exists
      if (
        (route.ranges.threshold !== undefined && route.ranges.threshold > 0) ||
        (route.ranges.light?.lower !== undefined &&
          route.ranges.light.lower > 0) ||
        (route.ranges.common?.lower !== undefined &&
          route.ranges.common.lower > 0) ||
        (route.ranges.strong?.lower !== undefined &&
          route.ranges.strong.lower > 0) ||
        (route.ranges.heavy !== undefined && route.ranges.heavy > 0)
      ) {
        return true; // Found at least one valid value
      }
    }

    // If we reach here, no valid values were found
    return false;
  };

  // Format route abbreviations
  const formatRouteAbbreviation = (route: string): string => {
    const abbreviations: Record<string, string> = {
      oral: "Oral",
      sublingual: "SL",
      buccal: "Buccal",
      insufflated: "Insuff",
      intranasal: "IN",
      intravenous: "IV",
      intramuscular: "IM",
      subcutaneous: "SC",
      rectal: "Rectal",
      transdermal: "TD",
      smoked: "Smoked",
      vaporized: "Vapor",
      inhaled: "Inhaled",
    };

    return abbreviations[route.toLowerCase()] || route;
  };

  return (
    <div className="max-w-4xl mx-auto pb-6 px-3 sm:px-4">
      {/* Sticky Header with Back Button and Title */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 shadow-sm flex items-center h-10 px-3">
        <Link href="/substances" className="mr-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-blue-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
        </Link>

        <div className="inline-flex items-center">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {mainName}
          </span>
          {alternatives && (
            <span className="text-gray-500 dark:text-gray-400 text-xs ml-2">
              {alternatives}
            </span>
          )}
        </div>
      </div>

      {/* Main Content - Grid Layout */}
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Summary Card */}
        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-100 dark:border-gray-700 p-2 pt-1">
          <div className="flex flex-wrap gap-1.5 mt-2">
            {substance.drug_info.categories.map((category, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className="text-xs px-2 py-0.5 border"
                style={{
                  borderColor: `${substanceColor}40`,
                  color: substanceColor,
                  backgroundColor: `${substanceColor}10`,
                }}
              >
                {category}
              </Badge>
            ))}
          </div>
          <p className="text-xs p-2 text-gray-700 dark:text-gray-300 leading-relaxed mb-2">
            {substance.drug_info.notes ||
              "No summary available for this substance."}
          </p>

          {(substance.drug_info.chemical_class ||
            substance.drug_info.psychoactive_class) && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-2 gap-1">
              {substance.drug_info.chemical_class && (
                <div className=" bg-gray-50 dark:bg-gray-700/30 rounded p-6">
                  <h2 className="text-[12px] justify-center align-center font-semibold text-gray-500 dark:text-gray-400">
                    Chemical Class
                  </h2>
                  <p className="text-xs text-gray-900 dark:text-white">
                    {substance.drug_info.chemical_class}
                  </p>
                </div>
              )}

              {substance.drug_info.psychoactive_class && (
                <div className="bg-gray-50  dark:bg-gray-700/30 rounded p-6">
                  <h2 className="text-[12px] justify-center align-center font-semibold text-gray-500 dark:text-gray-400">
                    Psychoactive Class
                  </h2>
                  <p className="text-xs text-gray-900 dark:text-white">
                    {substance.drug_info.psychoactive_class}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dose Card with Route Selector */}
        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-100 dark:border-gray-700 p-2">
          <div className="  rounded p-2">
            <h2 className="text-[12px] pl-6 justify-center align-center font-semibold text-gray-500 dark:text-gray-400">
              Dosage
            </h2>

            {/* {substance.drug_info.dosages.routes_of_administration_parsed.length > 0 && (
              <div className="bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg">
                <select
                  value={selectedRoute}
                  onChange={(e) => setSelectedRoute(e.target.value)}
                  className="text-xs bg-transparent outline-none"
                >
                  {substance.drug_info.dosages.routes_of_administration_parsed.map(
                    (route) => (
                      <option key={route.route} value={route.route}>
                        {formatRouteAbbreviation(route.route)}
                      </option>
                    ),
                  )}
                </select>
              </div>
            )} */}

            {allRouteData.length > 0 ? (
              hasValidDoseData(allRouteData) ? (
                <div className="overflow-x-auto">
                  <MultiRouteDoseChart
                    routes={allRouteData}
                    substance={substance.title}
                  />
                </div>
              ) : (
                <div className="text-center py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-2xs text-gray-500 dark:text-gray-400">
                    Specific dosage information is not available for this
                    substance.
                  </p>
                </div>
              )
            ) : null}
          </div>
        </div>

        {/* Duration Card */}
        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-100 dark:border-gray-700 p-2 pt-1">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-[12px] pl-6 justify-center align-center font-semibold text-gray-500 dark:text-gray-400">
              Duration
            </h2>

            {substance.drug_info.durations_parsed &&
              Object.keys(substance.drug_info.durations_parsed).length > 0 && (
                <div className="bg-violet-100 justify-center align-center dark:bg-gray-700/50 p-1 mx-4 rounded-lg">
                  <select
                    value={selectedRoute}
                    onChange={(e) => setSelectedRoute(e.target.value)}
                    className="text-[9px] bg-transparent outline-none"
                  >
                    {Object.keys(substance.drug_info.durations_parsed).map(
                      (route) => (
                        <option key={route} value={route}>
                          {formatRouteAbbreviation(route)}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              )}
          </div>

          {durationCurve ? (
            <>
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-sm p-0 mb-3">
                <div className="w-full overflow-hidden">
                  <SubstanceTimeline
                    substance={substance.title}
                    route={selectedRoute}
                    durationCurve={durationCurve}
                    className="w-full"
                  />
                </div>
              </div>
              {durationCurve.reference && (
                <div className="text-[9px] text-gray-500 dark:text-gray-400 italic mb-3 px-1 border-t border-dashed border-gray-200 dark:border-gray-700 pt-1 mt-1">
                  Source: {durationCurve.reference}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Timeline visualization is not available for this route.
              </p>
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <td className="py-1 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 w-1/4">
                    Onset
                  </td>
                  <td className="py-1 px-2 font-medium text-gray-900 dark:text-white">
                    {substance.drug_info.duration.onset}
                  </td>
                </tr>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <td className="py-1 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Peak
                  </td>
                  <td className="py-1 px-2 font-medium text-gray-900 dark:text-white">
                    {substance.drug_info.duration.peak}
                  </td>
                </tr>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <td className="py-1 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Offset
                  </td>
                  <td className="py-1 px-2 font-medium text-gray-900 dark:text-white">
                    {substance.drug_info.duration.offset}
                  </td>
                </tr>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <td className="py-1 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Total
                  </td>
                  <td className="py-1 px-2 font-medium text-gray-900 dark:text-white">
                    {substance.drug_info.duration.total_duration}
                  </td>
                </tr>
                {substance.drug_info.duration.after_effects && (
                  <tr>
                    <td className="py-1 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                      After Effects
                    </td>
                    <td className="py-1 px-2 font-medium text-gray-900 dark:text-white">
                      {substance.drug_info.duration.after_effects}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Effects Card */}
        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-100 dark:border-gray-700 p-2 pt-1">
          <h3 className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-tight mb-1">
            Effects
          </h3>

          {substance.drug_info.subjective_effects?.length ? (
            <div className="flex flex-wrap gap-1">
              {substance.drug_info.subjective_effects.map((effect, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-[10px] text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700 px-1.5 py-0"
                >
                  {effect}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="text-center py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                No effects information available.
              </p>
            </div>
          )}
        </div>

        {/* Safety Information Card - Full Width */}
        {substance.drug_info.interactions && (
          <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-100 dark:border-gray-700 p-2 pt-1 col-span-1 md:col-span-2">
            <h3 className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-tight mb-1">
              Safety Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {substance.drug_info.interactions.dangerous &&
                substance.drug_info.interactions.dangerous.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                    <h4 className="text-[10px] text-red-600 dark:text-red-400 font-bold uppercase mb-1">
                      Dangerous Interactions
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {substance.drug_info.interactions.dangerous.map(
                        (item, idx) => (
                          <Badge
                            key={idx}
                            variant="destructive"
                            className="text-[10px] py-0 px-1.5"
                          >
                            {item}
                          </Badge>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {substance.drug_info.interactions.unsafe &&
                substance.drug_info.interactions.unsafe.length > 0 && (
                  <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-2">
                    <h4 className="text-[10px] text-orange-600 dark:text-orange-400 font-bold uppercase mb-1">
                      Unsafe Combinations
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {substance.drug_info.interactions.unsafe.map(
                        (item, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-[10px] text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700 py-0 px-1.5"
                          >
                            {item}
                          </Badge>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {substance.drug_info.interactions.caution &&
                substance.drug_info.interactions.caution.length > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-2">
                    <h4 className="text-[10px] text-yellow-600 dark:text-yellow-400 font-bold uppercase mb-1">
                      Use With Caution
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {substance.drug_info.interactions.caution.map(
                        (item, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-[10px] text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700 py-0 px-1.5"
                          >
                            {item}
                          </Badge>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {substance.drug_info.addiction_potential && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded p-2">
                  <h4 className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase mb-1">
                    Addiction Potential
                  </h4>
                  <p className="text-xs text-gray-800 dark:text-gray-200">
                    {substance.drug_info.addiction_potential}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tolerance Card - Full Width */}
        {substance.drug_info.tolerance && (
          <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-100 dark:border-gray-700 p-2 pt-1 col-span-1 md:col-span-2">
            <h3 className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-tight mb-1">
              Tolerance & Recovery
            </h3>

            <div className="bg-gray-50 dark:bg-gray-700/30 rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <tbody>
                  {substance.drug_info.tolerance.full_tolerance && (
                    <tr className="border-b border-gray-200 dark:border-gray-600">
                      <td className="py-1 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 w-1/3">
                        Full Tolerance
                      </td>
                      <td className="py-1 px-2 font-medium text-gray-700 dark:text-gray-300">
                        {substance.drug_info.tolerance.full_tolerance}
                      </td>
                    </tr>
                  )}
                  {substance.drug_info.tolerance.half_tolerance && (
                    <tr className="border-b border-gray-200 dark:border-gray-600">
                      <td className="py-1 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Half Tolerance
                      </td>
                      <td className="py-1 px-2 font-medium text-gray-700 dark:text-gray-300">
                        {substance.drug_info.tolerance.half_tolerance}
                      </td>
                    </tr>
                  )}
                  {substance.drug_info.tolerance.zero_tolerance && (
                    <tr>
                      <td className="py-1 px-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Zero Tolerance
                      </td>
                      <td className="py-1 px-2 font-medium text-gray-700 dark:text-gray-300">
                        {substance.drug_info.tolerance.zero_tolerance}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {substance.drug_info.tolerance.cross_tolerances &&
              substance.drug_info.tolerance.cross_tolerances.length > 0 && (
                <div className="mt-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-1.5">
                  <h4 className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase mb-1">
                    Cross Tolerances
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {substance.drug_info.tolerance.cross_tolerances.map(
                      (item, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="text-[10px] bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 py-0 px-1.5"
                        >
                          {item}
                        </Badge>
                      ),
                    )}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
