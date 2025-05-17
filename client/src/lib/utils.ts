import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Helper function to parse the drug name and extract main name and alternatives
 * @param drugName The drug name to parse (may contain alternatives in parentheses)
 * @returns Object with mainName and alternatives (null if none)
 */
export function parseDrugName(drugName: string): { mainName: string; alternatives: string | null } {
  // Check if there are alternative names in parentheses
  const match = drugName.match(/^(.*?)\s*\((.*?)\)$/);
  
  if (match) {
    return {
      mainName: match[1].trim(),
      alternatives: match[2].trim()
    };
  }
  
  // No alternatives found
  return {
    mainName: drugName,
    alternatives: null
  };
}
