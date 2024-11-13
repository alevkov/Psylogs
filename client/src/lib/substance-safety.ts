import { z } from 'zod';

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

export function parseDoseValue(doseString: string): number {
  const match = doseString.match(/^([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

export function getDoseTierInfo(amount: number, tiers: DoseTier): {
  currentTier: string;
  warning?: string;
} {
  const tierValues = {
    Light: parseDoseValue(tiers.Light.split('-')[0]),
    Common: parseDoseValue(tiers.Common.split('-')[0]),
    Strong: parseDoseValue(tiers.Strong.split('-')[0]),
    Heavy: parseDoseValue(tiers.Heavy)
  };

  if (amount >= tierValues.Heavy) {
    return {
      currentTier: 'Heavy',
      warning: 'WARNING: This is a heavy dose with increased risk. Please exercise extreme caution.'
    };
  } else if (amount >= tierValues.Strong) {
    return {
      currentTier: 'Strong',
      warning: 'This is a strong dose. Be aware of increased effects.'
    };
  } else if (amount >= tierValues.Common) {
    return { currentTier: 'Common' };
  } else if (amount >= tierValues.Light) {
    return { currentTier: 'Light' };
  }
  
  return { currentTier: 'Threshold' };
}

export function normalizeSubstanceName(name: string): string {
  return name.toLowerCase().replace(/[-_\s]+/g, '').replace(/[^a-z0-9]/g, '');
}

export function findSubstanceMatch(
  userInput: string,
  substancesData: SubstanceData[]
): SubstanceData | null {
  const normalizedInput = normalizeSubstanceName(userInput);
  
  // First try exact match with name or aliases
  const exactMatch = substancesData.find(substance => {
    if (normalizeSubstanceName(substance.name) === normalizedInput) return true;
    return substance.aliases.some(alias => normalizeSubstanceName(alias) === normalizedInput);
  });
  
  if (exactMatch) return exactMatch;

  // Then try partial matches
  const partialMatch = substancesData.find(substance => {
    if (normalizeSubstanceName(substance.name).includes(normalizedInput)) return true;
    return substance.aliases.some(alias => normalizeSubstanceName(alias).includes(normalizedInput));
  });
  
  return partialMatch || null;
}

export function getSubstanceSafetyInfo(
  substance: string,
  amount: number,
  route: string,
  substancesData: SubstanceData[]
): {
  dosageGuidance: string;
  safetyWarnings: string[];
  effects: string[];
  duration?: string;
  onset?: string;
} | null {
  const substanceInfo = findSubstanceMatch(substance, substancesData);
  
  if (!substanceInfo) return null;
  
  const routeDoses = substanceInfo.formatted_dose[route];
  if (!routeDoses) {
    return {
      dosageGuidance: `No specific dosage information available for ${route} administration.`,
      safetyWarnings: [substanceInfo.properties.avoid],
      effects: substanceInfo.formatted_effects
    };
  }

  const { currentTier, warning } = getDoseTierInfo(amount, routeDoses);
  const warnings = [substanceInfo.properties.avoid];
  if (warning) warnings.push(warning);
  if (substanceInfo.dose_note) warnings.push(substanceInfo.dose_note);

  return {
    dosageGuidance: `Current dose (${amount}mg) is in the ${currentTier} range`,
    safetyWarnings: warnings,
    effects: substanceInfo.formatted_effects,
    duration: `Duration: ${substanceInfo.formatted_duration.value} ${substanceInfo.formatted_duration._unit}`,
    onset: `Onset: ${substanceInfo.formatted_onset.value} ${substanceInfo.formatted_onset._unit}`
  };
}
