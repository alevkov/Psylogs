// lib/dose-tiers.types.ts
export interface DoseTier {
  value?: number;
  lower_value?: number;
  upper_value?: number;
  unit?: string;
  lower_unit?: string;
  upper_unit?: string;
}

export interface DoseRanges {
  threshold: DoseTier | string;
  light: DoseTier;
  common: DoseTier;
  strong: DoseTier;
  heavy: DoseTier | string;
}

export interface SubstanceData {
  drug: string;
  method: string;
  dose_ranges: string;
}

export function convertToMg(value: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case "mg":
      return value;
    case "g":
      return value * 1000;
    case "ug":
      return value / 1000;
    case "ml":
      // Keep ml as is - can't convert without substance-specific density
      return value;
    default:
      throw new Error(`Unsupported unit: ${unit}`);
  }
}

export function normalizeUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
): number {
  if (fromUnit === toUnit) return value;

  // Convert everything to mg first
  const inMg = convertToMg(value, fromUnit);

  // Then convert to target unit
  switch (toUnit.toLowerCase()) {
    case "mg":
      return inMg;
    case "g":
      return inMg / 1000;
    case "ug":
      return inMg * 1000;
    case "ml":
      // Keep ml as is
      return value;
    default:
      throw new Error(`Unsupported target unit: ${toUnit}`);
  }
}

export function analyzeDoseTier(
  substance: string,
  method: string,
  dose: number,
  unit: string,
  doseData: SubstanceData[],
): {
  tier: string;
  analysis: string;
  ranges?: {
    threshold?: number;
    light?: { lower: number; upper: number };
    common?: { lower: number; upper: number };
    strong?: { lower: number; upper: number };
    heavy?: number;
  };
} {
  // Find matching substance and method
  const matchingData = doseData.find(
    (entry) =>
      entry.drug.toLowerCase() === substance.toLowerCase() &&
      entry.method.toLowerCase() === method.toLowerCase(),
  );

  if (!matchingData) {
    return {
      tier: "",
      analysis: "Dosing guidelines not found for this substance and method",
      ranges: {},
    };
  }

  // Parse the dose ranges
  const ranges: DoseRanges = JSON.parse(
    matchingData.dose_ranges.replace(/'/g, '"'),
  );

  // Helper function to check if a dose falls within a tier range
  function isInRange(tierData: DoseTier | string): boolean {
    if (typeof tierData === "string") return false;

    // For threshold and heavy which only have single values
    if (tierData.value !== undefined) {
      const normalizedValue = normalizeUnit(
        tierData.value,
        tierData.unit || "mg",
        unit,
      );
      return dose === normalizedValue;
    }

    // For ranges with upper and lower bounds
    if (
      tierData.lower_value !== undefined &&
      tierData.upper_value !== undefined
    ) {
      const normalizedLower = normalizeUnit(
        tierData.lower_value,
        tierData.lower_unit || "mg",
        unit,
      );
      const normalizedUpper = normalizeUnit(
        tierData.upper_value,
        tierData.upper_unit || "mg",
        unit,
      );
      return dose >= normalizedLower && dose <= normalizedUpper;
    }

    return false;
  }

  // Build readable ranges object for the response
  const readableRanges: any = {};

  if (typeof ranges.threshold !== "string" && ranges.threshold?.value) {
    readableRanges.threshold = normalizeUnit(
      ranges.threshold.value,
      ranges.threshold.unit || "mg",
      unit,
    );
  }

  if (typeof ranges.light !== "string") {
    readableRanges.light = {
      lower: normalizeUnit(
        ranges.light.lower_value!,
        ranges.light.lower_unit || "mg",
        unit,
      ),
      upper: normalizeUnit(
        ranges.light.upper_value!,
        ranges.light.upper_unit || "mg",
        unit,
      ),
    };
  }

  if (typeof ranges.common !== "string") {
    readableRanges.common = {
      lower: normalizeUnit(
        ranges.common.lower_value!,
        ranges.common.lower_unit || "mg",
        unit,
      ),
      upper: normalizeUnit(
        ranges.common.upper_value!,
        ranges.common.upper_unit || "mg",
        unit,
      ),
    };
  }

  if (typeof ranges.strong !== "string") {
    readableRanges.strong = {
      lower: normalizeUnit(
        ranges.strong.lower_value!,
        ranges.strong.lower_unit || "mg",
        unit,
      ),
      upper: normalizeUnit(
        ranges.strong.upper_value!,
        ranges.strong.upper_unit || "mg",
        unit,
      ),
    };
  }

  if (typeof ranges.heavy !== "string" && ranges.heavy?.value) {
    readableRanges.heavy = normalizeUnit(
      ranges.heavy.value,
      ranges.heavy.unit || "mg",
      unit,
    );
  }

  // Determine which tier the dose falls into
  let tier = "";
  let analysis = "";

  if (typeof ranges.threshold !== "string" && ranges.threshold?.value) {
    const thresholdValue = normalizeUnit(
      ranges.threshold.value,
      ranges.threshold.unit || "mg",
      unit,
    );
    if (dose < thresholdValue) {
      return {
        tier: "subthreshold",
        analysis: `This dose (${dose}${unit}) is below the threshold dose of ${thresholdValue}${unit}`,
        ranges: readableRanges,
      };
    }
  }

  if (typeof ranges.light !== "string" && isInRange(ranges.light)) {
    tier = "light";
    analysis = "This is a light dose";
  } else if (typeof ranges.common !== "string" && isInRange(ranges.common)) {
    tier = "common";
    analysis = "This is a common dose";
  } else if (typeof ranges.strong !== "string" && isInRange(ranges.strong)) {
    tier = "strong";
    analysis = "This is a strong dose";
  } else if (typeof ranges.heavy !== "string" && ranges.heavy?.value) {
    const heavyValue = normalizeUnit(
      ranges.heavy.value,
      ranges.heavy.unit || "mg",
      unit,
    );
    if (dose >= heavyValue) {
      tier = "heavy";
      analysis = "This is a heavy dose";
    }
  }

  // Add warning for heavy doses
  if (tier === "heavy" || tier === "strong") {
    analysis += ". Please be cautious with doses in this range.";
  }

  return { tier, analysis, ranges: readableRanges };
}

export function getTierBadgeVariant(
  tier: string,
): "default" | "secondary" | "destructive" | "outline" | "warning" {
  switch (tier) {
    case "threshold":
      return "secondary";
    case "light":
      return "outline";
    case "common":
      return "default";
    case "strong":
      return "warning";
    case "heavy":
      return "destructive";
    default:
      return "secondary";
  }
}
