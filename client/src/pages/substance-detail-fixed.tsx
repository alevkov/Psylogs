import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "wouter";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { DoseRangeVisual } from "../components/DoseRangeVisual";
import { getSubstanceColor } from "../lib/color-utils";
import articleData from "../lib/articles_refined.json";

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

interface DurationData {
  total_duration: string;
  onset: string;
  peak: string;
  offset: string;
  after_effects?: string;
}

// General route duration curve type that can handle both insufflated and oral
interface RouteDurationCurve {
  drug: string;
  method: string;
  duration_curve: {
    reference: string;
    units: string;
    total_duration: {
      min: number;
      max: number;
    };
    onset: {
      start: number;
      end: number;
    };
    peak: {
      start: number;
      end: number;
    };
    offset: {
      start: number;
      end: number;
    };
    after_effects?: {
      start: number;
      end: number;
    };
  };
}

interface DurationParsed {
  insufflated?: RouteDurationCurve;
  oral?: RouteDurationCurve;
  [key: string]: RouteDurationCurve | undefined; // Allow other administration routes
}

// Timeline graph point interface
interface TimePoint {
  time: number; // In hours
  intensity: number; // 0-100
  label?: string; // Optional label for the point
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
    durations_parsed?: DurationParsed;
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
  const [doseRanges, setDoseRanges] = useState<DoseRangesForVisual | null>(null);
  const [unit, setUnit] = useState<string>("");
  const [activeSection, setActiveSection] = useState<string>("summary");
  const [timePoints, setTimePoints] = useState<TimePoint[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Parse drug name utility function
  const parseDrugName = (drugName: string): { mainName: string; alternatives: string | null } => {
    const match = drugName.match(/^(.*?)\s*\((.*?)\)$/);
    
    if (match) {
      return {
        mainName: match[1].trim(),
        alternatives: match[2].trim()
      };
    }
    
    return {
      mainName: drugName,
      alternatives: null
    };
  };

  // Generate timeline data points from duration data
  const generateTimePoints = (substance: SubstanceData, selectedRoute: string): TimePoint[] => {
    if (!substance.drug_info.durations_parsed) {
      return [];
    }
    
    // Get duration data based on route
    const methodData = selectedRoute === 'oral' 
      ? substance.drug_info.durations_parsed.oral 
      : substance.drug_info.durations_parsed?.insufflated;
    
    if (!methodData) {
      return [];
    }
    
    const { duration_curve } = methodData;
    const points: TimePoint[] = [];
    
    // Starting point - zero intensity
    points.push({ time: 0, intensity: 0, label: 'Start' });
    
    // Onset phase - rising intensity
    points.push({ time: duration_curve.onset.start, intensity: 10, label: 'Onset start' });
    points.push({ time: duration_curve.onset.end, intensity: 40, label: 'Onset end' });
    
    // Peak phase - maximum intensity
    points.push({ time: duration_curve.peak.start, intensity: 90, label: 'Peak start' });
    points.push({ time: duration_curve.peak.end, intensity: 90, label: 'Peak end' });
    
    // Offset phase - decreasing intensity
    points.push({ time: duration_curve.offset.start, intensity: 40, label: 'Offset start' });
    points.push({ time: duration_curve.offset.end, intensity: 10, label: 'Offset end' });
    
    // After effects if available
    if (duration_curve.after_effects) {
      points.push({ time: duration_curve.after_effects.start, intensity: 5, label: 'After effects start' });
      points.push({ time: duration_curve.after_effects.end, intensity: 0, label: 'After effects end' });
    } else {
      // End point if no after effects
      points.push({ time: duration_curve.offset.end + 0.5, intensity: 0, label: 'End' });
    }
    
    return points;
  };

  // Format dose values for display
  const formatDoseValue = (value: number | undefined) => {
    if (value === undefined) return "-";
    return value.toString();
  };

  // Load substance data
  useEffect(() => {
    if (id) {
      const articleId = parseInt(id);
      const foundSubstance = articleData.find(article => article.id === articleId);
      
      if (foundSubstance) {
        // Type assertion to help TypeScript understand the structure
        setSubstance(foundSubstance as unknown as SubstanceData);
        
        // Set the default selected route to the first one
        if (foundSubstance.drug_info.dosages.routes_of_administration_parsed.length > 0) {
          const route = foundSubstance.drug_info.dosages.routes_of_administration_parsed[0].route;
          setSelectedRoute(route);
        }
      }
    }
  }, [id]);

  // Update dose ranges and timepoints when substance or route changes
  useEffect(() => {
    if (substance && selectedRoute) {
      const route = substance.drug_info.dosages.routes_of_administration_parsed.find(r => r.route === selectedRoute);
      
      if (route) {
        setUnit(route.units);
        
        const ranges: DoseRangesForVisual = {};
        
        if (route.dose_ranges.threshold) {
          ranges.threshold = route.dose_ranges.threshold.min;
        }
        
        if (route.dose_ranges.light) {
          ranges.light = {
            lower: route.dose_ranges.light.min,
            upper: route.dose_ranges.light.max || undefined
          };
        }
        
        if (route.dose_ranges.common) {
          ranges.common = {
            lower: route.dose_ranges.common.min,
            upper: route.dose_ranges.common.max || undefined
          };
        }
        
        if (route.dose_ranges.strong) {
          ranges.strong = {
            lower: route.dose_ranges.strong.min,
            upper: route.dose_ranges.strong.max || undefined
          };
        }
        
        if (route.dose_ranges.heavy) {
          ranges.heavy = route.dose_ranges.heavy.min;
        }
        
        setDoseRanges(ranges);
        
        // Generate time points for the timeline graph
        const points = generateTimePoints(substance, selectedRoute);
        setTimePoints(points);
      }
    }
  }, [substance, selectedRoute]);

  // Handle the case where substance is not found
  if (!substance) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-500">Loading substance details...</div>
      </div>
    );
  }

  const substanceColor = getSubstanceColor(substance.title);
  const { mainName, alternatives } = parseDrugName(substance.drug_info.drug_name);

  // Function to draw the duration curve
  const drawDurationCurve = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || timePoints.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dimensions
    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 30, right: 20, bottom: 40, left: 40 };
    
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;
    
    // Find the max time value for scaling
    const maxTime = Math.max(...timePoints.map(p => p.time)) * 1.1; // Add 10% for margin
    
    // Scale functions
    const scaleX = (time: number) => (time / maxTime) * graphWidth + padding.left;
    const scaleY = (intensity: number) => height - padding.bottom - (intensity / 100) * graphHeight;
    
    // Draw axes
    ctx.beginPath();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    
    // X-axis
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    
    // Y-axis
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(padding.left, padding.top);
    
    ctx.stroke();
    
    // Draw X-axis labels (time in hours)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    
    const hourMarks = Math.min(Math.ceil(maxTime), 12); // Max 12 hour marks
    for (let i = 0; i <= hourMarks; i++) {
      const hours = (i / hourMarks) * maxTime;
      const x = scaleX(hours);
      ctx.fillText(`${hours.toFixed(1)}h`, x, height - padding.bottom + 10);
    }
    
    // Draw Y-axis labels (intensity)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let intensity = 0; intensity <= 100; intensity += 20) {
      const y = scaleY(intensity);
      ctx.fillText(`${intensity}%`, padding.left - 5, y);
    }
    
    // Draw the curve
    ctx.beginPath();
    ctx.strokeStyle = substanceColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    
    // Move to first point
    ctx.moveTo(scaleX(timePoints[0].time), scaleY(timePoints[0].intensity));
    
    // Draw curve through points
    for (let i = 1; i < timePoints.length; i++) {
      const point = timePoints[i];
      ctx.lineTo(scaleX(point.time), scaleY(point.intensity));
    }
    
    ctx.stroke();
    
    // Draw points
    for (const point of timePoints) {
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = substanceColor;
      ctx.lineWidth = 2;
      ctx.arc(scaleX(point.time), scaleY(point.intensity), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    
    // Draw title
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Duration Timeline', width / 2, 15);
  }, [timePoints, substanceColor]);
  
  // Effect to draw the duration curve when the canvas is available or timePoints change
  useEffect(() => {
    if (activeSection === "duration") {
      drawDurationCurve();
    }
  }, [activeSection, drawDurationCurve]);

  return (
    <div className="max-w-4xl mx-auto pb-10 px-4 sm:px-6">
      {/* Sticky Header with Back Button and Title */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 py-3 px-2 mb-6 rounded-b-lg shadow-md flex items-center">
        <Link href="/substances">
          <Button variant="ghost" className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 p-2 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </Button>
        </Link>
        
        <div className="flex flex-col ml-2">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{mainName}</h1>
          {alternatives && (
            <span className="text-gray-500 dark:text-gray-400 text-xs transition-opacity">
              {alternatives.split(', ').join(' / ')}
            </span>
          )}
        </div>
        
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="text-blue-500 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-900/30">
            Article
          </Button>
        </div>
      </div>
      
      {/* Navigation tabs for different sections */}
      <div className="mb-6 overflow-x-auto pb-2 flex">
        <div className="flex space-x-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg w-full">
          {["summary", "dose", "duration", "effects", "safety", "tolerance", "info"].map((section) => (
            <Button
              key={section}
              variant={activeSection === section ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSection(section)}
              className={`capitalize ${activeSection === section ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}
            >
              {section}
            </Button>
          ))}
        </div>
      </div>
      
      {/* Content sections */}
      <div>
        {/* Summary Section */}
        {activeSection === "summary" && (
          <div className="rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-md">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Summary</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                {substance.drug_info.notes || "No summary available for this substance."}
              </p>
              
              <div className="flex flex-wrap gap-2 mt-4">
                {substance.drug_info.categories.map((category, idx) => (
                  <Badge 
                    key={idx} 
                    variant="outline" 
                    className="bg-opacity-10 text-sm px-3 py-1 border-2" 
                    style={{ borderColor: `${substanceColor}40`, color: substanceColor }}
                  >
                    {category}
                  </Badge>
                ))}
              </div>
              
              {(substance.drug_info.chemical_class || substance.drug_info.psychoactive_class) && (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {substance.drug_info.chemical_class && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Chemical Class</h3>
                      <p className="text-gray-900 dark:text-white">{substance.drug_info.chemical_class}</p>
                    </div>
                  )}
                  
                  {substance.drug_info.psychoactive_class && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Psychoactive Class</h3>
                      <p className="text-gray-900 dark:text-white">{substance.drug_info.psychoactive_class}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Dosage Information Section */}
        {activeSection === "dose" && (
          <div className="rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dosage Information</h2>
                <Button variant="outline" size="sm" className="text-xs text-blue-500 border-blue-200 hover:border-blue-300">
                  Disclaimer
                </Button>
              </div>
              
              {/* Route Selection */}
              <Tabs 
                value={selectedRoute} 
                onValueChange={setSelectedRoute}
                className="w-full"
              >
                <TabsList className="mb-6 w-full justify-start bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg">
                  {substance.drug_info.dosages.routes_of_administration_parsed.map((route) => (
                    <TabsTrigger 
                      key={route.route} 
                      value={route.route} 
                      className="capitalize data-[state=active]:bg-white dark:data-[state=active]:bg-gray-600 data-[state=active]:shadow"
                    >
                      {route.route}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                {substance.drug_info.dosages.routes_of_administration_parsed.map((route) => (
                  <TabsContent key={route.route} value={route.route}>
                    {doseRanges && (
                      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-6 mb-6">
                        <div className="flex justify-between items-center mb-8">
                          <div className="flex flex-col">
                            <span className="text-sm text-gray-500 dark:text-gray-400">Dosage measured in</span>
                            <span className="text-xl font-semibold text-gray-900 dark:text-white">{unit}</span>
                          </div>
                        </div>
                        
                        {/* Dose Range Labels */}
                        <div className="grid grid-cols-5 gap-2 mb-4">
                          <div className="flex flex-col items-center">
                            <span className="text-lg font-bold text-blue-500">
                              {formatDoseValue(doseRanges.threshold)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">Threshold</span>
                          </div>
                          
                          <div className="flex flex-col items-center">
                            <span className="text-lg font-bold text-green-500">
                              {doseRanges.light ? 
                                `${formatDoseValue(doseRanges.light.lower)}${doseRanges.light.upper ? `-${formatDoseValue(doseRanges.light.upper)}` : ''}` : 
                                "-"}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">Light</span>
                          </div>
                          
                          <div className="flex flex-col items-center">
                            <span className="text-lg font-bold text-yellow-500">
                              {doseRanges.common ? 
                                `${formatDoseValue(doseRanges.common.lower)}${doseRanges.common.upper ? `-${formatDoseValue(doseRanges.common.upper)}` : ''}` : 
                                "-"}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">Common</span>
                          </div>
                          
                          <div className="flex flex-col items-center">
                            <span className="text-lg font-bold text-orange-500">
                              {doseRanges.strong ? 
                                `${formatDoseValue(doseRanges.strong.lower)}${doseRanges.strong.upper ? `-${formatDoseValue(doseRanges.strong.upper)}` : ''}` : 
                                "-"}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">Strong</span>
                          </div>
                          
                          <div className="flex flex-col items-center">
                            <span className="text-lg font-bold text-red-500">
                              {formatDoseValue(doseRanges.heavy)}+
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">Heavy</span>
                          </div>
                        </div>
                        
                        {/* Dose Range Visual */}
                        <div className="h-24 mb-6">
                          <DoseRangeVisual 
                            ranges={doseRanges}
                            currentDose={0}
                            unit={unit}
                          />
                        </div>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </div>
        )}
        
        {/* Duration Section */}
        {activeSection === "duration" && (
          <div className="rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-md">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Duration</h2>
              
              {/* Duration Curve Visualization */}
              <div className="mb-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Duration Timeline</h3>
                
                {/* Tabs for routes, if durations_parsed exists */}
                {substance.drug_info.durations_parsed && (
                  <Tabs 
                    value={selectedRoute} 
                    onValueChange={setSelectedRoute}
                    className="w-full mb-4"
                  >
                    <TabsList className="w-full justify-start bg-gray-100 dark:bg-gray-700/50 p-1 rounded-lg">
                      {substance.drug_info.dosages.routes_of_administration_parsed.map((route) => (
                        <TabsTrigger 
                          key={route.route} 
                          value={route.route} 
                          className="capitalize data-[state=active]:bg-white dark:data-[state=active]:bg-gray-600 data-[state=active]:shadow"
                        >
                          {route.route}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}
                
                {/* Canvas for the curve visualization */}
                <div className="mt-2">
                  <canvas 
                    ref={canvasRef} 
                    width={600} 
                    height={300} 
                    className="w-full h-64 bg-white dark:bg-gray-800 rounded-md shadow-inner border border-gray-200 dark:border-gray-700"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Onset</h3>
                  <p className="text-gray-900 dark:text-white font-medium">{substance.drug_info.duration.onset}</p>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Peak</h3>
                  <p className="text-gray-900 dark:text-white font-medium">{substance.drug_info.duration.peak}</p>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Offset</h3>
                  <p className="text-gray-900 dark:text-white font-medium">{substance.drug_info.duration.offset}</p>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 md:col-span-3">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Total Duration</h3>
                  <p className="text-gray-900 dark:text-white font-medium">{substance.drug_info.duration.total_duration}</p>
                </div>
                
                {substance.drug_info.duration.after_effects && (
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 md:col-span-3">
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">After Effects</h3>
                    <p className="text-gray-900 dark:text-white font-medium">{substance.drug_info.duration.after_effects}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Effects Section */}
        {activeSection === "effects" && (
          <div className="rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-md">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Effects</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {substance.drug_info.subjective_effects?.map((effect, idx) => (
                  <div key={idx} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                    <p className="text-gray-800 dark:text-gray-200">{effect}</p>
                  </div>
                ))}
                
                {!substance.drug_info.subjective_effects?.length && (
                  <div className="col-span-2 text-gray-500 italic text-center py-10">
                    No effects information available.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Safety Information */}
        {activeSection === "safety" && substance.drug_info.interactions && (
          <div className="rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-md">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Safety Information</h2>
              
              <div className="space-y-6">
                {substance.drug_info.interactions.dangerous && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <h3 className="text-red-600 dark:text-red-400 font-bold text-lg mb-3">DANGEROUS INTERACTIONS</h3>
                    <div className="flex flex-wrap gap-2">
                      {substance.drug_info.interactions.dangerous.map((item, idx) => (
                        <Badge key={idx} variant="destructive" className="text-sm py-1 px-3">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {substance.drug_info.interactions.unsafe && (
                  <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                    <h3 className="text-orange-600 dark:text-orange-400 font-bold text-lg mb-3">UNSAFE COMBINATIONS</h3>
                    <div className="flex flex-wrap gap-2">
                      {substance.drug_info.interactions.unsafe.map((item, idx) => (
                        <Badge key={idx} variant="outline" className="text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700 text-sm py-1 px-3">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {substance.drug_info.interactions.caution && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <h3 className="text-yellow-600 dark:text-yellow-400 font-bold text-lg mb-3">USE WITH CAUTION</h3>
                    <div className="flex flex-wrap gap-2">
                      {substance.drug_info.interactions.caution.map((item, idx) => (
                        <Badge key={idx} variant="outline" className="text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700 text-sm py-1 px-3">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {substance.drug_info.addiction_potential && (
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                    <h3 className="text-purple-600 dark:text-purple-400 font-bold text-lg mb-3">ADDICTION POTENTIAL</h3>
                    <p className="text-gray-800 dark:text-gray-200">{substance.drug_info.addiction_potential}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Tolerance */}
        {activeSection === "tolerance" && substance.drug_info.tolerance && (
          <div className="rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-md">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Tolerance & Recovery</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {substance.drug_info.tolerance.full_tolerance && (
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2">Full Tolerance</h3>
                    <p className="text-gray-700 dark:text-gray-300">{substance.drug_info.tolerance.full_tolerance}</p>
                  </div>
                )}
                
                {substance.drug_info.tolerance.half_tolerance && (
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2">Half Tolerance</h3>
                    <p className="text-gray-700 dark:text-gray-300">{substance.drug_info.tolerance.half_tolerance}</p>
                  </div>
                )}
                
                {substance.drug_info.tolerance.zero_tolerance && (
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-2">Zero Tolerance</h3>
                    <p className="text-gray-700 dark:text-gray-300">{substance.drug_info.tolerance.zero_tolerance}</p>
                  </div>
                )}
              </div>
              
              {substance.drug_info.tolerance.cross_tolerances && substance.drug_info.tolerance.cross_tolerances.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h3 className="text-blue-600 dark:text-blue-400 font-bold text-lg mb-3">CROSS TOLERANCES</h3>
                  <div className="flex flex-wrap gap-2">
                    {substance.drug_info.tolerance.cross_tolerances.map((item, idx) => (
                      <Badge key={idx} variant="outline" className="bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 text-sm py-1 px-3">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Additional Info */}
        {activeSection === "info" && (
          <div className="rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-md">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Additional Information</h2>
              
              <div className="grid grid-cols-1 gap-4">
                {substance.drug_info.chemical_class && (
                  <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400 font-medium">Chemical Class</span>
                    <span className="text-gray-900 dark:text-white">{substance.drug_info.chemical_class}</span>
                  </div>
                )}
                
                {substance.drug_info.psychoactive_class && (
                  <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400 font-medium">Psychoactive Class</span>
                    <span className="text-gray-900 dark:text-white">{substance.drug_info.psychoactive_class}</span>
                  </div>
                )}
                
                {substance.drug_info.half_life && (
                  <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400 font-medium">Half Life</span>
                    <span className="text-gray-900 dark:text-white">{substance.drug_info.half_life}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}