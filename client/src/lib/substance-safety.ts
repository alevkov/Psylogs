import { z } from "zod";

export interface DoseTier {
  Light: string;
  Common: string;
  Strong: string;
  Heavy: string;
}

export interface SubstanceData {
  name: string;
  pretty_name: string;
  aliases: string[];
  categories: string[];
  dose_note?: string;
  formatted_dose: {
    [route: string]: DoseTier;
  };
  formatted_duration: {
    _unit: string;
    value: string;
  };
  formatted_onset: {
    _unit: string;
    value: string;
  };
  formatted_aftereffects: {
    _unit: string;
    value: string;
  };
  formatted_effects: string[];
  properties: {
    avoid: string;
    summary: string;
  };
}

// Unit normalization mapping
const UNIT_ALIASES: { [key: string]: string } = {
  'ug': 'μg',
  'mcg': 'μg',
  'micrograms': 'μg',
  'milligrams': 'mg',
  'grams': 'g',
  'milliliters': 'ml'
};

// Helper function to normalize units
function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim();
  return UNIT_ALIASES[normalized] || normalized;
}

// Helper function to safely extract numeric value from dose string
function extractDoseValue(doseString: string): number {
  try {
    const match = doseString.match(/^([\d.]+)/);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    return isNaN(value) ? 0 : value;
  } catch {
    return 0;
  }
}

export function parseDoseValue(doseString: string): number {
  try {
    const cleanedString = doseString.replace(/\s+/g, '');
    const match = cleanedString.match(/^([\d.]+)/);
    return match ? parseFloat(match[1]) : 0;
  } catch (error) {
    console.warn(`Error parsing dose value from ${doseString}:`, error);
    return 0;
  }
}

export function normalizeSubstanceName(name: string): string {
  try {
    return name
      .toLowerCase()
      .replace(/[-_\s]+/g, '')
      .replace(/[^a-z0-9]/g, '');
  } catch (error) {
    console.warn(`Error normalizing substance name ${name}:`, error);
    return '';
  }
}

export function findSubstanceMatch(
  userInput: string,
  substancesData: SubstanceData[],
): SubstanceData | null {
  try {
    if (!userInput || !substancesData?.length) return null;
    
    const normalizedInput = normalizeSubstanceName(userInput);
    if (!normalizedInput) return null;

    // First try exact match with name or aliases
    const exactMatch = substancesData.find((substance) => {
      if (!substance?.name) return false;
      if (normalizeSubstanceName(substance.name) === normalizedInput) return true;
      return substance.aliases?.some(
        (alias) => normalizeSubstanceName(alias) === normalizedInput,
      );
    });

    if (exactMatch) return exactMatch;

    // Then try partial matches
    const partialMatch = substancesData.find((substance) => {
      if (!substance?.name) return false;
      if (normalizeSubstanceName(substance.name).includes(normalizedInput))
        return true;
      return substance.aliases?.some((alias) =>
        normalizeSubstanceName(alias).includes(normalizedInput),
      );
    });

    return partialMatch || null;
  } catch (error) {
    console.warn(`Error finding substance match for ${userInput}:`, error);
    return null;
  }
}

export function getDoseTierInfo(
  amount: number,
  tiers: DoseTier,
): {
  currentTier: string;
  warning?: string;
} {
  try {
    if (!amount || !tiers) {
      return { currentTier: 'Unknown' };
    }

    const tierValues = {
      Light: parseDoseValue(tiers.Light?.split('-')[0] || '0'),
      Common: parseDoseValue(tiers.Common?.split('-')[0] || '0'),
      Strong: parseDoseValue(tiers.Strong?.split('-')[0] || '0'),
      Heavy: parseDoseValue(tiers.Heavy || '0'),
    };

    if (amount >= tierValues.Heavy && tierValues.Heavy > 0) {
      return {
        currentTier: 'Heavy',
        warning:
          'WARNING: This is a heavy dose with increased risk. Please exercise extreme caution.',
      };
    } else if (amount >= tierValues.Strong && tierValues.Strong > 0) {
      return {
        currentTier: 'Strong',
        warning: 'This is a strong dose. Be aware of increased effects.',
      };
    } else if (amount >= tierValues.Common && tierValues.Common > 0) {
      return { currentTier: 'Common' };
    } else if (amount >= tierValues.Light && tierValues.Light > 0) {
      return { currentTier: 'Light' };
    }

    return { currentTier: 'Threshold' };
  } catch (error) {
    console.warn(`Error getting dose tier info for amount ${amount}:`, error);
    return { currentTier: 'Unknown' };
  }
}

export function getSubstanceSafetyInfo(
  substance: string,
  amount: number,
  route: string,
  substancesData: SubstanceData[],
): {
  dosageGuidance: string;
  safetyWarnings: string[];
  effects: string[];
  duration?: string;
  onset?: string;
} | null {
  try {
    if (!substance || !amount || !route || !substancesData?.length) {
      return null;
    }

    const substanceInfo = findSubstanceMatch(substance, substancesData);
    if (!substanceInfo) return null;

    // Normalize route name to match possible keys
    const normalizedRoute = route.charAt(0).toUpperCase() + route.slice(1).toLowerCase();
    const routeDoses = substanceInfo.formatted_dose?.[normalizedRoute] || 
                      substanceInfo.formatted_dose?.[route.toLowerCase()] || 
                      substanceInfo.formatted_dose?.[route.toUpperCase()];

    if (!routeDoses) {
      return {
        dosageGuidance: `No specific dosage information available for ${route} administration.`,
        safetyWarnings: [substanceInfo.properties?.avoid || 'No specific safety information available.'],
        effects: substanceInfo.formatted_effects || [],
      };
    }

    const { currentTier, warning } = getDoseTierInfo(amount, routeDoses);
    const warnings = [
      substanceInfo.properties?.avoid || 'No specific safety information available.',
    ];
    if (warning) warnings.push(warning);
    if (substanceInfo.dose_note) warnings.push(substanceInfo.dose_note);

    const duration = substanceInfo.formatted_duration ? 
      `Duration: ${substanceInfo.formatted_duration.value} ${substanceInfo.formatted_duration._unit}` : undefined;
    
    const onset = substanceInfo.formatted_onset ?
      `Onset: ${substanceInfo.formatted_onset.value} ${substanceInfo.formatted_onset._unit}` : undefined;

    return {
      dosageGuidance: `Current dose (${amount}mg) is in the ${currentTier} range`,
      safetyWarnings: warnings.filter(w => w), // Remove any undefined/null values
      effects: substanceInfo.formatted_effects || [],
      duration,
      onset,
    };
  } catch (error) {
    console.warn(`Error getting safety info for ${substance}:`, error);
    return null;
  }
}
