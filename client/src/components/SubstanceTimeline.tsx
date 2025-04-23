import React, { useEffect, useRef } from "react";
import { parseIsoDuration, PhaseDuration, DurationCurve } from "../lib/timeline.types";
import { getSubstanceColor } from "../lib/color-utils";

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
  className
}: SubstanceTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const substanceColor = getSubstanceColor(substance);
  
  // Convert ISO durations to hours if needed
  const convertISOToHours = (phase: PhaseDuration, useStart: boolean = true): number => {
    if (useStart) {
      // Use the numerical value if available
      if (typeof phase.start === 'number') return phase.start;
      
      // Otherwise parse from ISO string
      if (phase.iso_start && phase.iso_start.length > 0) {
        return parseIsoDuration(phase.iso_start[0]);
      }
    } else {
      if (typeof phase.end === 'number') return phase.end;
      
      if (phase.iso_end && phase.iso_end.length > 0) {
        return parseIsoDuration(phase.iso_end[0]);
      }
    }
    return 0; // Fallback
  };

  useEffect(() => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

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
      let totalDurationHours = convertISOToHours(durationCurve.after_effects, false);
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
      const adjustTime = (time: number) => Math.max(0, time - visualizationStartTime);

      // Vibrant colors for each phase
      const onsetColor = "#38bdf8"; // Bright blue
      const peakColor = "#fb7185"; // Bright pink
      const offsetColor = "#c084fc"; // Bright purple
      const afterColor = "#67e8f9"; // Bright cyan

      // Canvas dimensions
      const width = canvas.width;
      const height = canvas.height;
      const padding = 20; // Minimal padding
      const usableWidth = width - (2 * padding);
      const usableHeight = height - (2 * padding);
      const timeAxisY = height - padding - 10; // Just offset by 10px for labels

      // Draw subtle background regions - use adjusted times for proper rendering
      const phases = [
        { start: adjustTime(onsetStart), end: adjustTime(onsetEnd), color: onsetColor, name: "Onset" },
        { start: adjustTime(peakStart), end: adjustTime(peakEnd), color: peakColor, name: "Peak" },
        { start: adjustTime(offsetStart), end: adjustTime(offsetEnd), color: offsetColor, name: "Offset" },
        { start: adjustTime(afterStart), end: adjustTime(afterEnd), color: afterColor, name: "After-effects" }
      ];

      // Define a consistent time scaling function used throughout the component
      // Using a less dramatic logarithmic scale by blending with linear scaling
      const createTimeScale = () => {
        const minTime = 0.0001; // Small non-zero value for log scaling
        const logBase = 4; // Lower base = less dramatic stretching (was 10)
        const logMin = Math.log(minTime) / Math.log(logBase);
        const logMax = Math.log(totalDurationHours + minTime) / Math.log(logBase);
        
        // Return the actual scaling function with some linear component
        return (timeHours: number): number => {
          // Pure logarithmic scaling
          const logVal = Math.log(Math.max(timeHours, minTime)) / Math.log(logBase);
          const logScale = (logVal - logMin) / (logMax - logMin);
          
          // Linear scaling
          const linearScale = timeHours / totalDurationHours;
          
          // Blend log and linear (70% log, 30% linear) for more balanced scaling
          return logScale * 0.7 + linearScale * 0.3;
        };
      };
      
      // Create the scaling function once
      const timeScale = createTimeScale();
      
      phases.forEach(phase => {
        if (phase.start >= 0 && phase.end > phase.start) {
          // Use our blended log/linear time scale for x-coordinates
          const scaledStart = timeScale(phase.start);
          const scaledEnd = timeScale(phase.end);
          
          const xStart = padding + scaledStart * usableWidth;
          const xEnd = padding + scaledEnd * usableWidth;
          const width = xEnd - xStart;
          
          // Draw background
          ctx.fillStyle = `${phase.color}20`;
          ctx.fillRect(xStart, padding, width, usableHeight);
          
          // Draw phase label
          ctx.save();
          ctx.translate(xStart + (width / 2), padding + 15);
          ctx.fillStyle = phase.color;
          ctx.font = "bold 16px Arial"; // Increased from 13px to 16px
          ctx.textAlign = "center";
          ctx.fillText(phase.name, 0, 0);
          ctx.restore();
        }
      });

      // Draw time axis
      ctx.beginPath();
      ctx.strokeStyle = "#adb5bd";
      ctx.lineWidth = 1.5;
      ctx.moveTo(padding, timeAxisY);
      ctx.lineTo(width - padding, timeAxisY);
      ctx.stroke();
      
      // Using the timeScale function defined above
      
      // Draw phase time markers with our balanced time scale
      ctx.textAlign = "center";
      ctx.font = "14px Arial"; // Increased from 12px to 14px
      ctx.fillStyle = "#6c757d";
      
      // Define phase markers to show on the time axis - using adjusted times
      const phaseMarkers = [
        // Starting with onset point (which is now at time 0 with our adjustment)
        { time: adjustTime(onsetStart), label: "Onset", color: onsetColor },
        { time: adjustTime(onsetEnd), label: (onsetEnd - onsetStart).toFixed(1) + "h", color: onsetColor },
        { time: adjustTime(peakStart), label: "Peak", color: peakColor },
        { time: adjustTime(peakEnd), label: (peakEnd - onsetStart).toFixed(1) + "h", color: peakColor },
        { time: adjustTime(offsetStart), label: "Offset", color: offsetColor },
        { time: adjustTime(offsetEnd), label: (offsetEnd - onsetStart).toFixed(1) + "h", color: offsetColor },
        { time: adjustTime(afterStart), label: "After", color: afterColor },
        { time: adjustTime(afterEnd), label: (afterEnd - onsetStart).toFixed(1) + "h", color: afterColor },
        { time: totalDurationHours, label: totalDurationHours.toFixed(1) + "h", color: "#6c757d" }
      ];
      
      // Filter out redundant markers (same time or too close)
      const minDistancePx = 50; // Minimum distance in pixels between markers (increased from 30 to 50 for larger fonts)
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
      filteredMarkers.forEach(marker => {
        if (marker.time <= totalDurationHours) {
          const scaledPos = timeScale(marker.time);
          const x = padding + scaledPos * usableWidth;
          
          ctx.beginPath();
          ctx.strokeStyle = marker.color;
          ctx.moveTo(x, timeAxisY);
          ctx.lineTo(x, timeAxisY + 10); // Increased tick length from 8 to 10
          ctx.stroke();
          
          ctx.fillStyle = marker.color;
          ctx.fillText(marker.label, x, timeAxisY + 25); // Increased offset from 20 to 25 to accommodate larger font
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
          { time: adjustTime(onsetStart), intensity: 0 },     // Begin onset at zero
          { time: adjustTime(onsetEnd), intensity: 1.0 },     // End onset at full intensity
          
          // If there's a gap between onset and peak, add intermediate points
          ...(hasGapBetweenOnsetAndPeak ? [
            { time: adjustTime(onsetEnd), intensity: 1.0 },          // Maintain high intensity after onset
            { time: adjustTime(peakStart), intensity: 1.0 }           // Maintain before peak
          ] : []),
          
          // Peak phase - flat plateau at max intensity
          { time: adjustTime(peakStart), intensity: 1.0 },          // Begin peak at full intensity
          { time: adjustTime(peakEnd), intensity: 1.0 },            // End peak still at full intensity
          
          // If there's a gap between peak and offset, add intermediate points
          ...(hasGapBetweenPeakAndOffset ? [
            { time: adjustTime(peakEnd), intensity: 1.0 },          // Maintain after peak
            { time: adjustTime(offsetStart), intensity: 1.0 }        // Maintain before offset starts
          ] : []),
          
          // Offset phase - declining from peak to low
          { time: adjustTime(offsetStart), intensity: 1.0 },        // Begin offset at full intensity
          { time: adjustTime(offsetEnd), intensity: 0.2 },          // End offset at low intensity
          
          // If there's a gap between offset and after-effects, add intermediate points
          ...(hasGapBetweenOffsetAndAfter ? [
            { time: adjustTime(offsetEnd), intensity: 0.2 },        // Maintain after offset
            { time: adjustTime(afterStart), intensity: 0.2 }         // Maintain before after-effects
          ] : []),
          
          // After-effects phase - fading to zero
          { time: adjustTime(afterStart), intensity: 0.2 },         // Begin after-effects at low intensity
          { time: adjustTime(afterEnd), intensity: 0 },             // End after-effects at zero
          
          // Ensure we extend to the end of the timeline
          { time: adjustTime(totalDurationHours + visualizationStartTime), intensity: 0 }    // Final point
        ];

        // Sort by time to ensure proper order
        keyPoints.sort((a, b) => a.time - b.time);
        
        // Remove duplicate time points that could cause discontinuities
        const uniqueKeyPoints = keyPoints.filter((point, index, self) => 
          index === 0 || point.time !== self[index - 1].time
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
            if (timeHours >= uniqueKeyPoints[j].time && timeHours <= uniqueKeyPoints[j + 1].time) {
              leftPoint = uniqueKeyPoints[j];
              rightPoint = uniqueKeyPoints[j + 1];
              break;
            }
          }
          
          // Pure linear interpolation of intensity
          let intensity = 0;
          if (rightPoint.time - leftPoint.time > 0) {
            const progress = (timeHours - leftPoint.time) / (rightPoint.time - leftPoint.time);
            intensity = leftPoint.intensity + (rightPoint.intensity - leftPoint.intensity) * progress;
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
      
      const curvePoints = generateLinearCurve();

      // Draw intensity curve with smooth gradient
      try {
        // Create gradient for the curve line
        const curveGradient = ctx.createLinearGradient(padding, 0, width - padding, 0);
        curveGradient.addColorStop(0, onsetColor);
        curveGradient.addColorStop(0.3, peakColor);
        curveGradient.addColorStop(0.7, offsetColor);
        curveGradient.addColorStop(1, afterColor);
        
        // Draw curve with pure linear segments
        ctx.beginPath();
        ctx.moveTo(curvePoints[0].x, curvePoints[0].y);
        
        // Simple linear path between all points
        for (let i = 1; i < curvePoints.length; i++) {
          ctx.lineTo(curvePoints[i].x, curvePoints[i].y);
        }
        
        // Style and draw the curve
        ctx.strokeStyle = curveGradient;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        
        // Fill under the curve
        ctx.lineTo(curvePoints[curvePoints.length - 1].x, timeAxisY);
        ctx.lineTo(curvePoints[0].x, timeAxisY);
        ctx.closePath();
        
        // Create fill gradient
        const fillGradient = ctx.createLinearGradient(padding, 0, width - padding, 0);
        fillGradient.addColorStop(0, `${onsetColor}40`);
        fillGradient.addColorStop(0.3, `${peakColor}40`);
        fillGradient.addColorStop(0.7, `${offsetColor}40`);
        fillGradient.addColorStop(1, `${afterColor}40`);
        
        ctx.fillStyle = fillGradient;
        ctx.fill();
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
    } catch (error) {
      console.error("Error rendering timeline:", error);
    }
  }, [durationCurve, substance, route]);

  return (
    <div className={`relative w-full ${className || ''}`}>
      <canvas 
        ref={canvasRef} 
        width={1000} 
        height={500} 
        className="w-full h-auto"
      />
      <div className="text-xs text-gray-500 mt-1 text-center">
        Route: {route}
      </div>
    </div>
  );
}