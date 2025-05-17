import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { MultiRouteDoseChart } from "./MultiRouteDoseChart";
import { SubstanceTimeline } from "./SubstanceTimeline";
import { getSubstanceColor } from "../lib/color-utils";
import { DurationCurve } from "../lib/timeline.types";
import articleData from "../lib/articles_refined.json";

// Type definitions
interface SubstanceDetailDialogProps {
  substanceId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

export function SubstanceDetailDialog({ 
  substanceId, 
  open, 
  onOpenChange 
}: SubstanceDetailDialogProps) {
  const [substance, setSubstance] = useState<SubstanceData | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string>("");
  const [doseRanges, setDoseRanges] = useState<DoseRangesForVisual | null>(null);
  const [unit, setUnit] = useState<string>("");
  const [activeSection, setActiveSection] = useState<string>("dose");
  const [durationCurve, setDurationCurve] = useState<DurationCurve | null>(null);
  const [allRouteData, setAllRouteData] = useState<RouteData[]>([]);

  // Load substance data when ID changes
  useEffect(() => {
    if (substanceId) {
      const foundSubstance = articleData.find(
        (article) => article.id === substanceId,
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
      } else {
        setSubstance(null);
      }
    } else {
      setSubstance(null);
    }
  }, [substanceId]);

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

      substance.drug_info.dosages.routes_of_administration_parsed.forEach(
        (routeInfo) => {
          const ranges: DoseRangesForVisual = {};

          if (routeInfo.dose_ranges.threshold) {
            ranges.threshold = routeInfo.dose_ranges.threshold.min;
          }

          if (routeInfo.dose_ranges.light) {
            ranges.light = {
              lower: routeInfo.dose_ranges.light.min,
              upper: routeInfo.dose_ranges.light.max || undefined,
            };
          }

          if (routeInfo.dose_ranges.common) {
            ranges.common = {
              lower: routeInfo.dose_ranges.common.min,
              upper: routeInfo.dose_ranges.common.max || undefined,
            };
          }

          if (routeInfo.dose_ranges.strong) {
            ranges.strong = {
              lower: routeInfo.dose_ranges.strong.min,
              upper: routeInfo.dose_ranges.strong.max || undefined,
            };
          }

          if (routeInfo.dose_ranges.heavy) {
            ranges.heavy = routeInfo.dose_ranges.heavy.min;
          }

          routesData.push({
            route: routeInfo.route,
            ranges,
            unit: routeInfo.units,
          });
        },
      );

      setAllRouteData(routesData);
    }
  }, [substance]);

  // Update duration curve when route changes
  useEffect(() => {
    if (substance && selectedRoute && substance.drug_info.durations_parsed) {
      // Find the correct route key (may require mapping)
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
  if (open && !substance) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Substance Details</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-gray-500">
              Substance not found or still loading...
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

  // Show a loading or not found message if substance data isn't available
  if (!substance) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              Substance Details
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            {substanceId === null 
              ? "No substance selected."
              : "Loading substance information..."}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Get the substance primary color for UI elements
  const substanceColor = getSubstanceColor(substance.title);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="text-2xl font-bold">
              {parseDrugName(substance.drug_info.drug_name).mainName}
              {parseDrugName(substance.drug_info.drug_name).alternatives && (
                <span className="text-muted-foreground ml-2 text-lg">
                  ({parseDrugName(substance.drug_info.drug_name).alternatives})
                </span>
              )}
            </DialogTitle>
            <DialogClose className="rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <span className="sr-only">Close</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </svg>
            </DialogClose>
          </div>
        </DialogHeader>

        {/* Tabs for different sections */}
        <Tabs defaultValue="dose" onValueChange={setActiveSection} className="mt-4">
          <TabsList className="w-full justify-start mb-4 overflow-x-auto">
            <TabsTrigger value="dose">Dosage</TabsTrigger>
            <TabsTrigger value="duration">Duration</TabsTrigger>
            <TabsTrigger value="effects">Effects</TabsTrigger>
            <TabsTrigger value="safety">Safety</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>

          {/* Dosage Section */}
          <TabsContent value="dose" className="space-y-4">
            {/* Dose chart - all routes shown in chart */}
            {doseRanges && (
              <div className="bg-card dark:bg-gray-800 rounded-lg p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">
                  Dosage Ranges for All Routes
                </h3>
                <div className="w-full h-56 flex items-center justify-center">
                  <MultiRouteDoseChart
                    routes={allRouteData}
                    substance={substance.title}
                    className="w-full h-full"
                  />
                </div>
              </div>
            )}
          </TabsContent>

          {/* Duration Section */}
          <TabsContent value="duration" className="space-y-4">
            <div className="bg-card dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              {/* Route selection - moved from Dose tab */}
              <div className="flex flex-wrap gap-2 mb-6">
                {substance.drug_info.dosages.routes_of_administration_parsed.map(
                  (route) => (
                    <Badge
                      key={route.route}
                      variant={
                        selectedRoute === route.route ? "default" : "outline"
                      }
                      className="cursor-pointer text-sm px-3 py-1 capitalize"
                      style={{
                        backgroundColor:
                          selectedRoute === route.route
                            ? substanceColor
                            : "transparent",
                        borderColor:
                          selectedRoute !== route.route
                            ? `${substanceColor}40`
                            : "transparent",
                        color:
                          selectedRoute === route.route
                            ? "white"
                            : substanceColor,
                      }}
                      onClick={() => setSelectedRoute(route.route)}
                    >
                      {route.route}
                    </Badge>
                  ),
                )}
              </div>
              
              <h3 className="text-lg font-semibold mb-4 capitalize">
                {selectedRoute} Timeline
              </h3>

              {/* Timeline visualization using durations_parsed data */}
              {durationCurve && (
                <div className="bg-card/50 dark:bg-gray-700/30 dark:bg-gray-700/30 dark:bg-gray-700/30 rounded-sm p-0 mb-6">
                  <div className="w-full overflow-hidden">
                    <SubstanceTimeline
                      substance={substance.title}
                      route={selectedRoute}
                      durationCurve={durationCurve}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              {/* Duration details boxes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="bg-card/50 dark:bg-gray-700/30 dark:bg-gray-700/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-1">
                    Onset
                  </h3>
                  <p className="font-medium">
                    {substance.drug_info.duration.onset}
                  </p>
                </div>

                <div className="bg-card/50 dark:bg-gray-700/30 dark:bg-gray-700/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-1">
                    Peak
                  </h3>
                  <p className="font-medium">
                    {substance.drug_info.duration.peak}
                  </p>
                </div>

                <div className="bg-card/50 dark:bg-gray-700/30 dark:bg-gray-700/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-1">
                    Offset
                  </h3>
                  <p className="font-medium">
                    {substance.drug_info.duration.offset}
                  </p>
                </div>

                <div className="col-span-full bg-card/50 dark:bg-gray-700/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-1">
                    Total Duration
                  </h3>
                  <p className="font-medium">
                    {substance.drug_info.duration.total_duration}
                  </p>
                </div>

                {substance.drug_info.duration.after_effects && (
                  <div className="col-span-full bg-card/50 dark:bg-gray-700/30 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-1">
                      After Effects
                    </h3>
                    <p className="font-medium">
                      {substance.drug_info.duration.after_effects}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Effects Section */}
          <TabsContent value="effects" className="space-y-4">
            <div className="bg-card dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Effects</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {substance.drug_info.subjective_effects?.map((effect, idx) => (
                  <div
                    key={idx}
                    className="bg-card/50 dark:bg-gray-700/30 dark:bg-gray-700/30 rounded-lg p-4"
                  >
                    <p>{effect}</p>
                  </div>
                ))}

                {!substance.drug_info.subjective_effects?.length && (
                  <div className="col-span-2 text-muted-foreground italic text-center py-10">
                    No effects information available.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Safety Information */}
          <TabsContent value="safety" className="space-y-4">
            <div className="bg-card dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Safety Information</h3>

              {substance.drug_info.interactions ? (
                <div className="space-y-6">
                  {substance.drug_info.interactions.dangerous && substance.drug_info.interactions.dangerous.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-base font-medium text-destructive">
                        Dangerous Interactions
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {substance.drug_info.interactions.dangerous.map(
                          (item, idx) => (
                            <Badge
                              key={idx}
                              variant="destructive"
                              className="text-sm"
                            >
                              {item}
                            </Badge>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {substance.drug_info.interactions.unsafe && substance.drug_info.interactions.unsafe.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-base font-medium text-orange-500 dark:text-orange-400">
                        Unsafe Interactions
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {substance.drug_info.interactions.unsafe.map(
                          (item, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="text-sm border-orange-500 text-orange-500 dark:border-orange-400 dark:text-orange-400"
                            >
                              {item}
                            </Badge>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {substance.drug_info.interactions.caution && substance.drug_info.interactions.caution.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-base font-medium text-yellow-500 dark:text-yellow-400">
                        Use Caution
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {substance.drug_info.interactions.caution.map(
                          (item, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="text-sm border-yellow-500 text-yellow-500 dark:border-yellow-400 dark:text-yellow-400"
                            >
                              {item}
                            </Badge>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground italic">
                  No interaction data available.
                </p>
              )}

              {substance.drug_info.addiction_potential && (
                <div className="mt-6">
                  <h4 className="text-base font-medium mb-2">
                    Addiction Potential
                  </h4>
                  <p className="text-muted-foreground">
                    {substance.drug_info.addiction_potential}
                  </p>
                </div>
              )}

              {substance.drug_info.tolerance && (
                <div className="mt-6 space-y-4">
                  <h4 className="text-base font-medium">Tolerance</h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {substance.drug_info.tolerance.full_tolerance && (
                      <div className="bg-card/50 dark:bg-gray-700/30 dark:bg-gray-700/30 rounded-lg p-3">
                        <h5 className="text-sm font-medium mb-1">
                          Full Tolerance
                        </h5>
                        <p className="text-sm text-muted-foreground">
                          {substance.drug_info.tolerance.full_tolerance}
                        </p>
                      </div>
                    )}

                    {substance.drug_info.tolerance.half_tolerance && (
                      <div className="bg-card/50 dark:bg-gray-700/30 dark:bg-gray-700/30 rounded-lg p-3">
                        <h5 className="text-sm font-medium mb-1">
                          Half Tolerance
                        </h5>
                        <p className="text-sm text-muted-foreground">
                          {substance.drug_info.tolerance.half_tolerance}
                        </p>
                      </div>
                    )}

                    {substance.drug_info.tolerance.zero_tolerance && (
                      <div className="bg-card/50 dark:bg-gray-700/30 dark:bg-gray-700/30 rounded-lg p-3">
                        <h5 className="text-sm font-medium mb-1">
                          Zero Tolerance
                        </h5>
                        <p className="text-sm text-muted-foreground">
                          {substance.drug_info.tolerance.zero_tolerance}
                        </p>
                      </div>
                    )}
                  </div>

                  {substance.drug_info.tolerance.cross_tolerances && 
                    substance.drug_info.tolerance.cross_tolerances.length > 0 && (
                    <div className="mt-4">
                      <h5 className="text-sm font-medium mb-2">
                        Cross Tolerances
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {substance.drug_info.tolerance.cross_tolerances.map(
                          (item, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="text-sm"
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
          </TabsContent>

          {/* Summary Section */}
          <TabsContent value="summary" className="space-y-4">
            <div className="bg-card dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Summary</h3>
              <p className="leading-relaxed mb-6">
                {substance.drug_info.notes ||
                  "No summary available for this substance."}
              </p>

              <div className="flex flex-wrap gap-2 mt-4">
                {substance.drug_info.categories.map((category, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="bg-opacity-10 text-sm px-3 py-1 border-2"
                    style={{
                      borderColor: `${substanceColor}40`,
                      color: substanceColor,
                    }}
                  >
                    {category}
                  </Badge>
                ))}
              </div>

              {(substance.drug_info.chemical_class ||
                substance.drug_info.psychoactive_class) && (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {substance.drug_info.chemical_class && (
                    <div className="bg-card/50 dark:bg-gray-700/30 dark:bg-gray-700/30 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-muted-foreground mb-1">
                        Chemical Class
                      </h4>
                      <p>
                        {substance.drug_info.chemical_class}
                      </p>
                    </div>
                  )}

                  {substance.drug_info.psychoactive_class && (
                    <div className="bg-card/50 dark:bg-gray-700/30 dark:bg-gray-700/30 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-muted-foreground mb-1">
                        Psychoactive Class
                      </h4>
                      <p>
                        {substance.drug_info.psychoactive_class}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}