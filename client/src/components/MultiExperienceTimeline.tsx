import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { getAllDosesForStats } from "../lib/db";
import { DoseEntry } from "../lib/constants";
import { format, formatDistance, differenceInMilliseconds } from "date-fns";
import { motion } from "framer-motion";
import { Activity, Clock, AlertCircle } from "lucide-react";
import { useDoseContext } from "../contexts/DoseContext";
import { useInView } from "react-intersection-observer";
import { getSubstanceColor, getContrastTextColor } from "../lib/color-utils";

// Import articles refined data instead of the previous timeline sources
import articlesRefined from "../lib/articles_refined.json";

// Import helper types and functions
import {
  TimelineData as NewTimelineData,
  determinePhase,
  getPhaseTime,
  getTotalDuration,
  DurationCurve,
} from "../lib/timeline.types";

// Type alias for easier transition
type TimelineData = NewTimelineData;

interface MultiExperienceTimelineProps {
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

interface ActiveExperience {
  dose: DoseEntry;
  timeline: TimelineData;
  elapsedTimeHours: number;
  phase: "onset" | "peak" | "offset" | "after";
  color: string; // Color for this experience curve
  offsetFromEarliestHours: number; // When this dose was taken relative to the earliest dose
  doseTime: Date; // The actual timestamp when this dose was taken
}

export function MultiExperienceTimeline({
  className,
}: MultiExperienceTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { updateTrigger } = useDoseContext();

  // Set up intersection observer to detect when the component is in view
  const { ref: inViewRef, inView } = useInView({
    threshold: 0.1, // Trigger when at least 10% of the component is visible
    triggerOnce: false, // Keep observing for visibility changes
  });

  const [activeExperiences, setActiveExperiences] = useState<
    ActiveExperience[]
  >([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  function parseSubstanceNames(drugName: string): {
    mainName: string;
    alternativeNames: string[];
  } {
    // Default values
    let mainName = drugName;
    let alternativeNames: string[] = [];

    // Check if there are parentheses in the name
    const parenMatch = drugName.match(/^(.*?)\s*\((.*?)\)$/);

    if (parenMatch) {
      // Extract the main name (part before parentheses)
      mainName = parenMatch[1].trim();

      // Extract alternative names from inside parentheses
      const altNamesString = parenMatch[2];
      alternativeNames = altNamesString.split(", ").map((name) => name.trim());
    }

    return { mainName, alternativeNames };
  }
  // Helper function to find timeline data for a substance and route from articles_refined
  const findTimelineData = useCallback(
    (substance: string, route: string): TimelineData | null => {
      const normalizedSubstance = substance.toLowerCase().trim();
      const normalizedRoute = route.toLowerCase().trim();

      // Find the substance in articles_refined data with name matching
      const substanceData = articlesRefined.find((item) => {
        if (!item.drug_info?.drug_name) return false;

        const drugName = item.drug_info.drug_name;
        const { mainName, alternativeNames } = parseSubstanceNames(drugName);

        // Check if the entered substance matches main name or any alternative name (case-insensitive)
        if (mainName.toLowerCase() === normalizedSubstance) return true;
        return alternativeNames.some(
          (alt) => alt.toLowerCase() === normalizedSubstance,
        );
      });
      if (!substanceData || !substanceData.drug_info?.durations_parsed) {
        return null;
      }

      // Check if the specific route exists in the durations_parsed
      if (substanceData.drug_info.durations_parsed[normalizedRoute]) {
        const routeData =
          substanceData.drug_info.durations_parsed[normalizedRoute];

        // Extract timeline data from the new format
        return {
          drug: substanceData.drug_info.drug_name,
          method: normalizedRoute,
          duration_curve: {
            reference: routeData.duration_curve.reference || "Unknown",
            units: routeData.duration_curve.units || "hours",
            total_duration: routeData.duration_curve.total_duration || {
              min: 0,
              max: 0,
              iso: ["PT0H"],
            },
            onset: routeData.duration_curve.onset || {
              start: 0,
              end: 0,
              iso_start: ["PT0H"],
              iso_end: ["PT0H"],
            },
            peak: routeData.duration_curve.peak || {
              start: 0,
              end: 0,
              iso_start: ["PT0H"],
              iso_end: ["PT0H"],
            },
            offset: routeData.duration_curve.offset || {
              start: 0,
              end: 0,
              iso_start: ["PT0H"],
              iso_end: ["PT0H"],
            },
            after_effects: routeData.duration_curve.after_effects || {
              start: 0,
              end: 0,
              iso_start: ["PT0H"],
              iso_end: ["PT0H"],
            },
          },
        };
      }

      // If specific route not found, try to find any route for this substance as fallback
      const availableRoutes = Object.keys(
        substanceData.drug_info.durations_parsed,
      );
      if (availableRoutes.length > 0) {
        const firstRoute = availableRoutes[0];
        const routeData = substanceData.drug_info.durations_parsed[firstRoute];

        return {
          drug: substanceData.drug_info.drug_name,
          method: firstRoute,
          duration_curve: {
            reference: routeData.duration_curve.reference || "Unknown",
            units: routeData.duration_curve.units || "hours",
            total_duration: routeData.duration_curve.total_duration || {
              min: 0,
              max: 0,
              iso: ["PT0H"],
            },
            onset: routeData.duration_curve.onset || {
              start: 0,
              end: 0,
              iso_start: ["PT0H"],
              iso_end: ["PT0H"],
            },
            peak: routeData.duration_curve.peak || {
              start: 0,
              end: 0,
              iso_start: ["PT0H"],
              iso_end: ["PT0H"],
            },
            offset: routeData.duration_curve.offset || {
              start: 0,
              end: 0,
              iso_start: ["PT0H"],
              iso_end: ["PT0H"],
            },
            after_effects: routeData.duration_curve.after_effects || {
              start: 0,
              end: 0,
              iso_start: ["PT0H"],
              iso_end: ["PT0H"],
            },
          },
        };
      }

      return null;
    },
    [],
  );

  // Function to check for active experiences with new data format
  const checkForActiveExperiences = useCallback(async () => {
    try {
      // Get all doses
      const doses = await getAllDosesForStats();

      if (doses.length === 0) {
        setActiveExperiences([]);
        return;
      }

      // Create a fresh date object each time to ensure accurate timing
      const now = new Date();

      // Find all active doses with timeline data
      const activeDoses = doses
        .filter((dose) => {
          const doseTime = new Date(dose.timestamp);
          const timelineDrug = findTimelineData(dose.substance, dose.route);

          if (!timelineDrug) return false;

          // Calculate total duration in milliseconds using the after-effects end time
          const totalDurationHours =
            timelineDrug.duration_curve.after_effects.end;
          const totalDurationMs = totalDurationHours * 3600000;

          // Check if dose is within active timeframe
          return now.getTime() - doseTime.getTime() <= totalDurationMs;
        })
        // Sort by timestamp in ascending order (oldest first) - this is important for timeline rendering
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

      if (activeDoses.length === 0) {
        setActiveExperiences([]);
        return;
      }

      // Find earliest dose timestamp to use as the reference point
      const earliestDoseTime = new Date(activeDoses[0].timestamp);

      // Process all active doses
      const experiences = activeDoses
        .map((dose, index) => {
          const timelineDrug = findTimelineData(dose.substance, dose.route);

          if (!timelineDrug) return null; // Skip if no timeline data (should never happen due to filter above)

          // Calculate current progress
          const doseTime = new Date(dose.timestamp);
          const elapsedTimeHours =
            differenceInMilliseconds(now, doseTime) / 3600000; // convert to hours

          // Calculate offset from earliest dose in hours
          const offsetFromEarliestHours =
            differenceInMilliseconds(doseTime, earliestDoseTime) / 3600000;

          // Get the duration curve data
          const durationCurve = timelineDrug.duration_curve;

          // Determine which phase we're in using the helper function
          const currentPhase = determinePhase(elapsedTimeHours, durationCurve);

          // Map the phase to our component's format (we don't use "complete" phase in this component)
          let phase: "onset" | "peak" | "offset" | "after" = "onset";
          if (currentPhase === "onset") {
            phase = "onset";
          } else if (currentPhase === "peak") {
            phase = "peak";
          } else if (currentPhase === "offset") {
            phase = "offset";
          } else {
            phase = "after"; // Both "after" and "complete" phases map to "after" for display
          }

          // Get the Dutch fields color for this substance
          const isDarkMode =
            document.documentElement.classList.contains("dark");
          const substanceColor = getSubstanceColor(dose.substance, isDarkMode);

          return {
            dose,
            timeline: timelineDrug,
            elapsedTimeHours,
            phase,
            color: substanceColor,
            offsetFromEarliestHours, // Add this for relative positioning
            doseTime, // Include the actual dose time for reference
          };
        })
        .filter(Boolean) as ActiveExperience[];

      setActiveExperiences(experiences);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error checking for active experiences:", error);
    }
  }, [findTimelineData]);

  // Function to generate the intensity curve points with duration curve data
  const generateIntensityCurve = useCallback(
    (
      timeline: TimelineData,
      totalDurationHours: number,
      pointCount = 200,
    ): Point[] => {
      const points: Point[] = [];

      // Safeguard against invalid timeline data
      if (!timeline?.duration_curve) {
        console.warn(
          "Invalid timeline data in MultiExperienceTimeline:",
          timeline,
        );
        return [];
      }

      const durationCurve = timeline.duration_curve;

      // Safeguard: totalDurationHours must be positive
      if (totalDurationHours <= 0) {
        console.warn("Invalid total duration:", totalDurationHours);
        return [];
      }

      // Get phase boundaries with safeguards against undefined values
      const onsetStart = durationCurve.onset?.start || 0;
      const onsetEnd = durationCurve.onset?.end || 0;
      const peakStart = durationCurve.peak?.start || 0;
      const peakEnd = durationCurve.peak?.end || 0;
      const offsetStart = durationCurve.offset?.start || 0;
      const offsetEnd = durationCurve.offset?.end || 0;
      const afterStart = durationCurve.after_effects?.start || 0;
      const afterEffectsEnd = durationCurve.after_effects?.end || 0;

      // Use a cubic bezier function for smooth curves
      const cubicEaseIn = (t: number): number => {
        return t * t * t;
      };

      const cubicEaseOut = (t: number): number => {
        return 1 - Math.pow(1 - t, 3);
      };

      // Generate points along time axis with higher density
      for (let i = 0; i <= pointCount; i++) {
        const x = (i / pointCount) * totalDurationHours;
        let y = 0;

        try {
          // Calculate intensity based on where we are in the timeline
          if (x >= onsetStart && x <= onsetEnd) {
            // Onset phase: smooth rise using cubic easing
            const onsetDuration = Math.max(0.001, onsetEnd - onsetStart); // Safeguard against division by zero
            const onsetProgress = (x - onsetStart) / onsetDuration;
            // Use cubic easing for smoother onset curve
            y = cubicEaseIn(onsetProgress) * 50;
          } else if (x > onsetEnd && x < peakStart) {
            // Handle gap between onset and peak with a linear rise
            // Calculate the fraction of the way we are through the gap
            const gapDuration = Math.max(0.001, peakStart - onsetEnd); // Safeguard against division by zero
            const gapProgress = (x - onsetEnd) / gapDuration;

            // Linear progression from onset end (50) to just before peak (95)
            // This creates a straight line that rises continuously to the peak
            y = 50 + gapProgress * 45;
          } else if (x >= peakStart && x <= peakEnd) {
            // Peak phase: immediate jump to maximum intensity
            // No transition at all - instant rise to maximum at peak start
            y = 100;
          } else if (x > peakEnd && x < offsetStart) {
            // Handle gap between peak and offset with smooth interpolation
            const gapDuration = Math.max(0.001, offsetStart - peakEnd); // Safeguard against division by zero
            const gapProgress = (x - peakEnd) / gapDuration;
            // Smooth transition from peak end intensity (100) to offset start intensity (100)
            y = 100;
          } else if (x >= offsetStart && x <= offsetEnd) {
            // Offset phase: smooth ease down
            const offsetDuration = Math.max(0.001, offsetEnd - offsetStart); // Safeguard against division by zero
            const offsetProgress = (x - offsetStart) / offsetDuration;
            y = 100 - cubicEaseIn(offsetProgress) * 70;
          } else if (x > offsetEnd && x < afterStart) {
            // Handle gap between offset and after-effects with smooth interpolation
            const gapDuration = Math.max(0.001, afterStart - offsetEnd); // Safeguard against division by zero
            const gapProgress = (x - offsetEnd) / gapDuration;
            // Smooth transition from offset end intensity (30) to after-effects start intensity (30)
            y = 30;
          } else if (x >= afterStart && x <= afterEffectsEnd) {
            // After effects: straight line from 30 to 0
            const afterDuration = Math.max(0.001, afterEffectsEnd - afterStart); // Safeguard against division by zero
            const afterProgress = (x - afterStart) / afterDuration;
            y = 30 - afterProgress * 30;
          }
        } catch (error) {
          console.error("Error calculating intensity for point:", error);
          // Continue with default y=0 in error case
        }

        points.push({ x, y });
      }

      return points;
    },
    [],
  );

  // Draw the timeline curves
  const drawTimelineCurves = useCallback(() => {
    if (activeExperiences.length === 0 || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    // Get high-DPI canvas
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Only resize if dimensions have changed (prevents unnecessary clearing)
    if (
      canvas.width !== rect.width * dpr ||
      canvas.height !== rect.height * dpr
    ) {
      // Set canvas size accounting for device pixel ratio
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      // Scale context to device
      context.scale(dpr, dpr);

      // Set display size
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    } else {
      // Clear canvas without resetting whole context
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    const width = rect.width;
    const height = rect.height;
    const paddingX = 30;
    const paddingY = 30;
    const graphWidth = width - paddingX * 2;
    const graphHeight = height - paddingY * 2;

    // Canvas is already cleared above, no need for a second clear

    // Draw axes
    context.beginPath();
    context.strokeStyle = "#d4d4d8"; // Zinc-300
    context.lineWidth = 1;

    // X-axis
    context.moveTo(paddingX, height - paddingY);
    context.lineTo(width - paddingX, height - paddingY);

    // Y-axis
    context.moveTo(paddingX, height - paddingY);
    context.lineTo(paddingX, paddingY);
    context.stroke();

    // Draw labels
    context.fillStyle = "#71717a"; // Zinc-500

    // Calculate the earliest dose time and the latest end time
    const now = new Date();
    const earliestDoseTime = activeExperiences[0].doseTime; // First dose is already sorted to be earliest

    // Calculate the total timeline duration needed (from earliest dose to the end of the longest-lasting experience)
    const latestEndTime = Math.max(
      ...activeExperiences.map((exp) => {
        const totalExperienceDuration =
          exp.timeline.duration_curve.after_effects.end; // Use the end of after-effects as total duration
        return exp.offsetFromEarliestHours + totalExperienceDuration;
      }),
    );

    // This is our total timeline duration from earliest dose to latest effect end
    const totalTimelineDuration = latestEndTime;

    // X-axis labels (absolute time from earliest dose)
    context.font = "9px sans-serif";

    // Use 6 time markers for a cleaner look (start, 1/5, 2/5, 3/5, 4/5, end)
    const numberOfMarkers = 6;
    const startDate = new Date(earliestDoseTime);

    for (let i = 0; i < numberOfMarkers; i++) {
      // Calculate position and time for this marker
      const ratio = i / (numberOfMarkers - 1);
      const x = paddingX + ratio * graphWidth;

      // Calculate the time at this position (in milliseconds from the start)
      const timeOffsetMs = ratio * totalTimelineDuration * 3600000; // Convert hours to ms
      const dateAtMark = new Date(startDate.getTime() + timeOffsetMs);

      // Format time markers with special cases for first and last
      const hours = dateAtMark.getHours().toString().padStart(2, "0");
      const minutes = dateAtMark.getMinutes().toString().padStart(2, "0");

      let timeString;
      if (i === 0 || i === numberOfMarkers - 1) {
        // First and last markers show date and time
        const month = (dateAtMark.getMonth() + 1).toString().padStart(2, "0");
        const day = dateAtMark.getDate().toString().padStart(2, "0");
        timeString = `${month}/${day} ${hours}:${minutes}`;
      } else {
        // Middle markers only show time
        timeString = `${hours}:${minutes}`;
      }

      context.fillText(timeString, x - 12, height - paddingY + 12);
    }

    // Y-axis labels (intensity)
    context.font = "8px sans-serif";
    const intensityLabels = ["None", "Mild", "Moderate", "Strong", "Intense"];
    for (let i = 0; i < intensityLabels.length; i++) {
      const y =
        height - paddingY - (i / (intensityLabels.length - 1)) * graphHeight;
      context.fillText(intensityLabels[i], 2, y + 3);
    }

    // Draw the "now" line
    const nowOffsetHours =
      differenceInMilliseconds(now, earliestDoseTime) / 3600000;
    if (nowOffsetHours <= totalTimelineDuration) {
      const nowX =
        paddingX + (nowOffsetHours / totalTimelineDuration) * graphWidth;

      context.beginPath();
      context.strokeStyle = "rgba(100, 100, 100, 0.5)";
      context.setLineDash([3, 3]);
      context.lineWidth = 1;
      context.moveTo(nowX, paddingY);
      context.lineTo(nowX, height - paddingY);
      context.stroke();
      context.setLineDash([]);

      // Add "now" label
      context.fillStyle = "#71717a";
      context.fillText("Now", nowX - 8, paddingY - 4);
    }

    // Draw each experience curve with its own color
    activeExperiences.forEach((experience) => {
      const { timeline, elapsedTimeHours, color, offsetFromEarliestHours } =
        experience;

      const totalExperienceDuration = timeline.duration_curve.after_effects.end; // Use the end of after-effects as total duration

      // Generate curve points
      const points = generateIntensityCurve(timeline, totalExperienceDuration);

      // Draw main curve (onset, peak, offset) separately from after-effects

      // Draw main curve (onset through offset phases)
      context.beginPath();
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.setLineDash([]); // Solid line for main curve

      points.forEach((point, index) => {
        // Adjust x to account for the offset from the earliest dose
        const adjustedX = offsetFromEarliestHours + point.x;
        const x = paddingX + (adjustedX / totalTimelineDuration) * graphWidth;
        const y = height - paddingY - (point.y / 100) * graphHeight;

        // Only include points up to after-effects start
        if (point.x <= timeline.duration_curve.after_effects.start) {
          if (
            index === 0 ||
            (index > 0 &&
              points[index - 1].x <=
                timeline.duration_curve.after_effects.start)
          ) {
            if (index === 0) {
              context.moveTo(x, y);
            } else {
              context.lineTo(x, y);
            }
          }
        }
      });

      context.stroke();

      // Draw after-effects as a dotted line
      context.beginPath();
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.setLineDash([4, 3]); // Dotted line pattern

      // Find the first point for after-effects
      let isFirstAfterPoint = true;

      points.forEach((point, index) => {
        // Adjust x to account for the offset from the earliest dose
        const adjustedX = offsetFromEarliestHours + point.x;
        const x = paddingX + (adjustedX / totalTimelineDuration) * graphWidth;
        const y = height - paddingY - (point.y / 100) * graphHeight;

        // Only include after-effects points
        if (point.x >= timeline.duration_curve.after_effects.start) {
          if (isFirstAfterPoint) {
            isFirstAfterPoint = false;
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }
      });

      context.stroke();
      context.setLineDash([]); // Reset to solid line for other elements

      // Fill the area under the curve with semi-transparent color
      // We need to create a new fill path that connects all segments
      context.beginPath();

      // Start at the beginning of the curve
      const experienceStartX =
        paddingX +
        (offsetFromEarliestHours / totalTimelineDuration) * graphWidth;
      context.moveTo(experienceStartX, height - paddingY);

      // Add all points along the path
      points.forEach((point) => {
        const adjustedX = offsetFromEarliestHours + point.x;
        const x = paddingX + (adjustedX / totalTimelineDuration) * graphWidth;
        const y = height - paddingY - (point.y / 100) * graphHeight;
        context.lineTo(x, y);
      });

      // Close the path back to the x-axis
      const endX =
        paddingX +
        ((offsetFromEarliestHours + totalExperienceDuration) /
          totalTimelineDuration) *
          graphWidth;
      context.lineTo(endX, height - paddingY);
      context.closePath();

      // Extract RGB components from color (which is in rgba format)
      const rgbaMatch = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1], 10);
        const g = parseInt(rgbaMatch[2], 10);
        const b = parseInt(rgbaMatch[3], 10);
        context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`; // Use 15% opacity
      } else {
        context.fillStyle = `${color}25`; // Fallback - 25 is hex for 15% opacity
      }
      context.fill();

      // Draw the start marker for this substance
      // We already calculated experienceStartX above, reuse it
      context.beginPath();
      context.arc(experienceStartX, height - paddingY, 3, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();

      // Draw the current position on this substance's curve if it's active
      if (elapsedTimeHours <= totalExperienceDuration) {
        // Find the current position's x coordinate on the timeline
        const currentAdjustedX = offsetFromEarliestHours + elapsedTimeHours;
        const currentX =
          paddingX + (currentAdjustedX / totalTimelineDuration) * graphWidth;

        // Find the Y value for the current time by interpolating
        let currentY = height - paddingY; // Default to bottom

        // Find the points surrounding current time
        for (let i = 1; i < points.length; i++) {
          if (points[i].x >= elapsedTimeHours) {
            // Linear interpolation
            const prevPoint = points[i - 1];
            const nextPoint = points[i];
            const ratio =
              (elapsedTimeHours - prevPoint.x) / (nextPoint.x - prevPoint.x);
            const yValue = prevPoint.y + ratio * (nextPoint.y - prevPoint.y);
            currentY = height - paddingY - (yValue / 100) * graphHeight;
            break;
          }
        }

        // Draw position marker
        const isDarkMode = document.documentElement.classList.contains("dark");
        const markerColor = "#ffa300"; // Dutch fields bright orange for marker

        context.beginPath();
        context.arc(currentX, currentY, 5, 0, Math.PI * 2);
        context.fillStyle = markerColor;
        context.fill();
        context.strokeStyle = isDarkMode ? "rgba(0,0,0,0.5)" : "white";
        context.lineWidth = 1.5;
        context.stroke();
      }
    });
  }, [activeExperiences, generateIntensityCurve]);

  // Update the canvas when active experiences change
  useEffect(() => {
    drawTimelineCurves();
  }, [activeExperiences, drawTimelineCurves]);

  // Resize canvas when window size changes
  useEffect(() => {
    // Debounce function to prevent excessive redraws during resize
    let resizeTimeout: number | null = null;

    const handleResize = () => {
      // Clear any existing timeout
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }

      // Set a new timeout to debounce the resize handler
      resizeTimeout = window.setTimeout(() => {
        drawTimelineCurves();
      }, 100); // 100ms debounce
    };

    window.addEventListener("resize", handleResize);

    // Clean up event listener and any pending timeout
    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }
    };
  }, [drawTimelineCurves]);

  // Load active experiences when component mounts or data changes
  useEffect(() => {
    checkForActiveExperiences();
  }, [checkForActiveExperiences, updateTrigger]);

  // Update when the component comes into view
  useEffect(() => {
    if (inView) {
      console.log("Multiple timeline came into view, refreshing data");
      checkForActiveExperiences();
    }
  }, [inView, checkForActiveExperiences]);

  // If no active experience, don't render anything
  if (activeExperiences.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={className}
      ref={inViewRef} // Attach the intersection observer ref
    >
      <Card>
        <CardContent className="pt-4">
          {/* Legend for multiple substances */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs">
            {activeExperiences.map((exp, index) => (
              <div key={exp.dose.id} className="flex items-center">
                <div
                  className="w-2.5 h-2.5 rounded-full mr-1"
                  style={{
                    backgroundColor: exp.color,
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.05)",
                  }}
                ></div>
                <span className="font-medium">
                  {exp.dose.substance}
                  <span className="text-muted-foreground ml-1 font-normal text-[9px]">
                    {exp.dose.unit === "mg" && exp.dose.amount >= 1000
                      ? `${(exp.dose.amount / 1000).toFixed(1)}g`
                      : `${exp.dose.amount}${exp.dose.unit}`}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {/* Canvas for 2D graph */}
          <div className="relative w-full h-[180px] mt-1">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ width: "100%", height: "100%" }}
            />
          </div>

          {/* Display active phases in a compact table format */}
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-full overflow-hidden rounded-md border text-xs">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-1.5 pl-2 text-left font-medium">
                      Substance
                    </th>
                    <th className="p-1.5 text-center font-medium whitespace-nowrap">
                      Time ago
                    </th>
                    <th className="p-1.5 pr-2 text-right font-medium">Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {activeExperiences.map((exp, idx) => {
                    // Get time ago with custom abbreviated format
                    let timeAgo = formatDistance(
                      new Date(exp.doseTime),
                      new Date(),
                      { addSuffix: false },
                    );

                    // Abbreviate time units to save space
                    timeAgo = timeAgo
                      .replace("hours", "hrs")
                      .replace("hour", "hr")
                      .replace("minutes", "min")
                      .replace("minute", "min")
                      .replace("seconds", "sec")
                      .replace("second", "sec");

                    return (
                      <tr
                        key={exp.dose.id}
                        className={idx % 2 ? "bg-muted/20" : ""}
                      >
                        <td className="p-1.5 pl-2 flex items-center">
                          <div
                            className="w-2 h-2 rounded-full mr-1.5 flex-shrink-0"
                            style={{
                              backgroundColor: exp.color,
                              boxShadow: "0 0 0 1px rgba(0,0,0,0.05)",
                            }}
                          ></div>
                          <span className="font-medium whitespace-nowrap">
                            {exp.dose.substance}
                            <span className="text-muted-foreground ml-1 font-normal">
                              {exp.dose.unit === "mg" && exp.dose.amount >= 1000
                                ? `${(exp.dose.amount / 1000).toFixed(1)}g`
                                : `${exp.dose.amount}${exp.dose.unit}`}
                            </span>
                          </span>
                        </td>
                        <td className="p-1.5 text-center text-muted-foreground whitespace-nowrap">
                          {timeAgo}
                        </td>
                        <td className="p-1.5 pr-2 text-right">
                          <Badge
                            variant={
                              exp.phase === "onset"
                                ? "default"
                                : exp.phase === "peak"
                                  ? "destructive"
                                  : exp.phase === "offset"
                                    ? "secondary"
                                    : "outline"
                            }
                            className="text-[10px] font-normal whitespace-nowrap"
                          >
                            {exp.phase === "onset"
                              ? "Coming up"
                              : exp.phase === "peak"
                                ? "Peak"
                                : exp.phase === "offset"
                                  ? "Offset"
                                  : "After"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
