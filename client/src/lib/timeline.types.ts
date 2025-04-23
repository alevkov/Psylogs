// Define types for duration curve data

export interface DurationRange {
  min: number;
  max: number;
  iso: string[];
  note?: string;
}

export interface PhaseDuration {
  start: number;
  end: number;
  iso_start: string[];
  iso_end: string[];
}

export interface DurationCurve {
  reference: string;
  units: string;
  total_duration: DurationRange;
  onset: PhaseDuration;
  peak: PhaseDuration;
  offset: PhaseDuration;
  after_effects: PhaseDuration;
}

export interface TimelineData {
  drug: string;
  method: string;
  duration_curve: DurationCurve;
}

// Helper functions for working with duration curves
export function parseIsoDuration(isoDuration: string): number {
  // Parse ISO 8601 duration format to hours
  // Examples: PT1H30M (1.5 hours), P2D (48 hours)
  
  let hours = 0;
  
  // Handle day part
  const dayMatch = isoDuration.match(/P(\d+)D/);
  if (dayMatch) {
    hours += parseInt(dayMatch[1], 10) * 24;
  }
  
  // Handle week part
  const weekMatch = isoDuration.match(/P(\d+)W/);
  if (weekMatch) {
    hours += parseInt(weekMatch[1], 10) * 24 * 7;
  }
  
  // Handle hour part
  const hourMatch = isoDuration.match(/PT(\d+)H/);
  if (hourMatch) {
    hours += parseInt(hourMatch[1], 10);
  }
  
  // Handle minute part
  const minuteMatch = isoDuration.match(/PT(?:\d+H)?(\d+)M/);
  if (minuteMatch) {
    hours += parseInt(minuteMatch[1], 10) / 60;
  }
  
  // Handle second part
  const secondMatch = isoDuration.match(/PT(?:\d+H)?(?:\d+M)?(\d+)S/);
  if (secondMatch) {
    hours += parseInt(secondMatch[1], 10) / 3600;
  }
  
  return hours;
}

// Get phase boundary in hours for a timeline phase
export function getPhaseTime(phase: PhaseDuration, endOfPhase: boolean = false): number {
  if (endOfPhase) {
    return phase.end;
  }
  return phase.start;
}

// Get total duration in hours
export function getTotalDuration(durationCurve: DurationCurve): number {
  return durationCurve.total_duration.max;
}

// Determine the current phase based on elapsed time
export function determinePhase(
  elapsedTimeHours: number,
  durationCurve: DurationCurve
): "onset" | "peak" | "offset" | "after" | "complete" {
  if (elapsedTimeHours < durationCurve.onset.end) {
    return "onset";
  } else if (elapsedTimeHours < durationCurve.peak.end) {
    return "peak";
  } else if (elapsedTimeHours < durationCurve.offset.end) {
    return "offset";
  } else if (elapsedTimeHours < durationCurve.after_effects.end) {
    return "after";
  } else {
    return "complete";
  }
}