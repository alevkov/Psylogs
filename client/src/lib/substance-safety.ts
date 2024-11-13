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
  aliases?: string[];
  categories?: string[];
  dose_note?: string;
  formatted_dose?: {
    [route: string]: DoseTier;
  };
  formatted_duration?: {
    _unit: string;
    value: string;
  };
  formatted_onset?: {
    _unit: string;
    value: string;
  };
  formatted_aftereffects?: {
    _unit: string;
    value: string;
  };
  formatted_effects?: string[];
  properties?: {
    avoid?: string;
    summary?: string;
    aliases?: string[];
    categories?: string[];
    dose?: string;
    duration?: string;
    onset?: string;
    effects?: string;
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
  try {
    const normalized = unit.toLowerCase().trim();
    return UNIT_ALIASES[normalized] || normalized;
  } catch (error) {
    console.warn('Error normalizing unit:', error);
    return unit;
  }
}

// Fuzzy match implementation for substance names
function getFuzzyScore(query: string, target: string): number {
  try {
    query = query.toLowerCase();
    target = target.toLowerCase();

    // Exact match gets highest score
    if (target === query) return 1;
    
    // Start match gets high score
    if (target.startsWith(query)) return 0.9;
    
    // Contains match gets medium score
    if (target.includes(query)) return 0.7;

    // Calculate Levenshtein-like score for partial matches
    let score = 0;
    let matchedChars = 0;
    let lastMatchIndex = -1;

    for (const char of query) {
      const index = target.indexOf(char, lastMatchIndex + 1);
      if (index > -1) {
        matchedChars++;
        score += 1 / (index - lastMatchIndex);
        lastMatchIndex = index;
      }
    }

    return (matchedChars / query.length) * (score / query.length);
  } catch (error) {
    console.warn('Error calculating fuzzy score:', error);
    return 0;
  }
}

// Parse dose ranges from various formats
function parseDoseRange(doseStr: string): { min: number; max?: number } | null {
  try {
    if (!doseStr) return null;

    // Clean the string
    const cleaned = doseStr.toLowerCase().trim();
    
    // Handle various formats
    // Format: "X-Ymg" or "X-Y mg" or "X to Y mg"
    const rangeMatch = cleaned.match(/(\d+\.?\d*)\s*(?:to|-)\s*(\d+\.?\d*)\s*(mg|g|ug|μg|ml)/i);
    if (rangeMatch) {
      return {
        min: parseFloat(rangeMatch[1]),
        max: parseFloat(rangeMatch[2])
      };
    }

    // Format: ">Xmg" or "over Xmg"
    const overMatch = cleaned.match(/(?:>|over)\s*(\d+\.?\d*)\s*(mg|g|ug|μg|ml)/i);
    if (overMatch) {
      return {
        min: parseFloat(overMatch[1])
      };
    }

    // Format: "Xmg"
    const singleMatch = cleaned.match(/(\d+\.?\d*)\s*(mg|g|ug|μg|ml)/i);
    if (singleMatch) {
      return {
        min: parseFloat(singleMatch[1])
      };
    }

    return null;
  } catch (error) {
    console.warn('Error parsing dose range:', error);
    return null;
  }
}

export function parseDoseValue(doseString: string): number {
  try {
    if (!doseString) return 0;
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
    if (!name) return '';
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

    // Collect all matches with their scores
    const matches = substancesData.map(substance => {
      if (!substance) return { substance: null, score: 0 };

      let maxScore = 0;

      // Check main name
      maxScore = Math.max(maxScore, getFuzzyScore(normalizedInput, substance.name));

      // Check pretty name
      if (substance.pretty_name) {
        maxScore = Math.max(maxScore, getFuzzyScore(normalizedInput, substance.pretty_name));
      }

      // Check root-level aliases
      if (substance.aliases) {
        substance.aliases.forEach(alias => {
          maxScore = Math.max(maxScore, getFuzzyScore(normalizedInput, alias));
        });
      }

      // Check properties-nested aliases
      if (substance.properties?.aliases) {
        substance.properties.aliases.forEach(alias => {
          maxScore = Math.max(maxScore, getFuzzyScore(normalizedInput, alias));
        });
      }

      return { substance, score: maxScore };
    });

    // Sort by score and get the best match
    const bestMatch = matches
      .filter(m => m.score > 0.3) // Threshold for minimum similarity
      .sort((a, b) => b.score - a.score)[0];

    return bestMatch?.substance || null;
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
        warning: 'WARNING: This is a heavy dose with increased risk. Please exercise extreme caution.',
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

function parseDoseInformation(substance: SubstanceData, route: string): DoseTier | null {
  try {
    // Try formatted_dose first
    if (substance.formatted_dose?.[route]) {
      return substance.formatted_dose[route];
    }

    // Try parsing from properties.dose if formatted_dose is not available
    if (substance.properties?.dose) {
      const doseStr = substance.properties.dose;
      const routePattern = new RegExp(`${route}\\s*:?\\s*([^|.]+)`, 'i');
      const match = doseStr.match(routePattern);
      
      if (match) {
        const doseParts = match[1].split(/\s*,\s*/);
        const tiers: Partial<DoseTier> = {};
        
        doseParts.forEach(part => {
          const [tier, value] = part.split(':').map(s => s.trim());
          if (tier && value) {
            tiers[tier as keyof DoseTier] = value;
          }
        });

        return tiers as DoseTier;
      }
    }

    return null;
  } catch (error) {
    console.warn('Error parsing dose information:', error);
    return null;
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
    const routeDoses = parseDoseInformation(substanceInfo, normalizedRoute);

    if (!routeDoses) {
      return {
        dosageGuidance: `No specific dosage information available for ${route} administration.`,
        safetyWarnings: [substanceInfo.properties?.avoid || 'No specific safety information available.'],
        effects: substanceInfo.formatted_effects || 
                (substanceInfo.properties?.effects?.split(',').map(e => e.trim())) || 
                [],
      };
    }

    const { currentTier, warning } = getDoseTierInfo(amount, routeDoses);
    const warnings = [
      substanceInfo.properties?.avoid || 'No specific safety information available.',
    ];
    if (warning) warnings.push(warning);
    if (substanceInfo.dose_note) warnings.push(substanceInfo.dose_note);

    // Handle both formatted and properties duration/onset
    const duration = substanceInfo.formatted_duration ? 
      `Duration: ${substanceInfo.formatted_duration.value} ${substanceInfo.formatted_duration._unit}` :
      substanceInfo.properties?.duration ? 
      `Duration: ${substanceInfo.properties.duration}` : undefined;
    
    const onset = substanceInfo.formatted_onset ?
      `Onset: ${substanceInfo.formatted_onset.value} ${substanceInfo.formatted_onset._unit}` :
      substanceInfo.properties?.onset ?
      `Onset: ${substanceInfo.properties.onset}` : undefined;

    // Parse effects from either source
    const effects = substanceInfo.formatted_effects || 
                   (substanceInfo.properties?.effects?.split(',').map(e => e.trim())) ||
                   [];

    return {
      dosageGuidance: `Current dose (${amount}${normalizeUnit('mg')}) is in the ${currentTier} range`,
      safetyWarnings: warnings.filter(w => w), // Remove any undefined/null values
      effects,
      duration,
      onset,
    };
  } catch (error) {
    console.warn(`Error getting safety info for ${substance}:`, error);
    return null;
  }
}
