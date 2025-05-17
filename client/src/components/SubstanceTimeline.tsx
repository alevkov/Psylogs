import React, { useEffect, useRef } from "react";
import {
  parseIsoDuration,
  PhaseDuration,
  DurationCurve,
} from "../lib/timeline.types";
import { getSubstanceColor } from "../lib/color-utils";
import { useTheme } from "../hooks/use-theme";

interface SubstanceTimelineProps {
  substance: string;
  route: string;
  durationCurve: DurationCurve;
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

export function SubstanceTimeline({
  substance,
  route,
  durationCurve,
  className,
}: SubstanceTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const substanceColor = getSubstanceColor(substance);
  const { theme } = useTheme();

  // Convert ISO durations to hours if needed
  const convertISOToHours = (
    phase: PhaseDuration,
    useStart: boolean = true,
  ): number => {
    if (useStart) {
      // Use the numerical value if available
      if (typeof phase.start === "number") return phase.start;

      // Otherwise parse from ISO string
      if (phase.iso_start && phase.iso_start.length > 0) {
        return parseIsoDuration(phase.iso_start[0]);
      }
    } else {
      if (typeof phase.end === "number") return phase.end;

      if (phase.iso_end && phase.iso_end.length > 0) {
        return parseIsoDuration(phase.iso_end[0]);
      }
    }
    return 0; // Fallback
  };

  // Format hours as XhrYm for display
  const formatHoursToHrMin = (hours: number): string => {
    // Split into hours and minutes
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);

    // Handle case where minutes round up to 60
    let adjustedHours = wholeHours;
    let adjustedMinutes = minutes;
    if (minutes === 60) {
      adjustedHours += 1;
      adjustedMinutes = 0;
    }

    // Format based on values
    if (adjustedHours === 0) {
      return `${adjustedMinutes}m`;
    } else if (adjustedMinutes === 0) {
      return `${adjustedHours}hr`;
    } else {
      return `${adjustedHours}hr${adjustedMinutes}m`;
    }
  };

  interface Point {
    x: number;
    y: number;
  }

  const drawDottedLine = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    dotSize: number = 3,
    spacing: number = 8,
    color: string,
  ) => {
    ctx.fillStyle = color;

    // Calculate total curve length to ensure even spacing
    let totalLength = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      totalLength += Math.sqrt(dx * dx + dy * dy);
    }

    // Number of dots to draw along the curve
    const numDots = Math.floor(totalLength / spacing);

    if (numDots <= 0) return; // Safety check

    // Distance increment between dots
    const increment = totalLength / numDots;

    // Draw dots at evenly spaced intervals
    let currentDist = 0;
    let currentIndex = 0;
    let remainingDist = 0;

    // Calculate position of each segment
    for (let i = 0; i < numDots; i++) {
      const targetDist = i * increment;

      // Move along segments until we find the right position
      while (
        currentDist + remainingDist < targetDist &&
        currentIndex < points.length - 1
      ) {
        currentIndex++;
        const dx = points[currentIndex].x - points[currentIndex - 1].x;
        const dy = points[currentIndex].y - points[currentIndex - 1].y;
        remainingDist = Math.sqrt(dx * dx + dy * dy);
        currentDist += remainingDist;
      }

      // We're between currentIndex-1 and currentIndex
      if (currentIndex > 0 && currentIndex < points.length) {
        const segmentDist = targetDist - (currentDist - remainingDist);
        const segmentRatio = segmentDist / remainingDist;

        // Interpolate position
        const p1 = points[currentIndex - 1];
        const p2 = points[currentIndex];
        const x = p1.x + (p2.x - p1.x) * segmentRatio;
        const y = p1.y + (p2.y - p1.y) * segmentRatio;

        // Draw dot
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  useEffect(() => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Now the canvas background is handled with CSS directly on the canvas element
      // So we don't need to draw a background rectangle here

      // Get time boundaries first
      const onsetStart = convertISOToHours(durationCurve.onset, true);
      const onsetEnd = convertISOToHours(durationCurve.onset, false);
      const peakStart = convertISOToHours(durationCurve.peak, true);
      const peakEnd = convertISOToHours(durationCurve.peak, false);
      const offsetStart = convertISOToHours(durationCurve.offset, true);
      const offsetEnd = convertISOToHours(durationCurve.offset, false);
      const afterStart = convertISOToHours(durationCurve.after_effects, true);
      const afterEnd = convertISOToHours(durationCurve.after_effects, false);

      // Calculate total width in hours for the timeline (from onset to end)
      let totalDurationHours = convertISOToHours(
        durationCurve.after_effects,
        false,
      );
      if (totalDurationHours === 0) {
        totalDurationHours = convertISOToHours(durationCurve.offset, false);
      }
      if (totalDurationHours === 0) {
        totalDurationHours = durationCurve.total_duration.max || 12;
      }

      // Adjust the total duration to be relative to onset start
      // since we're now starting visualization from there
      const visualizationStartTime = onsetStart;
      totalDurationHours = totalDurationHours - visualizationStartTime;

      // Helper function to adjust all times to be relative to onsetStart
      const adjustTime = (time: number) =>
        Math.max(0, time - visualizationStartTime);

      // Vibrant colors for each phase - slightly modified for better visual appeal
      const onsetColor = "#3b82f6"; // Blue
      const peakColor = "#ec4899"; // Pink
      const offsetColor = "#8b5cf6"; // Purple
      const afterColor = "#06b6d4"; // Cyan

      // Canvas dimensions
      const width = canvas.width;
      const height = canvas.height;
      const padding = 25; // Increased padding for more space around edges
      const usableWidth = width - 2 * padding;
      const usableHeight = height - (padding + 60); // More room at bottom for larger labels
      const timeAxisY = height - 50; // Fixed position for time axis, increased for larger labels

      // Draw subtle background regions - use adjusted times for proper rendering
      const phases = [
        {
          start: adjustTime(onsetStart),
          end: adjustTime(onsetEnd),
          color: onsetColor,
          name: "Onset",
        },
        {
          start: adjustTime(peakStart),
          end: adjustTime(peakEnd),
          color: peakColor,
          name: "Peak",
        },
        {
          start: adjustTime(offsetStart),
          end: adjustTime(offsetEnd),
          color: offsetColor,
          name: "Offset",
        },
        {
          start: adjustTime(afterStart),
          end: adjustTime(afterEnd),
          color: afterColor,
          name: "After-effects",
        },
      ];

      // Define a consistent time scaling function used throughout the component
      // Using a less dramatic logarithmic scale by blending with linear scaling
      const createTimeScale = () => {
        const minTime = 0.0001; // Small non-zero value for log scaling
        const logBase = 2; // Lower base = less dramatic stretching (was 10)
        const logMin = Math.log(minTime) / Math.log(logBase);
        const logMax =
          Math.log(totalDurationHours + minTime) / Math.log(logBase);

        // Return the actual scaling function with some linear component
        return (timeHours: number): number => {
          // Pure logarithmic scaling
          const logVal =
            Math.log(Math.max(timeHours, minTime)) / Math.log(logBase);
          const logScale = (logVal - logMin) / (logMax - logMin);

          // Linear scaling
          const linearScale = timeHours / totalDurationHours;

          // Blend log and linear (70% log, 30% linear) for more balanced scaling
          return logScale * 0.2 + linearScale * 0.8;
        };
      };

      // Create the scaling function once
      const timeScale = createTimeScale();

      // Draw subtle grid lines with theme-appropriate colors
      if (theme === 'dark') {
        ctx.strokeStyle = "#374151"; // Dark mode grid - darker gray
      } else {
        ctx.strokeStyle = "#e2e8f0"; // Light mode grid - light gray
      }
      ctx.lineWidth = 0.5;

      // Vertical grid lines
      const numVerticalGridLines = 10;
      for (let i = 0; i <= numVerticalGridLines; i++) {
        const x = padding + (i / numVerticalGridLines) * usableWidth;
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, timeAxisY);
        ctx.stroke();
      }

      // Horizontal grid lines
      const numHorizontalGridLines = 5;
      for (let i = 0; i <= numHorizontalGridLines; i++) {
        const y = padding + (i / numHorizontalGridLines) * usableHeight;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
      }

      // Draw phase regions with rounded corners
      phases.forEach((phase) => {
        if (phase.start >= 0 && phase.end > phase.start) {
          // Use our blended log/linear time scale for x-coordinates
          const scaledStart = timeScale(phase.start);
          const scaledEnd = timeScale(phase.end);

          const xStart = padding + scaledStart * usableWidth;
          const xEnd = padding + scaledEnd * usableWidth;
          const width = xEnd - xStart;

          // Draw background with rounded corners
          const cornerRadius = 5;
          ctx.fillStyle = `${phase.color}20`;

          ctx.beginPath();
          ctx.moveTo(xStart + cornerRadius, padding);
          ctx.lineTo(xEnd - cornerRadius, padding);
          ctx.quadraticCurveTo(xEnd, padding, xEnd, padding + cornerRadius);
          ctx.lineTo(xEnd, timeAxisY - cornerRadius);
          ctx.quadraticCurveTo(xEnd, timeAxisY, xEnd - cornerRadius, timeAxisY);
          ctx.lineTo(xStart + cornerRadius, timeAxisY);
          ctx.quadraticCurveTo(
            xStart,
            timeAxisY,
            xStart,
            timeAxisY - cornerRadius,
          );
          ctx.lineTo(xStart, padding + cornerRadius);
          ctx.quadraticCurveTo(xStart, padding, xStart + cornerRadius, padding);
          ctx.closePath();
          ctx.fill();

          // Draw phase label with shadow for better readability
          ctx.save();
          ctx.translate(xStart + width / 2, padding + 20);
          ctx.fillStyle = phase.color;
          ctx.font = "bold 20px Inter, system-ui, sans-serif"; // Increased from 18px to 20px and using modern font
          ctx.textAlign = "center";

          // Add subtle shadow to text
          ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
          ctx.shadowBlur = 3;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;

          ctx.fillText(phase.name, 0, 0);
          ctx.restore();
        }
      });

      // Draw time axis with shadow for depth
      ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      ctx.beginPath();
      // Different axis color based on theme
      ctx.strokeStyle = theme === 'dark' ? "#94a3b880" : "#94a3b8"; // Medium gray-blue (with transparency for dark mode)
      ctx.lineWidth = 2;
      ctx.moveTo(padding, timeAxisY);
      ctx.lineTo(width - padding, timeAxisY);
      ctx.stroke();

      // Reset shadow
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Using the timeScale function defined above

      // Draw phase time markers with our balanced time scale
      ctx.textAlign = "center";
      ctx.font = "bold 16px Inter, system-ui, sans-serif"; // Using modern font and bold
      // Set text color based on theme
      ctx.fillStyle = theme === 'dark' ? "#e2e8f0" : "#64748b"; // Lighter color for dark mode

      // Define phase markers to show on the time axis - using adjusted times
      const phaseMarkers = [
        // Starting with onset point (which is now at time 0 with our adjustment)
        { time: adjustTime(onsetStart), label: "Onset", color: onsetColor },
        {
          time: adjustTime(onsetEnd),
          label: formatHoursToHrMin(onsetEnd - onsetStart), // Format as hr/min
          color: onsetColor,
        },
        { time: adjustTime(peakStart), label: "Peak", color: peakColor },
        {
          time: adjustTime(peakEnd),
          label: formatHoursToHrMin(peakEnd - onsetStart), // Format as hr/min
          color: peakColor,
        },
        { time: adjustTime(offsetStart), label: "Offset", color: offsetColor },
        {
          time: adjustTime(offsetEnd),
          label: formatHoursToHrMin(offsetEnd - onsetStart), // Format as hr/min
          color: offsetColor,
        },
        { time: adjustTime(afterStart), label: "After", color: afterColor },
        {
          time: adjustTime(afterEnd),
          label: formatHoursToHrMin(afterEnd - onsetStart), // Format as hr/min
          color: afterColor,
        },
        {
          time: totalDurationHours,
          label: formatHoursToHrMin(totalDurationHours), // Format as hr/min
          color: theme === 'dark' ? "#e2e8f0" : "#64748b", // Lighter color for dark mode
        },
      ];

      // Filter out redundant markers (same time or too close)
      const minDistancePx = 60; // Minimum distance in pixels between markers (increased for better spacing)
      const filteredMarkers = phaseMarkers.filter((marker, index, array) => {
        if (index === 0) return true;

        // Check if this time point is different from the previous one
        if (marker.time === array[index - 1].time) return false;

        // Check if this marker is too close to the previous one in display space
        const prevScaledPos = timeScale(array[index - 1].time);
        const currScaledPos = timeScale(marker.time);
        const prevX = padding + prevScaledPos * usableWidth;
        const currX = padding + currScaledPos * usableWidth;

        return Math.abs(currX - prevX) >= minDistancePx;
      });

      // Draw each marker with our time scaling
      filteredMarkers.forEach((marker) => {
        if (marker.time <= totalDurationHours) {
          const scaledPos = timeScale(marker.time);
          const x = padding + scaledPos * usableWidth;

          ctx.beginPath();
          ctx.strokeStyle = marker.color;
          ctx.lineWidth = 2;
          ctx.moveTo(x, timeAxisY);
          ctx.lineTo(x, timeAxisY + 12); // Increased tick length for better visibility
          ctx.stroke();

          // Draw time label with subtle shadow
          ctx.save();
          ctx.fillStyle = marker.color;
          ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
          ctx.shadowBlur = 2;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          ctx.fillText(marker.label, x, timeAxisY + 35); // Increased offset for better spacing
          ctx.restore();
        }
      });

      // Generate curve points with pure linear interpolation
      const generateLinearCurve = (): Point[] => {
        const points: Point[] = [];
        const resolution = 500;

        // Define key points to create a more accurate profile:
        // - Onset is a steady climb from zero to peak level
        // - Peak is a flat plateau at max intensity
        // - Offset is a gradual decline
        // - After-effects are a low-level trailing off

        // First, determine if phases have gaps between them
        const hasGapBetweenOnsetAndPeak = peakStart > onsetEnd;
        const hasGapBetweenPeakAndOffset = offsetStart > peakEnd;
        const hasGapBetweenOffsetAndAfter = afterStart > offsetEnd;

        // Now create key points with the right intensity values and account for gaps
        // Using the adjustTime function defined above

        const keyPoints: Array<{ time: number; intensity: number }> = [
          // Note: Start time is now onsetStart (removed previous zero point)

          // Onset phase - gradually rising
          { time: adjustTime(onsetStart), intensity: 0 }, // Begin onset at zero
          { time: adjustTime(onsetEnd), intensity: 1.0 }, // End onset at full intensity

          // If there's a gap between onset and peak, add intermediate points
          ...(hasGapBetweenOnsetAndPeak
            ? [
                { time: adjustTime(onsetEnd), intensity: 1.0 }, // Maintain high intensity after onset
                { time: adjustTime(peakStart), intensity: 1.0 }, // Maintain before peak
              ]
            : []),

          // Peak phase - flat plateau at max intensity
          { time: adjustTime(peakStart), intensity: 1.0 }, // Begin peak at full intensity
          { time: adjustTime(peakEnd), intensity: 1.0 }, // End peak still at full intensity

          // If there's a gap between peak and offset, add intermediate points
          ...(hasGapBetweenPeakAndOffset
            ? [
                { time: adjustTime(peakEnd), intensity: 1.0 }, // Maintain after peak
                { time: adjustTime(offsetStart), intensity: 1.0 }, // Maintain before offset starts
              ]
            : []),

          // Offset phase - declining from peak to low
          { time: adjustTime(offsetStart), intensity: 1.0 }, // Begin offset at full intensity
          { time: adjustTime(offsetEnd), intensity: 0.2 }, // End offset at low intensity

          // If there's a gap between offset and after-effects, add intermediate points
          ...(hasGapBetweenOffsetAndAfter
            ? [
                { time: adjustTime(offsetEnd), intensity: 0.2 }, // Maintain after offset
                { time: adjustTime(afterStart), intensity: 0.2 }, // Maintain before after-effects
              ]
            : []),

          // After-effects phase - fading to zero
          { time: adjustTime(afterStart), intensity: 0.2 }, // Begin after-effects at low intensity
          { time: adjustTime(afterEnd), intensity: 0 }, // End after-effects at zero

          // Ensure we extend to the end of the timeline
          {
            time: adjustTime(totalDurationHours + visualizationStartTime),
            intensity: 0,
          }, // Final point
        ];

        // Sort by time to ensure proper order
        keyPoints.sort((a, b) => a.time - b.time);

        // Remove duplicate time points that could cause discontinuities
        const uniqueKeyPoints = keyPoints.filter(
          (point, index, self) =>
            index === 0 || point.time !== self[index - 1].time,
        );

        // Use the timeScale function created earlier
        // No need to redefine it here

        // Generate more points in the early time regions for better detail
        for (let i = 0; i < resolution; i++) {
          // Use non-linear distribution to sample more points in early time regions
          // This creates more points for shorter phases
          const t = i / resolution;

          // Apply non-linear transformation to create more samples in early time regions
          // This is different from the display scaling - it just affects sampling density
          const samplingBias = 2.5; // Higher values create more early samples
          const timePosition = Math.pow(t, samplingBias);
          const timeHours = timePosition * totalDurationHours;

          // Find the surrounding key points for linear interpolation
          let leftPoint = uniqueKeyPoints[0];
          let rightPoint = uniqueKeyPoints[uniqueKeyPoints.length - 1];

          for (let j = 0; j < uniqueKeyPoints.length - 1; j++) {
            if (
              timeHours >= uniqueKeyPoints[j].time &&
              timeHours <= uniqueKeyPoints[j + 1].time
            ) {
              leftPoint = uniqueKeyPoints[j];
              rightPoint = uniqueKeyPoints[j + 1];
              break;
            }
          }

          // Pure linear interpolation of intensity
          let intensity = 0;
          if (rightPoint.time - leftPoint.time > 0) {
            const progress =
              (timeHours - leftPoint.time) / (rightPoint.time - leftPoint.time);
            intensity =
              leftPoint.intensity +
              (rightPoint.intensity - leftPoint.intensity) * progress;
          } else {
            intensity = leftPoint.intensity;
          }

          // Convert real time to scaled x-position for display
          const scaledPos = timeScale(timeHours);
          const x = padding + scaledPos * usableWidth;
          const y = padding + (1 - intensity) * usableHeight;

          points.push({ x, y });
        }

        return points;
      };

      // For storing points where after-effects section begins (to draw dotted line)
      let afterEffectsStartPoint: Point | null = null;
      let curvePoints = generateLinearCurve();

      // Find the point where after-effects start
      const afterEffectsScaledPos = timeScale(adjustTime(afterStart));
      const afterEffectsX = padding + afterEffectsScaledPos * usableWidth;

      // Find the closest point to the after-effects start time
      let minDistance = Infinity;
      let afterEffectsIndex = 0;

      for (let i = 0; i < curvePoints.length; i++) {
        const distance = Math.abs(curvePoints[i].x - afterEffectsX);
        if (distance < minDistance) {
          minDistance = distance;
          afterEffectsIndex = i;
        }
      }

      // Split curve points for normal and dotted segments
      const mainCurvePoints = curvePoints.slice(0, afterEffectsIndex + 1);
      const afterEffectsCurvePoints = curvePoints.slice(afterEffectsIndex);
      afterEffectsStartPoint = afterEffectsCurvePoints[0];

      // Draw intensity curve with smooth gradient and shadow for depth
      try {
        // Add shadow for the curve line
        ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 2;

        // Create gradient for the curve line
        const curveGradient = ctx.createLinearGradient(
          padding,
          0,
          width - padding,
          0,
        );
        curveGradient.addColorStop(0, onsetColor);
        curveGradient.addColorStop(0.3, peakColor);
        curveGradient.addColorStop(0.7, offsetColor);
        curveGradient.addColorStop(1, afterColor);

        // Draw main curve (solid line)
        ctx.beginPath();
        ctx.moveTo(mainCurvePoints[0].x, mainCurvePoints[0].y);

        // Simple linear path between all points
        for (let i = 1; i < mainCurvePoints.length; i++) {
          ctx.lineTo(mainCurvePoints[i].x, mainCurvePoints[i].y);
        }

        // Style and draw the main curve
        ctx.strokeStyle = curveGradient;
        ctx.lineWidth = 6; // Increased line width for better visibility
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        // Reset shadow for dotted line
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Draw after-effects section as dotted line
        if (afterEffectsCurvePoints.length > 1) {
          // Use the fixed dotted line drawing function
          drawDottedLine(
            ctx,
            afterEffectsCurvePoints,
            3.5, // Dot size
            12, // Dot spacing
            afterColor,
          );
        }
        // Reset shadow for fill
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Fill under the curve
        ctx.beginPath();
        ctx.moveTo(curvePoints[0].x, curvePoints[0].y);

        // Draw the whole curve again for fill
        for (let i = 1; i < curvePoints.length; i++) {
          ctx.lineTo(curvePoints[i].x, curvePoints[i].y);
        }

        ctx.lineTo(curvePoints[curvePoints.length - 1].x, timeAxisY);
        ctx.lineTo(curvePoints[0].x, timeAxisY);
        ctx.closePath();

        // Create fill gradient with theme-appropriate opacity
        const fillGradient = ctx.createLinearGradient(
          padding,
          0,
          width - padding,
          0,
        );
        
        // Higher opacity for dark mode to make the curve more visible
        const opacity = theme === 'dark' ? '40' : '30';
        const afterOpacity = theme === 'dark' ? '30' : '20';
        
        fillGradient.addColorStop(0, `${onsetColor}${opacity}`);
        fillGradient.addColorStop(0.3, `${peakColor}${opacity}`);
        fillGradient.addColorStop(0.7, `${offsetColor}${opacity}`);
        fillGradient.addColorStop(1, `${afterColor}${afterOpacity}`); // Lighter for after-effects

        ctx.fillStyle = fillGradient;
        ctx.fill();

        // Add some key points on the curve for visual emphasis
        [0, 0.3, 0.6, 0.9].forEach((t) => {
          const index = Math.floor(t * curvePoints.length);
          if (index < curvePoints.length) {
            const point = curvePoints[index];

            // Draw point with shadow
            ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;

            ctx.beginPath();
            const gradientPos = index / curvePoints.length;
            let pointColor;

            if (gradientPos < 0.3) pointColor = onsetColor;
            else if (gradientPos < 0.6) pointColor = peakColor;
            else if (gradientPos < 0.8) pointColor = offsetColor;
            else pointColor = afterColor;

            ctx.fillStyle = pointColor;
            ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      } catch (error) {
        // Simple fallback if gradients fail
        console.warn("Gradient error:", error);

        ctx.beginPath();
        ctx.moveTo(curvePoints[0].x, curvePoints[0].y);

        for (let i = 1; i < curvePoints.length; i++) {
          ctx.lineTo(curvePoints[i].x, curvePoints[i].y);
        }

        // Use onset color as fallback if gradient fails
        ctx.strokeStyle = onsetColor;
        ctx.lineWidth = 5;
        ctx.stroke();

        ctx.lineTo(curvePoints[curvePoints.length - 1].x, timeAxisY);
        ctx.lineTo(curvePoints[0].x, timeAxisY);
        ctx.closePath();
        ctx.fillStyle = `${onsetColor}40`;
        ctx.fill();
      }

      // // Draw a legend for the phases
      // const legendX = padding;
      // const legendY = padding / 2;
      // const legendItemWidth = 120;
      // const legendItemHeight = 20;

      // const legendItems = [
      //   { color: onsetColor, label: "Onset" },
      //   { color: peakColor, label: "Peak" },
      //   { color: offsetColor, label: "Offset" },
      //   { color: afterColor, label: "After-effects" },
      // ];

      // legendItems.forEach((item, index) => {
      //   const x = legendX + index * legendItemWidth;

      //   // Draw colored box
      //   ctx.fillStyle = item.color;
      //   ctx.fillRect(x, legendY, 12, 12);

      //   // Draw label
      //   ctx.fillStyle = "#334155"; // Slate-700
      //   ctx.font = "14px Inter, system-ui, sans-serif";
      //   ctx.textAlign = "left";
      //   ctx.fillText(item.label, x + 18, legendY + 10);
      // });

      // We don't need a Y-axis label as its meaning is clear from the context
    } catch (error) {
      console.error("Error rendering timeline:", error);
    }
  }, [durationCurve, substance, route]);

  return (
    <div
      className={`relative w-full ${className || ""} rounded-xl shadow-md bg-transparent p-0`}
    >
      <canvas
        ref={canvasRef}
        width={1000}
        height={500}
        className="w-full h-auto rounded-lg"
        style={{ background: theme === 'dark' ? '#1e293b' : '#f8fafc' }}
      />
    </div>
  );
}
