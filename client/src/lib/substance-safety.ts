import { z } from "zod";
import articleData from "../lib/articles_refined.json";
import { parseDrugName } from "./utils";

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

    // Normalize both for comparison
    const normalizedQuery = normalizeSubstanceName(query);
    const normalizedTarget = normalizeSubstanceName(target);
    
    // If either is empty after normalization, no match
    if (!normalizedQuery || !normalizedTarget) return 0;
    
    // If they're extremely different in length, they're likely not related
    // This helps prevent matches like omeprazole -> flubromazolam
    const lengthDifference = Math.abs(normalizedQuery.length - normalizedTarget.length);
    if (lengthDifference > 5) return 0;

    // Exact match gets highest score
    if (normalizedTarget === normalizedQuery) return 1;
    
    // Start match gets high score (handle abbreviations like "diaz" for "diazepam")
    if (normalizedTarget.startsWith(normalizedQuery) && normalizedQuery.length >= 3) return 0.95;
    
    // If query is at least 4 chars and is an abbreviation (first part of target)
    // Increased from 3 to 4 chars to avoid overly permissive matches
    if (normalizedQuery.length >= 4 && normalizedTarget.startsWith(normalizedQuery)) return 0.9;
    
    // Contains match gets medium score ONLY if query is substantial
    // Increased from 3 to 4 chars minimum
    if (normalizedQuery.length >= 4 && normalizedTarget.includes(normalizedQuery)) return 0.8;

    // Handle common prefix for chemical compounds (like 3,4-xxx or 1p-xxx)
    const parts = normalizedQuery.split(/[-,]/);
    if (parts.length > 1) {
      for (const part of parts) {
        if (part.length >= 2 && normalizedTarget.includes(part)) return 0.7;
      }
    }

    // Calculate Levenshtein-like score for partial matches
    let score = 0;
    let matchedChars = 0;
    let lastMatchIndex = -1;

    for (const char of normalizedQuery) {
      const index = normalizedTarget.indexOf(char, lastMatchIndex + 1);
      if (index > -1) {
        matchedChars++;
        score += 1 / (index - lastMatchIndex);
        lastMatchIndex = index;
      }
    }

    return (matchedChars / normalizedQuery.length) * (score / normalizedQuery.length);
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
      .replace(/[-_\s]+/g, '') // Remove dashes, underscores, spaces
      .replace(/[^a-z0-9,\.-]/g, ''); // Keep letters, numbers, commas, periods, dashes
  } catch (error) {
    console.warn(`Error normalizing substance name ${name}:`, error);
    return '';
  }
}

// Find substance ID from article data by name
export function findSubstanceId(name: string): number | null {
  try {
    if (!name || name.length < 3) return null;
    
    const normalizedInput = normalizeSubstanceName(name);
    if (!normalizedInput) return null;
    
    // Search in articleData for a matching substance
    const match = articleData.find((article: any) => {
      if (!article.drug_info?.drug_name) return false;
      
      const drugName = article.drug_info.drug_name;
      const { mainName, alternatives } = parseDrugName(drugName);
      
      // Check main name
      if (normalizeSubstanceName(mainName) === normalizedInput) {
        return true;
      }
      
      // Check alternatives
      if (alternatives) {
        return alternatives.split(', ').some((alt: string) => 
          normalizeSubstanceName(alt) === normalizedInput
        );
      }
      
      return false;
    });
    
    return match ? match.id : null;
  } catch (error) {
    console.warn('Error finding substance ID:', error);
    return null;
  }
}

export function findSubstanceMatch(
  userInput: string,
  substancesData: SubstanceData[],
): SubstanceData | null {
  try {
    if (!userInput || !substancesData?.length) return null;
    
    // If userInput is very short (like "am"), we want to be extra cautious
    // with fuzzy matching to prevent false positives
    if (userInput.length < 3) return null;
    
    const normalizedInput = normalizeSubstanceName(userInput);
    if (!normalizedInput) return null;

    // First try for exact matches before doing any fuzzy matching
    // This helps avoid cases like omeprazole -> flubromazolam
    const exactMatches = substancesData.filter(substance => {
      if (!substance) return false;
      
      // Check for exact match with name, pretty_name or any aliases
      const exactNameMatch = normalizeSubstanceName(substance.name) === normalizedInput;
      const exactPrettyNameMatch = substance.pretty_name && 
                                   normalizeSubstanceName(substance.pretty_name) === normalizedInput;
      
      let exactAliasMatch = false;
      // Check aliases if they exist
      if (substance.aliases) {
        exactAliasMatch = substance.aliases.some(alias => 
          normalizeSubstanceName(alias) === normalizedInput
        );
      }
      
      if (substance.properties?.aliases) {
        exactAliasMatch = exactAliasMatch || substance.properties.aliases.some(alias => 
          normalizeSubstanceName(alias) === normalizedInput
        );
      }
      
      return exactNameMatch || exactPrettyNameMatch || exactAliasMatch;
    });
    
    // If we have exact matches, return the first one (no need for fuzzy matching)
    if (exactMatches.length > 0) {
      return exactMatches[0];
    }

    // Collect all fuzzy matches with their scores
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

    // Use a more strict filter for partial substance names
    // - For shorter inputs (3-4 chars), require a higher score
    // - For medium inputs (5-6 chars), require a good score
    // - For longer inputs, we still need high confidence for safety
    let matchThreshold = 0.75; // Increased default threshold for all names (from 0.6 to 0.75)
    
    if (normalizedInput.length <= 4) {
      matchThreshold = 0.98; // Very strict for very short names (like "am") - increased from 0.95
    } else if (normalizedInput.length <= 6) {
      matchThreshold = 0.9; // Stricter for medium length (like "ampheta") - increased from 0.85
    } else if (normalizedInput.length <= 8) {
      matchThreshold = 0.85; // More strict for mid-length strings - increased from 0.75
    }
    
    // Sort by score and get the best match
    const bestMatch = matches
      .filter(m => m.score > matchThreshold)
      .sort((a, b) => b.score - a.score)[0];
    
    // Additional safety check for long substance names (like omeprazole)
    // If the names are longer than 8 chars, make sure at least 70% of characters match
    if (bestMatch?.substance && normalizedInput.length > 8) {
      const substanceName = normalizeSubstanceName(bestMatch.substance.name);
      
      // Get unique characters by adding them to an object and then getting the keys
      const uniqueChars: {[key: string]: boolean} = {};
      for (let i = 0; i < normalizedInput.length; i++) {
        uniqueChars[normalizedInput[i]] = true;
      }
      const uniqueInputChars = Object.keys(uniqueChars);
      
      // Calculate how many characters from the input are in the substance name
      let matchingChars = 0;
      for (let i = 0; i < uniqueInputChars.length; i++) {
        if (substanceName.includes(uniqueInputChars[i])) {
          matchingChars++;
        }
      }
      
      const matchPercentage = matchingChars / uniqueInputChars.length;
      
      // If less than 70% of unique chars match, reject the match
      if (matchPercentage < 0.7) {
        return null;
      }
    }

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

// Adds debug logging to inspect the matched substance data
function debugSubstanceMatch(substance: string, match: SubstanceData | null): void {
  if (!match) {
    console.log(`No match found for: ${substance}`);
    return;
  }
  
  console.log(`Match for ${substance}:`, {
    name: match.name,
    pretty_name: match.pretty_name,
    has_formatted_effects: Boolean(match.formatted_effects?.length),
    has_properties_effects: Boolean(match.properties?.effects),
    has_formatted_duration: Boolean(match.formatted_duration),
    has_properties_duration: Boolean(match.properties?.duration),
    has_formatted_onset: Boolean(match.formatted_onset),
    has_properties_onset: Boolean(match.properties?.onset),
    has_avoid_warning: Boolean(match.properties?.avoid),
  });
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
    
    // Skip partial substance names (like "am" or "amp") to avoid 
    // confusing partial matches with actual substances
    if (!substance || substance.length < 4 || !amount || !route || !substancesData?.length) {
      return null;
    }
    
    // Additional check for common medications that should not match with recreational substances
    const commonMedications = [
      'omeprazole', 'lansoprazole', 'pantoprazole', 'esomeprazole', 'rabeprazole', // PPIs
      'metformin', 'glyburide', 'glipizide', 'glimepiride', 'sitagliptin', // Diabetes meds
      'lisinopril', 'enalapril', 'captopril', 'benazepril', 'fosinopril', // ACE inhibitors
      'atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin', // Statins
      'metoprolol', 'atenolol', 'propranolol', 'carvedilol', 'bisoprolol', // Beta blockers
      'amlodipine', 'nifedipine', 'diltiazem', 'verapamil', 'felodipine', // Calcium channel blockers
      'levothyroxine', 'warfarin', 'clopidogrel', 'aspirin', 'ibuprofen', 
      'acetaminophen', 'naproxen', 'amoxicillin', 'azithromycin', 'ciprofloxacin',
    ];
    
    // If the substance is a common medication, don't try to match it with recreational substances
    const normalizedSubstance = substance.toLowerCase().trim();
    if (commonMedications.some(med => normalizedSubstance === med.toLowerCase() || med.toLowerCase() === normalizedSubstance)) {
      console.log(`"${substance}" appears to be a common medication. Skipping safety info.`);
      return null;
    }

    const substanceInfo = findSubstanceMatch(substance, substancesData);
    
    // Use our debug function to inspect the matched substance data
    debugSubstanceMatch(substance, substanceInfo);
    
    // Double-check that we have a meaningful match - if the normalized 
    // substance name is very different from the input, it's likely a false positive
    if (!substanceInfo) return null;
    
    // Additional validation: if we found a match but it's completely different from what was entered,
    // this is likely a false positive (like omeprazole -> flubromazolam)
    const substanceLower = substance.toLowerCase().trim();
    const matchNameLower = substanceInfo.name.toLowerCase();
    const matchPrettyNameLower = substanceInfo.pretty_name?.toLowerCase() || '';
    
    // Make sure the match isn't a completely different substance (no shared word segments)
    const nameSegments = substanceLower.split(/[\s-]+/);
    const anyWordSegmentMatches = nameSegments.some(segment => 
      (segment.length >= 3) && 
      (matchNameLower.includes(segment) || matchPrettyNameLower.includes(segment))
    );
    
    // If there's no word segment match and the names are significantly different lengths
    // (e.g., omeprazole vs. flubromazolam), reject the match
    const lengthDifference = Math.abs(substanceLower.length - matchNameLower.length);
    if (!anyWordSegmentMatches && lengthDifference > 3) {
      console.log(`Rejecting suspicious match: "${substance}" -> "${substanceInfo.name}"`);
      return null;
    }
    
    // Check if this substance has ANY actual safety data (not just an empty entry)
    // This is the root cause fix for omeprazole and other medications without safety info
    const hasAnyData = (
      (substanceInfo.formatted_effects && substanceInfo.formatted_effects.length > 0) ||
      (substanceInfo.properties?.effects && substanceInfo.properties.effects.trim().length > 0) ||
      (substanceInfo.formatted_duration) ||
      (substanceInfo.properties?.duration && substanceInfo.properties.duration.trim().length > 0) ||
      (substanceInfo.formatted_onset) ||
      (substanceInfo.properties?.onset && substanceInfo.properties.onset.trim().length > 0) ||
      (substanceInfo.properties?.avoid && substanceInfo.properties.avoid.trim().length > 0)
    );
    
    if (!hasAnyData) {
      console.log(`Substance "${substance}" has no meaningful safety data. Skipping safety card.`);
      return null;
    }

    // Normalize route name to match possible keys
    const normalizedRoute = route.charAt(0).toUpperCase() + route.slice(1).toLowerCase();
    const routeDoses = parseDoseInformation(substanceInfo, normalizedRoute);

    // For substances without dose information, only return data if we have real content
    if (!routeDoses) {
      const effects = substanceInfo.formatted_effects || 
                     (substanceInfo.properties?.effects?.split(',').map(e => e.trim())) || 
                     [];
      const safetyWarning = substanceInfo.properties?.avoid;
      
      // If we have no actual data, return null instead of placeholder text
      if (effects.length === 0 && !safetyWarning && !substanceInfo.properties?.duration && !substanceInfo.properties?.onset) {
        return null;
      }
      
      // We only want to return safety info if we have any actual data beyond just a generic message
      // This check ensures that empty safety data won't trigger a dialog
      if ((safetyWarning && safetyWarning.trim().length > 0) || 
          effects.length > 0 || 
          substanceInfo.properties?.duration || 
          substanceInfo.properties?.onset) {
        return {
          dosageGuidance: `No specific dosage information available for ${route} administration.`,
          safetyWarnings: safetyWarning ? [safetyWarning] : [],
          effects,
          duration: substanceInfo.properties?.duration ? `Duration: ${substanceInfo.properties.duration}` : undefined,
          onset: substanceInfo.properties?.onset ? `Onset: ${substanceInfo.properties.onset}` : undefined,
        };
      }
      
      // Otherwise return null to prevent empty safety dialogs
      return null;
    }

    const { currentTier, warning } = getDoseTierInfo(amount, routeDoses);
    // Collect genuine safety warnings, not placeholders
    const warnings = [];
    if (substanceInfo.properties?.avoid) warnings.push(substanceInfo.properties.avoid);
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
    
    // If we have no actual data, return null
    // We need an extra check for empty warnings/effects arrays to catch cases like omeprazole
    if (effects.length === 0 && warnings.length === 0 && !duration && !onset) {
      return null;
    }
    
    // Make sure our warning strings actually have content
    const validWarnings = warnings.filter(w => w && w.trim().length > 0);
    
    // And the effects array actually has items
    const validEffects = effects.filter(e => e && e.trim().length > 0);
    
    // If we have no real content, don't return anything
    if (validEffects.length === 0 && validWarnings.length === 0 && !duration && !onset) {
      return null;
    }

    return {
      dosageGuidance: `Current dose (${amount}${normalizeUnit('mg')}) is in the ${currentTier} range`,
      safetyWarnings: validWarnings,
      effects: validEffects,
      duration,
      onset,
    };
  } catch (error) {
    console.warn(`Error getting safety info for ${substance}:`, error);
    return null;
  }
}
