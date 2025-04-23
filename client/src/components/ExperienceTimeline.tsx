import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { getAllDosesForStats } from "../lib/db";
import { DoseEntry } from "../lib/constants";
import { format, formatDistance, differenceInMilliseconds } from "date-fns";
import { motion } from "framer-motion";
import { Activity, Clock, AlertCircle } from "lucide-react";
import { useDoseContext } from "../contexts/DoseContext";
import { useInView } from "react-intersection-observer";
import { getSubstanceColor, getContrastTextColor } from "../lib/color-utils";

// Import timeline data - new format with ISO durations
import durationCurvesData from "../lib/duration_curves.json";
import { 
  TimelineData as NewTimelineData, 
  determinePhase, 
  getPhaseTime, 
  getTotalDuration,
  DurationCurve
} from "../lib/timeline.types";

// For backward compatibility with old timeline data format
import oldTimelineData from "../lib/dose_tiers_with_timelines.json";

// Type alias for easier transition
type TimelineData = NewTimelineData;

interface OldTimelineData {
  drug: string;
  method: string;
  dose_ranges: string;
  onset: number;
  peak: number;
  offset: number;
}

interface ExperienceTimelineProps {
  className?: string;
  doseId?: number; // Optional specific dose ID to show
  standalone?: boolean; // Whether this is on the standalone page
}

interface Point {
  x: number;
  y: number;
}

export function ExperienceTimeline({
  className,
  doseId,
  standalone = false,
}: ExperienceTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { updateTrigger } = useDoseContext();

  // Set up intersection observer to detect when the component is in view
  const { ref: inViewRef, inView } = useInView({
    threshold: 0.1, // Trigger when at least 10% of the component is visible
    triggerOnce: false, // Keep observing for visibility changes
  });

  const [activeExperience, setActiveExperience] = useState<{
    dose: DoseEntry;
    timeline: TimelineData;
    elapsedTimeHours: number;
    phase: "onset" | "peak" | "offset" | "after";
    timeRemaining: string;
    elapsedTime: string;
    startTime: Date;
    currentTime: Date;
  } | null>(null);

  // Helper function to find timeline data for a substance and route
  const findTimelineData = useCallback(
    (substance: string, route: string): TimelineData | null => {
      const normalizedSubstance = substance.toLowerCase().trim();
      const normalizedRoute = route.toLowerCase().trim();

      // First look in the new duration curves data
      const exactMatch = durationCurvesData.find(
        (item) =>
          item.drug.toLowerCase() === normalizedSubstance &&
          item.method.toLowerCase() === normalizedRoute,
      );

      if (exactMatch) return exactMatch;

      // If no exact match, look for substance with any route
      const anyRouteMatch = durationCurvesData.find(
        (item) => item.drug.toLowerCase() === normalizedSubstance,
      );

      if (anyRouteMatch) return anyRouteMatch;

      // If not found in the new data, fallback to old data format
      console.log(`No curve data found for ${substance}/${route}. Falling back to basic data.`);
      
      // Check old timeline data
      const oldExactMatch = oldTimelineData.find(
        (item) =>
          item.drug.toLowerCase() === normalizedSubstance &&
          item.method.toLowerCase() === normalizedRoute,
      ) as OldTimelineData | undefined;

      if (oldExactMatch) {
        // Convert old format to new format
        return {
          drug: oldExactMatch.drug,
          method: oldExactMatch.method,
          duration_curve: {
            reference: "Legacy data",
            units: "hours",
            total_duration: {
              min: oldExactMatch.offset,
              max: oldExactMatch.offset * 1.33,
              iso: [`PT${oldExactMatch.offset}H`, `PT${Math.ceil(oldExactMatch.offset * 1.33)}H`]
            },
            onset: {
              start: 0,
              end: oldExactMatch.onset,
              iso_start: ["PT0H"],
              iso_end: [`PT${oldExactMatch.onset}H`]
            },
            peak: {
              start: oldExactMatch.onset,
              end: oldExactMatch.peak,
              iso_start: [`PT${oldExactMatch.onset}H`],
              iso_end: [`PT${oldExactMatch.peak}H`]
            },
            offset: {
              start: oldExactMatch.peak,
              end: oldExactMatch.offset,
              iso_start: [`PT${oldExactMatch.peak}H`],
              iso_end: [`PT${oldExactMatch.offset}H`]
            },
            after_effects: {
              start: oldExactMatch.offset,
              end: oldExactMatch.offset * 1.33,
              iso_start: [`PT${oldExactMatch.offset}H`],
              iso_end: [`PT${Math.ceil(oldExactMatch.offset * 1.33)}H`]
            }
          }
        };
      }

      // If no exact match in old data, look for substance with any route
      const oldAnyRouteMatch = oldTimelineData.find(
        (item) => item.drug.toLowerCase() === normalizedSubstance,
      ) as OldTimelineData | undefined;
      
      if (oldAnyRouteMatch) {
        // Convert old format to new format
        return {
          drug: oldAnyRouteMatch.drug,
          method: oldAnyRouteMatch.method,
          duration_curve: {
            reference: "Legacy data",
            units: "hours",
            total_duration: {
              min: oldAnyRouteMatch.offset,
              max: oldAnyRouteMatch.offset * 1.33,
              iso: [`PT${oldAnyRouteMatch.offset}H`, `PT${Math.ceil(oldAnyRouteMatch.offset * 1.33)}H`]
            },
            onset: {
              start: 0,
              end: oldAnyRouteMatch.onset,
              iso_start: ["PT0H"],
              iso_end: [`PT${oldAnyRouteMatch.onset}H`]
            },
            peak: {
              start: oldAnyRouteMatch.onset,
              end: oldAnyRouteMatch.peak,
              iso_start: [`PT${oldAnyRouteMatch.onset}H`],
              iso_end: [`PT${oldAnyRouteMatch.peak}H`]
            },
            offset: {
              start: oldAnyRouteMatch.peak,
              end: oldAnyRouteMatch.offset,
              iso_start: [`PT${oldAnyRouteMatch.peak}H`],
              iso_end: [`PT${oldAnyRouteMatch.offset}H`]
            },
            after_effects: {
              start: oldAnyRouteMatch.offset,
              end: oldAnyRouteMatch.offset * 1.33,
              iso_start: [`PT${oldAnyRouteMatch.offset}H`],
              iso_end: [`PT${Math.ceil(oldAnyRouteMatch.offset * 1.33)}H`]
            }
          }
        };
      }

      return null;
    },
    [],
  );

  // Function to check for active experiences
  const checkForActiveExperiences = useCallback(async () => {
    try {
      // Get all doses
      const doses = await getAllDosesForStats();

      if (doses.length === 0) {
        setActiveExperience(null);
        return;
      }

      // Create a fresh date object each time to ensure accurate timing
      const now = new Date();

      // If doseId is provided, only show that specific dose
      if (doseId) {
        const specificDose = doses.find((dose) => dose.id === doseId);

        if (!specificDose) {
          setActiveExperience(null);
          return;
        }

        const timelineDrug = findTimelineData(
          specificDose.substance,
          specificDose.route,
        );

        if (!timelineDrug) {
          setActiveExperience(null);
          return;
        }
        
        // Get the duration curve data
        const durationCurve = timelineDrug.duration_curve;
        
        // Calculate total duration in milliseconds (using max duration plus a grace period)
        const totalDurationHours = durationCurve.total_duration.max * 1.33;
        const totalDurationMs = totalDurationHours * 3600000;
        const doseTime = new Date(specificDose.timestamp);

        // Skip if not in active timeframe and not in standalone mode
        if (!standalone && now.getTime() - doseTime.getTime() > totalDurationMs) {
          setActiveExperience(null);
          return;
        }

        // Calculate current progress
        const elapsedTimeHours =
          differenceInMilliseconds(now, doseTime) / 3600000; // convert to hours

        // Determine which phase we're in
        const phase = determinePhase(elapsedTimeHours, durationCurve);
        let timeRemaining = "";
        
        // Calculate time remaining based on current phase
        if (phase === "onset") {
          timeRemaining = formatDistance(
            now,
            new Date(doseTime.getTime() + durationCurve.onset.end * 3600000),
            { addSuffix: false },
          );
        } else if (phase === "peak") {
          timeRemaining = formatDistance(
            now,
            new Date(doseTime.getTime() + durationCurve.peak.end * 3600000),
            { addSuffix: false },
          );
        } else if (phase === "offset") {
          timeRemaining = formatDistance(
            now,
            new Date(doseTime.getTime() + durationCurve.offset.end * 3600000),
            { addSuffix: false },
          );
        } else if (phase === "after") {
          timeRemaining = formatDistance(
            now,
            new Date(doseTime.getTime() + durationCurve.after_effects.end * 3600000),
            { addSuffix: false },
          );
        } else {
          timeRemaining = "complete";
        }

        setActiveExperience({
          dose: specificDose,
          timeline: timelineDrug,
          elapsedTimeHours,
          phase: phase === "complete" ? "after" : phase, // Map "complete" to "after" for component compatibility
          timeRemaining,
          elapsedTime: formatDistance(doseTime, now, { addSuffix: false }),
          startTime: doseTime,
          currentTime: now,
        });

        return;
      }

      // Normal behavior - find the most recent active dose
      const activeDoses = doses
        .filter((dose) => {
          const doseTime = new Date(dose.timestamp);
          const timelineDrug = findTimelineData(dose.substance, dose.route);

          if (!timelineDrug) return false;

          // Calculate total duration including grace period
          const totalDurationHours = timelineDrug.duration_curve.total_duration.max * 1.33;
          const totalDurationMs = totalDurationHours * 3600000;

          // Check if dose is within active timeframe
          return now.getTime() - doseTime.getTime() <= totalDurationMs;
        })
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

      if (activeDoses.length === 0) {
        setActiveExperience(null);
        return;
      }

      // Use the most recent active dose
      const mostRecentDose = activeDoses[0];
      const timelineDrug = findTimelineData(
        mostRecentDose.substance,
        mostRecentDose.route,
      );

      if (!timelineDrug) {
        setActiveExperience(null);
        return;
      }

      // Get the duration curve data
      const durationCurve = timelineDrug.duration_curve;
      
      // Calculate current progress
      const doseTime = new Date(mostRecentDose.timestamp);
      const elapsedTimeHours =
        differenceInMilliseconds(now, doseTime) / 3600000; // convert to hours

      // Determine which phase we're in
      const phase = determinePhase(elapsedTimeHours, durationCurve);
      let timeRemaining = "";
      
      // Calculate time remaining based on current phase
      if (phase === "onset") {
        timeRemaining = formatDistance(
          now,
          new Date(doseTime.getTime() + durationCurve.onset.end * 3600000),
          { addSuffix: false },
        );
      } else if (phase === "peak") {
        timeRemaining = formatDistance(
          now,
          new Date(doseTime.getTime() + durationCurve.peak.end * 3600000),
          { addSuffix: false },
        );
      } else if (phase === "offset") {
        timeRemaining = formatDistance(
          now,
          new Date(doseTime.getTime() + durationCurve.offset.end * 3600000),
          { addSuffix: false },
        );
      } else if (phase === "after") {
        timeRemaining = formatDistance(
          now,
          new Date(doseTime.getTime() + durationCurve.after_effects.end * 3600000),
          { addSuffix: false },
        );
      } else {
        timeRemaining = "complete";
      }

      setActiveExperience({
        dose: mostRecentDose,
        timeline: timelineDrug,
        elapsedTimeHours,
        phase: phase === "complete" ? "after" : phase, // Map "complete" to "after" for component compatibility
        timeRemaining,
        elapsedTime: formatDistance(doseTime, now, { addSuffix: false }),
        startTime: doseTime,
        currentTime: now,
      });
    } catch (error) {
      console.error("Error checking for active experiences:", error);
    }
  }, [doseId, findTimelineData, standalone]);

  // Function to generate the intensity curve points with new duration curve data
  const generateIntensityCurve = useCallback(
    (
      timeline: TimelineData,
      totalDurationHours: number,
      pointCount = 500, // Significantly increased point count for ultra-smooth curves
    ): Point[] => {
      const points: Point[] = [];
      const durationCurve = timeline.duration_curve;
      
      // Safeguard against invalid duration curves
      if (!durationCurve) {
        console.warn("Invalid duration curve data", timeline);
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
      
      // Safeguard: totalDurationHours must be positive
      if (totalDurationHours <= 0) {
        console.warn("Invalid total duration:", totalDurationHours);
        return [];
      }
      
      // Use a cubic bezier function for smooth curves
      const cubicEaseIn = (t: number): number => {
        return t * t * t;
      };
      
      const cubicEaseOut = (t: number): number => {
        return 1 - Math.pow(1 - t, 3);
      };
      
      // Add critical points at transition boundaries for exact rendering
      // Use small offsets for precision, but avoid extremely small values that might cause issues
      const epsilon = Math.max(0.001, totalDurationHours * 0.0001); // Adaptive epsilon based on duration
      const criticalPoints = [
        onsetStart, 
        onsetEnd, 
        Math.max(0, peakStart - epsilon), 
        peakStart, 
        peakStart + epsilon,
        peakEnd, 
        offsetStart, 
        offsetEnd, 
        afterStart, 
        afterEffectsEnd
      ];
      
      // First add evenly spaced points
      for (let i = 0; i <= pointCount; i++) {
        const x = (i / pointCount) * totalDurationHours;
        points.push({ x, y: 0 }); // Will calculate y values later
      }
      
      // Add exact boundary points for precision at transitions
      criticalPoints.forEach(x => {
        if (x >= 0 && x <= totalDurationHours && !isNaN(x)) {
          points.push({ x, y: 0 });
        }
      });
      
      // Sort points by x value and remove any duplicates
      points.sort((a, b) => a.x - b.x);
      
      // Remove duplicates (points within very small distance of each other)
      const deduplicatedPoints: Point[] = [];
      let lastX = -Infinity;
      
      for (const point of points) {
        if (point.x - lastX > epsilon / 10) {
          deduplicatedPoints.push(point);
          lastX = point.x;
        }
      }
      
      // Use the deduplicated points
      const finalPoints = deduplicatedPoints;
      
      // Calculate y values for each point
      for (let i = 0; i < finalPoints.length; i++) {
        const x = finalPoints[i].x;
        let y = 0;

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
          y = 50 + (gapProgress * 45);
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
          y = 30 - (afterProgress * 30);
        }
        
        // Set the y value for this point
        finalPoints[i].y = y;
      }

      return finalPoints;
    },
    [],
  );

  // Draw the timeline curve
  const drawTimelineCurve = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      points: Point[],
      width: number,
      height: number,
      elapsedHours: number,
      totalDurationHours: number,
    ) => {
      if (!activeExperience) return;

      const paddingX = 30;
      const paddingY = 30;
      const graphWidth = width - paddingX * 2;
      const graphHeight = height - paddingY * 2;

      ctx.clearRect(0, 0, width, height);

      // Draw axes
      ctx.beginPath();
      ctx.strokeStyle = "#d4d4d8"; // Zinc-300
      ctx.lineWidth = 1;

      // X-axis
      ctx.moveTo(paddingX, height - paddingY);
      ctx.lineTo(width - paddingX, height - paddingY);

      // Y-axis
      ctx.moveTo(paddingX, height - paddingY);
      ctx.lineTo(paddingX, paddingY);
      ctx.stroke();

      // Draw labels
      ctx.fillStyle = "#71717a"; // Zinc-500

      // X-axis labels (hours)
      ctx.font = "9px sans-serif";
      const hourMarks = Math.min(totalDurationHours, 12); // Max 12 hour marks
      for (let i = 0; i <= hourMarks; i++) {
        const hour = (i / hourMarks) * totalDurationHours;
        const x = paddingX + (i / hourMarks) * graphWidth;
        ctx.fillText(`${hour.toFixed(1)}h`, x - 10, height - paddingY + 12);
      }

      // Y-axis labels (intensity)
      ctx.font = "8px sans-serif";
      const intensityLabels = ["None", "Mild", "Moderate", "Strong", "Intense"];
      for (let i = 0; i < intensityLabels.length; i++) {
        const y =
          height - paddingY - (i / (intensityLabels.length - 1)) * graphHeight;
        ctx.fillText(intensityLabels[i], 2, y + 3);
      }

      // Draw phase markers with new duration curve data
      const durationCurve = activeExperience.timeline.duration_curve;
      const getXPosition = (hour: number) =>
        paddingX + (hour / totalDurationHours) * graphWidth;

      // Font for phase markers
      ctx.font = "9px sans-serif";

      // Onset line (start of onset phase)
      ctx.beginPath();
      ctx.strokeStyle = "#94a3b8"; // Slate-400
      ctx.setLineDash([4, 2]);
      const onsetStartX = getXPosition(durationCurve.onset.start);
      ctx.moveTo(onsetStartX, paddingY);
      ctx.lineTo(onsetStartX, height - paddingY);
      ctx.stroke();
      ctx.fillText("Onset", onsetStartX - 12, paddingY - 4);

      // Peak line (start of peak phase)
      ctx.beginPath();
      const peakStartX = getXPosition(durationCurve.peak.start);
      ctx.moveTo(peakStartX, paddingY);
      ctx.lineTo(peakStartX, height - paddingY);
      ctx.stroke();
      ctx.fillText("Peak", peakStartX - 10, paddingY - 4);

      // Offset line (start of offset phase)
      ctx.beginPath();
      const offsetStartX = getXPosition(durationCurve.offset.start);
      ctx.moveTo(offsetStartX, paddingY);
      ctx.lineTo(offsetStartX, height - paddingY);
      ctx.stroke();
      ctx.fillText("Offset", offsetStartX - 14, paddingY - 4);
      
      // After effects line (start of after-effects phase)
      ctx.beginPath();
      const afterEffectsStartX = getXPosition(durationCurve.after_effects.start);
      ctx.moveTo(afterEffectsStartX, paddingY);
      ctx.lineTo(afterEffectsStartX, height - paddingY);
      ctx.stroke();
      ctx.fillText("After", afterEffectsStartX - 12, paddingY - 4);

      ctx.setLineDash([]);

      // Use Dutch fields colors based on substance name
      const isDarkMode = document.documentElement.classList.contains("dark");
      const substanceColor = getSubstanceColor(activeExperience.dose.substance, isDarkMode);
      
      // Convert the rgba to a usable format for the curve
      const rgbaMatch = substanceColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
      let r = 139, g = 92, b = 246; // Default fallback
      
      if (rgbaMatch) {
        r = parseInt(rgbaMatch[1], 10);
        g = parseInt(rgbaMatch[2], 10);
        b = parseInt(rgbaMatch[3], 10);
      }
      
      // Draw main curve (onset, peak, offset) and after-effects separately
      
      // Draw main curve (onset through offset phases)
      ctx.beginPath();
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`; // Use the extracted RGB values
      ctx.lineWidth = 2;
      ctx.setLineDash([]); // Solid line for main curve
      
      points.forEach((point, index) => {
        const x = paddingX + (point.x / totalDurationHours) * graphWidth;
        const y = height - paddingY - (point.y / 100) * graphHeight;
        
        // Only include points up to after-effects start in this curve segment
        if (point.x <= durationCurve.after_effects.start) {
          if (index === 0 || (index > 0 && points[index-1].x <= durationCurve.after_effects.start)) {
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
      });
      
      ctx.stroke();
      
      // Draw after-effects as a dotted line
      ctx.beginPath();
      ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`; // Use the extracted RGB values
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]); // Dotted line pattern
      
      // Find the first point for after-effects 
      let isFirstAfterPoint = true;
      
      points.forEach((point, index) => {
        const x = paddingX + (point.x / totalDurationHours) * graphWidth;
        const y = height - paddingY - (point.y / 100) * graphHeight;
        
        // Only include after-effects points
        if (point.x >= durationCurve.after_effects.start) {
          if (isFirstAfterPoint) {
            isFirstAfterPoint = false;
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      
      ctx.stroke();
      ctx.setLineDash([]); // Reset to solid line for other elements

      // Fill the area under the curve
      // We need to create a fill path that connects both line segments
      ctx.beginPath();
      
      // Start at the beginning of the curve
      let firstPoint = points.find(p => p.x === 0);
      let firstX = paddingX;
      let firstY = height - paddingY;
      if (firstPoint) {
        firstY = height - paddingY - (firstPoint.y / 100) * graphHeight;
      }
      ctx.moveTo(firstX, firstY);
      
      // Add all points along the path
      points.forEach(point => {
        const x = paddingX + (point.x / totalDurationHours) * graphWidth;
        const y = height - paddingY - (point.y / 100) * graphHeight;
        ctx.lineTo(x, y);
      });
      
      // Close the path back to the x-axis
      ctx.lineTo(paddingX + graphWidth, height - paddingY);
      ctx.lineTo(paddingX, height - paddingY);
      ctx.closePath();
      
      // Fill with semi-transparent color
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`; // Match curve color with low opacity
      ctx.fill();

      // Draw the current time position
      if (elapsedHours <= totalDurationHours) {
        const currentX =
          paddingX + (elapsedHours / totalDurationHours) * graphWidth;

        // Find the Y value for the current time by interpolating
        let currentY = height - paddingY; // Default to bottom

        // Find the points surrounding current time
        for (let i = 1; i < points.length; i++) {
          if (points[i].x >= elapsedHours) {
            // Linear interpolation
            const prevPoint = points[i - 1];
            const nextPoint = points[i];
            const ratio =
              (elapsedHours - prevPoint.x) / (nextPoint.x - prevPoint.x);
            const yValue = prevPoint.y + ratio * (nextPoint.y - prevPoint.y);
            currentY = height - paddingY - (yValue / 100) * graphHeight;
            break;
          }
        }

        // Draw position marker using a contrasting color from Dutch palette
        // For the marker, use a color different from the curve color
        const markerColor = "#ffa300"; // Dutch fields bright orange
        
        ctx.beginPath();
        ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
        ctx.fillStyle = markerColor;
        ctx.fill();
        ctx.strokeStyle = isDarkMode ? "rgba(0,0,0,0.5)" : "white";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw vertical time indicator line
        ctx.beginPath();
        ctx.strokeStyle = markerColor;
        ctx.setLineDash([2, 2]);
        ctx.moveTo(currentX, paddingY);
        ctx.lineTo(currentX, height - paddingY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    [activeExperience],
  );

  // Update the canvas when active experience changes
  useEffect(() => {
    if (!activeExperience || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    // Get high-DPI canvas
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Only resize if dimensions have changed (prevents unnecessary clearing)
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
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

    const { timeline, elapsedTimeHours } = activeExperience;
    
    // Safeguard against missing or invalid timeline data
    if (!timeline?.duration_curve?.after_effects?.end) {
      console.warn("Invalid timeline data in ExperienceTimeline:", timeline);
      return;
    }
    
    const totalDurationHours = timeline.duration_curve.after_effects.end; // Use the end of after-effects as total duration

    // Generate curve points
    const points = generateIntensityCurve(timeline, totalDurationHours);

    // Draw the timeline
    drawTimelineCurve(
      context,
      points,
      rect.width,
      rect.height,
      elapsedTimeHours,
      totalDurationHours,
    );
  }, [activeExperience, drawTimelineCurve, generateIntensityCurve]);

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
        if (activeExperience && canvasRef.current) {
          const canvas = canvasRef.current;
          const context = canvas.getContext("2d");
          if (!context) return;
          
          // Get high-DPI canvas
          const dpr = window.devicePixelRatio || 1;
          const rect = canvas.getBoundingClientRect();
          
          // Only resize if dimensions have actually changed
          if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            // Set canvas size accounting for device pixel ratio
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            
            // Scale context to device
            context.scale(dpr, dpr);
            
            // Set display size
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            
            // Safeguard against missing timeline data
            if (!activeExperience.timeline?.duration_curve?.after_effects?.end) {
              console.warn("Invalid timeline data on resize:", activeExperience.timeline);
              return;
            }
            
            const { timeline, elapsedTimeHours } = activeExperience;
            const totalDurationHours = timeline.duration_curve.after_effects.end;
            
            try {
              // Generate curve points
              const points = generateIntensityCurve(timeline, totalDurationHours);
              
              // Draw the timeline
              drawTimelineCurve(
                context,
                points,
                rect.width,
                rect.height,
                elapsedTimeHours,
                totalDurationHours,
              );
            } catch (error) {
              console.error("Error redrawing timeline on resize:", error);
            }
          }
        }
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
  }, [activeExperience, drawTimelineCurve, generateIntensityCurve]);

  // Load active experiences when component mounts or data changes
  useEffect(() => {
    checkForActiveExperiences();
  }, [checkForActiveExperiences, updateTrigger]);

  // Update when the component comes into view
  useEffect(() => {
    if (inView) {
      console.log("Timeline came into view, refreshing data");
      checkForActiveExperiences();
    }
  }, [inView, checkForActiveExperiences]);

  // If no active experience, don't render anything
  if (!activeExperience) return null;

  const { dose, phase, timeRemaining, elapsedTime } = activeExperience;

  const getPhaseBadgeVariant = () => {
    switch (phase) {
      case "onset":
        return "outline";
      case "peak":
        return "default";
      case "offset":
        return "secondary";
      case "after":
        return "destructive";
      default:
        return "outline";
    }
  };

  // Get the Dutch color for this substance
  const isDarkMode = document.documentElement.classList.contains("dark");
  const substanceColor = getSubstanceColor(dose.substance, isDarkMode);
  const textColor = getContrastTextColor(substanceColor);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={className}
      ref={inViewRef} // Attach the intersection observer ref
    >
      <Card>
        <CardHeader 
          className="rounded-t-lg px-3 py-1.5 flex flex-row items-center" 
          style={{ 
            backgroundColor: substanceColor,
            color: textColor
          }}
        >
          <CardTitle className="flex-1 text-md flex items-center text-base">
            <span style={{ color: textColor }}>{dose.substance}</span>
            <span className="text-xs font-normal ml-2" style={{ color: `${textColor}99` }}>
              {dose.amount}{dose.unit} {dose.route}
            </span>
            <Badge variant={getPhaseBadgeVariant()} className="ml-auto text-[10px] py-0 px-2">
              {phase === "onset"
                ? "Coming up"
                : phase === "peak"
                  ? "Peak"
                  : phase === "offset"
                    ? "Offset"
                    : "After"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center">
              <Clock className="h-3 w-3 mr-1" />
              <span className="text-xs">
                Started: {format(new Date(dose.timestamp), "h:mm a")}
              </span>
            </div>
            <div className="text-sm flex items-center ml-auto">
              <span className="text-right mr-1">
                {phase === "after" ? "Complete" : timeRemaining}
              </span>
              <Activity className="h-3.5 w-3.5" />
            </div>
          </div>

          <div className="text-xs text-muted-foreground mb-3 flex justify-between">
            <span>
              Duration:{" "}
              {formatDistance(new Date(dose.timestamp), new Date(), {
                addSuffix: false,
              })}{" "}
              elapsed
            </span>
            <span className="text-right text-xs text-muted-foreground">
              {phase === "onset"
                ? "Onset phase"
                : phase === "peak"
                  ? "Peak phase"
                  : phase === "offset"
                    ? "Offset phase"
                    : "After effects"}
            </span>
          </div>

          {/* Canvas for 2D graph */}
          <div className="relative w-full h-[180px] mt-1">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
