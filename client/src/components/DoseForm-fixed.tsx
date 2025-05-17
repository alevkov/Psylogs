// Refactored DoseForm Component
import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Card, CardHeader, CardContent } from "./ui/card";
import { useToast } from "../hooks/use-toast";
import { Loader2, AlertCircle, Check, Info, Clock, Star, ChevronRight } from "lucide-react";
import { useDoseContext } from "../contexts/DoseContext";
import { DoseRangeVisual } from "./DoseRangeVisual";
import { SafetyInfoDialog } from "./SafetyInfoDialog";

// Import data and utilities
import { parseDoseString } from "../lib/dose-parser";
import { addDose, getDoses } from "../lib/db";
import { ADMINISTRATION_METHODS, DoseEntry } from "../lib/constants";
import { analyzeDoseTier } from "../lib/dose-tiers.types";
import { getSubstanceSafetyInfo } from "../lib/substance-safety";
import { analyzePersonalPatterns } from "../lib/analysis";
import articleData from "../lib/articles_refined.json";

// Form schema
const formSchema = z.object({
  doseString: z.string().min(1, "Please enter a dose"),
});

// Base common substances for suggestions
const BASE_SUBSTANCES = [
  "acetaminophen",
  "ibuprofen",
  "aspirin",
  "amoxicillin",
  "omeprazole",
  // Adding popular recreational substances to improve suggestions
  "amphetamine",
  "cannabis",
  "caffeine",
  "mdma",
  "alcohol",
  "lsd",
  "psilocybin",
  "ketamine",
  "cocaine"
];

// Types
interface ParseError {
  type: "format" | "amount" | "route" | "unit" | "substance" | "unknown";
  message: string;
  suggestion?: string;
  example?: string;
}

interface SuggestionItem {
  text: string;
  type: "recent" | "common" | "frequent" | "pattern";
  icon?: React.ReactNode;
}

interface ParsedDose {
  substance: string;
  amount: number;
  unit: string;
  route: string;
}

interface TierAnalysisResult {
  tier: string;
  analysis: string;
  ranges?: {
    threshold?: number;
    light?: { lower: number; upper: number };
    common?: { lower: number; upper: number };
    strong?: { lower: number; upper: number };
    heavy?: number;
  };
}

interface SafetyInfoResult {
  dosageGuidance: string;
  safetyWarnings: string[];
  effects: string[];
  duration?: string;
  onset?: string;
}

// Helper functions

// Normalize substance name for matching
function normalizeSubstanceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s]+/g, "")
    .replace(/[^a-z0-9,\.-]/g, "");
}

// Create a substance suggestion item with consistent lowercase display
function createSubstanceSuggestion(
  substance: string, 
  recentSubstances: string[], 
  frequentSubstances: string[]
): SuggestionItem {
  // Always ensure lowercase text for consistency
  const normalizedSubstance = substance.toLowerCase();
  
  const suggestionItem: SuggestionItem = {
    text: normalizedSubstance,
    type: "common",
    icon: undefined,
  };

  if (recentSubstances.includes(substance)) {
    suggestionItem.type = "recent";
    suggestionItem.icon = <Clock className="w-4 h-4" />;
  } else if (frequentSubstances.includes(substance)) {
    suggestionItem.type = "frequent";
    suggestionItem.icon = <Star className="w-4 h-4" />;
  }

  return suggestionItem;
}

// Fuzzy match function for substance names
function fuzzyMatch(query: string, substance: string): number {
  try {
    if (!query || !substance) return 0;
    
    // Always normalize to lowercase and trim whitespace
    query = query.toLowerCase().trim();
    substance = substance.toLowerCase().trim();
    
    // Exact match - highest score
    if (substance === query) return 10;
    
    // Prefix match gets high priority  
    if (substance.startsWith(query)) return 8;
    
    // Handle dash variations (e.g., "2fdck" vs "2f-dck")
    const queryNoDashes = query.replace(/-/g, "");
    const substanceNoDashes = substance.replace(/-/g, "");
    
    // Exact match with dashes removed
    if (substanceNoDashes === queryNoDashes) return 9;
    
    // Prefix match with dashes removed
    if (substanceNoDashes.startsWith(queryNoDashes)) return 7;
    
    // Contains match
    if (substance.includes(query)) return 6;
    
    // Contains match with dashes removed
    if (substanceNoDashes.includes(queryNoDashes)) return 5;
    
    // Word boundary match
    const words = substance.split(/\s+/);
    if (words.some(word => word.startsWith(query))) return 4;
    
    // Character matching for partial matches
    let score = 0;
    const queryChars = query.split("");
    let lastFoundIndex = -1;

    for (const char of queryChars) {
      const index = substance.indexOf(char, lastFoundIndex + 1);
      if (index === -1) return 0;
      
      // Avoid division by zero if index is the first character
      const positionValue = lastFoundIndex >= 0 ? 1 / (index - lastFoundIndex) : 1;
      score += positionValue;
      lastFoundIndex = index;
    }

    // Convert to a 0-3 range score
    let partialScore = queryChars.length > 0 ? score / queryChars.length : 0;
    partialScore = Math.min(3, partialScore * 3);  
    
    return partialScore;
  } catch (error) {
    console.warn("Error calculating fuzzy score:", error);
    return 0; // Return 0 score on error
  }
}

// Get detailed error information based on the error and input
function getErrorDetails(error: Error, input: string): ParseError | null {
  const message = error.message.toLowerCase();
  const words = input.trim().split(/\s+/);

  // Don't show errors while user is still typing if following valid patterns
  if (words.length < 3) {
    // Check if starting with @ format
    if (words[0]?.startsWith("@")) {
      const validPrefix = /^@[a-z]+$/i.test(words[0]); // Valid @ command
      if (validPrefix) return null;

      return {
        type: "format",
        message: "Invalid shorthand format",
        suggestion: "Start with @ followed by action, amount, and substance",
        example: "Example: @ate 30mg substance",
      };
    }

    // Check if starting with amount format
    const amountPattern = /^\d+\.?\d*(mg|g|ug|ml)?$/i;
    if (words[0] && amountPattern.test(words[0])) {
      return null; // Valid amount pattern, still typing
    }
  }

  // Only show format error when they've typed enough to make a judgment
  if (words.length >= 3 && message.includes("invalid dose string format")) {
    return {
      type: "format",
      message: "Format not recognized",
      suggestion:
        "Use either: amount + unit + substance + route OR @action + amount + substance",
      example:
        "Examples:\n200mg caffeine oral\n4mg diaz oral\n20mg 4-mph nasal\n@ate 30mg 1,4-bdo",
    };
  }

  if (message.includes("amount must be")) {
    return {
      type: "amount",
      message: "Invalid amount",
      suggestion: "Enter a positive number",
      example: "Examples: 20, 0.5, 100",
    };
  }

  if (message.includes("unknown route") && words.length >= 3) {
    return {
      type: "route",
      message: "Route not recognized",
      suggestion: "Use one of the standard administration routes",
      example: "Common routes: oral, nasal, inhaled, injected",
    };
  }

  if (message.includes("unknown unit") && words.length >= 2) {
    return {
      type: "unit",
      message: "Unit not recognized",
      suggestion: "Use a standard unit of measurement",
      example: "Valid units: mg, g, ug, ml",
    };
  }

  // Only show unknown error if they've completed typing
  if (words.length >= 3) {
    return {
      type: "unknown",
      message: "Something's not quite right",
      suggestion: "Check that your input follows one of these formats:",
      example:
        "1. amount + unit + substance + route\n2. @action + amount + substance",
    };
  }

  return null; // Don't show error while still typing
}

// Get the format of a dose string
function getDoseFormat(input: string): "standard" | "command" | null {
  const words = input.trim().split(/\s+/);
  if (words[0]?.startsWith("@")) return "command";
  if (words[0]?.match(/^\d+\.?\d*/)) return "standard";
  return null;
}

// Check if a string has a valid dose unit prefix
function isValidDoseUnitPrefix(input: string): boolean {
  return /^\d+\.?\d*[mug]?$/i.test(input);
}

// Check if a string has a complete dose unit
function isCompleteDoseUnit(input: string): boolean {
  return /^\d+\.?\d*(mg|g|ug|ml)$/i.test(input);
}

// Helper function to parse the drug name and extract main name and alternatives
// This is duplicated from substances.tsx to use in DoseForm
function parseDrugName(drugName: string): { mainName: string; alternatives: string | null } {
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

// Try to analyze dose tier, returning null if not possible
function tryGetTierAnalysis(
  substance: string,
  method: string,
  dose: number,
  unit: string,
  doseData: any,
): TierAnalysisResult | null {
  try {
    // First try to find the substance exactly as entered
    let result = analyzeDoseTier(substance, method, dose, unit, doseData);
    
    // If no result, try normalizing the substance name
    if (!result.tier && substance) {
      // Extract drug data from the article data
      const drugEntries = doseData
        .filter((article: any) => article?.drug_info?.routes_of_administration_parsed)
        .map((article: any) => {
          const drugName = article.drug_info.drug_name || '';
          const { mainName, alternatives } = parseDrugName(drugName);
          
          // Create an array of all possible names for this drug
          const allNames = [mainName];
          if (alternatives) {
            allNames.push(...alternatives.split(', '));
          }
          
          return {
            drugName: mainName,
            allNames,
            routesData: article.drug_info.routes_of_administration_parsed
          };
        });
      
      // Try to find a match using enhanced fuzzy matching on all possible names
      const normalizedSubstance = substance.toLowerCase().trim();
      
      // First look for exact matches
      let matchedDrug = drugEntries.find((drug: any) => {
        return drug.allNames.some((name: string) => {
          const normalizedName = name.toLowerCase().trim();
          return normalizedName === normalizedSubstance;
        });
      });
      
      // If no exact match, look for higher-quality fuzzy matches
      if (!matchedDrug) {
        // Score each drug and store [drug, score] pairs
        const scoredDrugs = drugEntries.map((drug: any) => {
          // Find the best match among all names for this drug
          const bestScore = Math.max(...drug.allNames.map((name: string) => {
            return fuzzyMatch(normalizedSubstance, name);
          }));
          
          return [drug, bestScore];
        });
        
        // Sort by score (highest first) and take the best match if score is high enough
        scoredDrugs.sort((a: any, b: any) => b[1] - a[1]);
        
        // Get the best match if score is at least 4 (word boundary match or better)
        if (scoredDrugs.length > 0 && scoredDrugs[0][1] >= 4) {
          matchedDrug = scoredDrugs[0][0];
          console.log(`Found fuzzy match for '${substance}' with score ${scoredDrugs[0][1]}`);
        } else {
          console.log(`No match found for: ${substance}`);
        }
      }
      
      if (matchedDrug) {
        console.log(`Found substance match: ${substance} -> ${matchedDrug.drugName}`);
        
        // Find the matching route data
        const routeData = matchedDrug.routesData?.[method];
        if (routeData) {
          // Extract dose ranges and create a synthetic SubstanceData object
          const doseRanges = JSON.stringify(routeData.dose_ranges || {})
            .replace(/"/g, "'");
          
          const syntheticData = [{
            drug: matchedDrug.drugName,
            method: method,
            dose_ranges: doseRanges
          }];
          
          console.log(`Using synthetic dose data for ${matchedDrug.drugName} via ${method}`);
          return analyzeDoseTier(matchedDrug.drugName, method, dose, unit, syntheticData);
        }
      }
    }
    
    return result;
  } catch (error) {
    console.log("Tier analysis error:", error);
    return null;
  }
}

// Get badge variant based on tier
function getTierBadgeVariant(tier: string): string {
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

// Component: ParseErrorDisplay - Shows formatted parse errors
const ParseErrorDisplay = ({ error }: { error: ParseError }) => (
  <motion.div
    initial={{ opacity: 0, y: -5 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -5 }}
    className="bg-destructive/5 rounded-lg p-3 text-sm space-y-2"
  >
    <div className="flex items-start gap-2">
      <Info className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
      <div className="space-y-1 flex-grow">
        <p className="font-medium text-destructive">{error.message}</p>
        {error.suggestion && (
          <p className="text-muted-foreground">{error.suggestion}</p>
        )}
        {error.example && (
          <p className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
            {error.example}
          </p>
        )}
      </div>
    </div>
  </motion.div>
);

// Component: SuggestionList - Shows clickable suggestions
const SuggestionList = ({
  suggestions,
  onSelect,
}: {
  suggestions: SuggestionItem[];
  onSelect: (suggestion: SuggestionItem) => void;
}) => (
  <motion.div
    initial={{ opacity: 0, y: -5 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -5 }}
    className="mb-2 flex flex-wrap gap-1"
  >
    {suggestions.map((suggestion, index) => (
      <motion.div
        key={`${suggestion.text}-${index}`}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05 }}
      >
        <button
          className={`
            inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium
            ${
              suggestion.type === "recent"
                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                : suggestion.type === "frequent"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                : suggestion.type === "pattern"
                ? "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300"
                : "bg-muted text-muted-foreground"
            }
            hover:bg-muted/80 transition-colors
          `}
          onClick={() => onSelect(suggestion)}
          type="button"
        >
          {suggestion.icon && <span>{suggestion.icon}</span>}
          <span>{suggestion.text}</span>
        </button>
      </motion.div>
    ))}
  </motion.div>
);

// Component: DosePreview - Shows the parsed dose information
const DosePreview = ({ parsedDose }: { parsedDose: ParsedDose }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mb-1 px-3 py-1 border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900/50 rounded text-sm flex items-center justify-between"
    >
      <div className="flex gap-1 items-center">
        <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
        <p className="text-green-800 dark:text-green-300">
          <span className="font-medium">{parsedDose.amount}{parsedDose.unit}</span>{" "}
          <span className="font-mono">{parsedDose.substance.toLowerCase()}</span>{" "}
          <span className="text-muted-foreground">via {parsedDose.route}</span>
        </p>
      </div>
    </motion.div>
  );
};

// Component: DoseAnalysis - Shows dose tier analysis information
const DoseAnalysis = ({
  parsedDose,
  tierAnalysis,
  safetyInfo,
}: {
  parsedDose: ParsedDose;
  tierAnalysis: TierAnalysisResult | null;
  safetyInfo: SafetyInfoResult;
}) => {
  const [showSafetyInfo, setShowSafetyInfo] = useState(false);

  if (!tierAnalysis) {
    return (
      <div className="text-sm text-muted-foreground mt-1">
        No dose analysis available for this combination.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-2"
    >
      <div className="flex items-center gap-2 mb-2">
        <Badge variant={getTierBadgeVariant(tierAnalysis.tier)}>
          {tierAnalysis.tier}
        </Badge>
        {tierAnalysis.analysis && (
          <p className="text-sm text-muted-foreground">{tierAnalysis.analysis}</p>
        )}
      </div>

      {tierAnalysis.ranges && (
        <DoseRangeVisual
          ranges={tierAnalysis.ranges}
          currentDose={parsedDose.amount}
          unit={parsedDose.unit}
        />
      )}

      <div className="flex justify-between items-center mt-3">
        <button
          type="button"
          onClick={() => setShowSafetyInfo(true)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          View safety information
        </button>
      </div>

      <SafetyInfoDialog
        safetyInfo={safetyInfo}
        substance={parsedDose.substance}
        open={showSafetyInfo}
        onOpenChange={setShowSafetyInfo}
      />
    </motion.div>
  );
};

// Custom hook for dose parsing and analysis
function useDoseParsing(doseString: string) {
  const [previewParse, setPreviewParse] = useState<ParsedDose | null>(null);
  const [parseError, setParseError] = useState<ParseError | null>(null);
  const [tierAnalysis, setTierAnalysis] = useState<TierAnalysisResult | null>(
    null
  );
  const [safetyInfo, setSafetyInfo] = useState<SafetyInfoResult>({
    dosageGuidance: "",
    safetyWarnings: [],
    effects: [],
  });

  useEffect(() => {
    try {
      // Only attempt to parse if we have at least 3 words (completed input)
      const words = doseString.trim().split(/\s+/);
      if (words.length < 3) {
        setPreviewParse(null);
        setParseError(null);
        setTierAnalysis(null);
        return;
      }

      // Try to parse the dose string
      const parsed = parseDoseString(doseString);
      setPreviewParse(parsed);
      
      console.log("Successfully parsed dose:", parsed);

      // Get tier analysis using article data
      const analysis = tryGetTierAnalysis(
        parsed.substance,
        parsed.route,
        parsed.amount,
        parsed.unit,
        articleData
      );
      
      console.log("Tier analysis:", analysis);
      setTierAnalysis(analysis);

      // Get safety information
      const safety = getSubstanceSafetyInfo(parsed.substance);
      setSafetyInfo(safety);

      // Clear any existing error
      setParseError(null);
    } catch (error: any) {
      // Only show error details if the dose string has content
      if (doseString.trim()) {
        const errorDetails = getErrorDetails(error, doseString);
        setParseError(errorDetails);
      } else {
        setParseError(null);
      }

      // Clear the preview if parsing failed
      setPreviewParse(null);
      setTierAnalysis(null);
    }
  }, [doseString]);

  return { previewParse, parseError, tierAnalysis, safetyInfo };
}

// Custom hook for providing suggestions based on dose string
function useSuggestions(
  doseString: string,
  recentSubstances: string[],
  frequentSubstances: string[]
) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [parseError, setParseError] = useState<ParseError | null>(null);
  const [databaseSubstances, setDatabaseSubstances] = useState<string[]>([]);

  // On first load, extract substances from the database for suggestions
  useEffect(() => {
    try {
      const substances = new Set<string>();
      
      // Extract substance names from article data
      articleData.forEach((article: any) => {
        if (article?.drug_info?.drug_name) {
          const { mainName, alternatives } = parseDrugName(article.drug_info.drug_name);
          
          // Add the main name (normalized to lowercase)
          substances.add(mainName.toLowerCase());
          
          // Add alternatives if they exist (normalized to lowercase)
          if (alternatives) {
            alternatives.split(', ').forEach((alt: string) => {
              substances.add(alt.toLowerCase());
            });
          }
        }
      });
      
      setDatabaseSubstances(Array.from(substances));
      console.log(`Loaded ${substances.size} substances from database`);
    } catch (err) {
      console.error("Error extracting substances from database:", err);
    }
  }, []);

  useEffect(() => {
    // Log detailed information at each suggestion change
    console.log("Suggestion hook input:", { 
      doseString, 
      recentSubstances, 
      frequentSubstances,
      words: doseString.trim().split(/\s+/),
      wordCount: doseString.trim().split(/\s+/).length,
      endsWithSpace: doseString.endsWith(" ")
    });
    
    if (!doseString.trim()) {
      setSuggestions([]);
      setParseError(null);
      return;
    }

    const words = doseString.trim().split(/\s+/);
    const lastWord = words[words.length - 1];
    const format = getDoseFormat(doseString);

    // Handle command format suggestions (@command)
    if (format === "command") {
      // Handle @command suggestions
      if (words[0] === "@" && words.length === 1) {
        const methodSuggestions = Object.values(ADMINISTRATION_METHODS)
          .flat()
          .filter((r) => r.startsWith("@"))
          .map((text) => ({ text, type: "common" as const }))
          .slice(0, 5);
        setSuggestions(methodSuggestions);
        setParseError(null);
        return;
      }

      // Handle third word (substance) suggestions
      if (words.length === 3 && lastWord.length > 1) {
        // Smart substance suggestions
        const allSubstances = Array.from(
          new Set([
            ...recentSubstances,
            ...frequentSubstances,
            ...BASE_SUBSTANCES,
          ]),
        );

        const matchedSubstances = allSubstances
          .map((substance) => ({
            substance,
            score: fuzzyMatch(lastWord, substance),
          }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ substance }) => createSubstanceSuggestion(substance, recentSubstances, frequentSubstances));

        setSuggestions(matchedSubstances);
        setParseError(null);
        return;
      }
    }
    // Handle standard format suggestions (amount unit substance route)
    else if (format === "standard") {
      
      // Handle substance suggestions
      if (words.length === 2 && lastWord.length > 0) {
        // If the lastWord is a valid substance and no space is typed after it,
        // show substance suggestions
        const allSubstances = Array.from(
          new Set([
            ...recentSubstances,
            ...frequentSubstances,
            ...databaseSubstances, // Use database substances for better suggestions
            ...BASE_SUBSTANCES,
          ]),
        );

        // Check if we've completed typing a known substance
        const exactSubstanceMatch = allSubstances.find(
          substance => substance.toLowerCase() === lastWord.toLowerCase()
        );

        // If we have an exact match and the input doesn't end with a space yet,
        // encourage adding a space by showing common routes
        if (exactSubstanceMatch && !doseString.endsWith(" ")) {
          console.log("Exact substance match found", exactSubstanceMatch);
          // Show a special helper to add a space and continue
          setSuggestions([{
            text: exactSubstanceMatch.toLowerCase() + " ", // Always lowercase
            type: "common",
            icon: <ChevronRight className="w-4 h-4" />
          }]);
          setParseError(null);
          return;
        }

        const matchedSubstances = allSubstances
          .map((substance) => ({
            substance,
            score: fuzzyMatch(lastWord, substance),
          }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ substance }) => createSubstanceSuggestion(substance, recentSubstances, frequentSubstances));

        setSuggestions(matchedSubstances);
        setParseError(null);
        return;
      }

      // Handle route suggestions - this is the most important section
      // Show suggestions when user is typing the third word (route)
      if (words.length === 3 || (words.length === 2 && doseString.endsWith(" "))) {
        // If user has typed 2 words and a space, they're ready for route suggestions
        // even before they start typing the third word
        const isStartingThirdWord = words.length === 2 && doseString.endsWith(" ");
        const effectiveLastWord = isStartingThirdWord ? "" : lastWord;
        
        // Add debug output to help troubleshoot route suggestion issues
        console.log("Route suggestion context:", { 
          words, 
          lastWord, 
          isStartingThirdWord, 
          effectiveLastWord,
          doseString,
          wordCount: words.length
        });
        
        // Always force suggestions for third word (route) situations
        // This is the critical part of the fix - we force route suggestions
        // no matter what the parsing result might be
        
        // Get all available administration routes
        const allRoutes = Object.values(ADMINISTRATION_METHODS).flat();
        
        // Filter out @ commands (those are for command format)
        let routesToShow = allRoutes.filter(r => !r.startsWith("@"));
        
        // Define the common routes to prioritize
        const commonRoutes = [
          "oral",
          "sublingual", 
          "nasal",
          "inhaled", 
          "injected",
          "rectal",
          "smoked"
        ];
        
        // If user has started typing, filter routes by what they've typed so far
        if (effectiveLastWord) {
          const input = effectiveLastWord.toLowerCase();
          
          // Only match by prefix (the first N letters)
          // This is the key fix - we want to show all routes that START with the letters typed
          routesToShow = routesToShow.filter(route => {
            const routeLower = route.toLowerCase();
            // Primary match: does route start with what user typed
            return routeLower.startsWith(input);
          });
          
          console.log(`Filtered ${routesToShow.length} matching routes for input: "${effectiveLastWord}"`);
          
          // Sort with priority: exact matches, then starts-with, then includes
          routesToShow.sort((a, b) => {
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            const input = effectiveLastWord.toLowerCase();
            
            // Exact matches first
            if (aLower === input && bLower !== input) return -1;
            if (bLower === input && aLower !== input) return 1;
            
            // Then common routes
            const aIsCommon = commonRoutes.includes(a);
            const bIsCommon = commonRoutes.includes(b);
            if (aIsCommon && !bIsCommon) return -1;
            if (!aIsCommon && bIsCommon) return 1;
            
            // Then starts-with matches
            const aStarts = aLower.startsWith(input);
            const bStarts = bLower.startsWith(input);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            
            // Finally sort by length (shorter first)
            return a.length - b.length;
          });
        } else {
          // If they haven't started typing yet, just show common routes first
          routesToShow.sort((a, b) => {
            const aIsCommon = commonRoutes.includes(a);
            const bIsCommon = commonRoutes.includes(b);
            if (aIsCommon && !bIsCommon) return -1;
            if (!aIsCommon && bIsCommon) return 1;
            return a.length - b.length;
          });
        }
        
        // This special case is no longer needed since we fixed the prefix matching above
        
        // Convert to suggestion items and limit to avoid UI clutter
        const routeSuggestions = routesToShow
          .slice(0, 6)
          .map(text => ({ text, type: "common" as const }));
          
        if (routeSuggestions.length > 0) {
          console.log("Setting route suggestions:", routeSuggestions);
          setSuggestions(routeSuggestions);
          setParseError(null);
        } else {
          // If no routes match what user typed, show default common routes
          const defaultRoutes = [
            "oral",
            "sublingual",
            "nasal", 
            "inhaled",
            "injected",
            "rectal"
          ].map(text => ({ text, type: "common" as const }));
          
          console.log("No matching routes, showing defaults");
          setSuggestions(defaultRoutes);
          setParseError(null);
        }
        return;
      }
    }

    // Clear suggestions for other cases
    setSuggestions([]);
    setParseError(null);
  }, [doseString, recentSubstances, frequentSubstances, databaseSubstances]);

  return { suggestions, parseError };
}

// Main component with proper error handling
export function DoseForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [recentSubstances, setRecentSubstances] = useState<string[]>([]);
  const [frequentSubstances, setFrequentSubstances] = useState<string[]>([]);

  const { toast } = useToast();
  const { triggerUpdate } = useDoseContext();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      doseString: "",
    },
  });

  const doseString = form.watch("doseString") || "";

  // Use custom hooks for parsing and suggestions
  const {
    previewParse,
    parseError: parsingError,
    tierAnalysis,
    safetyInfo,
  } = useDoseParsing(doseString);

  const { suggestions, parseError: suggestionError } = useSuggestions(
    doseString,
    recentSubstances,
    frequentSubstances,
  );

  const parseError = parsingError || suggestionError;

  // Load recent and frequent substances on mount
  useEffect(() => {
    async function loadUserData() {
      try {
        // Get recent doses from DB
        const doses = await getDoses({ limit: 100 });

        // Analyze for personal patterns
        const patterns = analyzePersonalPatterns(doses);

        // Recent substances (most recent first)
        const recentSubs = [...doses]
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          )
          .slice(0, 10)
          .map((d) => d.substance.toLowerCase()); // Force lowercase

        // Most frequently used substances
        const freqSubs = patterns
          .sort((a, b) => {
            const aRecent = a.recentTrends.avgDailyDose || 0;
            const bRecent = b.recentTrends.avgDailyDose || 0;
            return bRecent - aRecent;
          })
          .slice(0, 5)
          .map((p) => p.substance.toLowerCase()); // Force lowercase

        setRecentSubstances(Array.from(new Set(recentSubs)));
        setFrequentSubstances(Array.from(new Set(freqSubs)));
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    }
    loadUserData();
  }, []);

  // Submit handler for the form with error handling
  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (!previewParse) {
      toast({
        title: "Invalid dose format",
        description: "Please enter a valid dose in the format: '100mg cannabis oral'",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitStatus("idle");
      
      // Create dose entry
      const parsed = previewParse;
      const newDose: DoseEntry = {
        substance: parsed.substance,
        amount: parsed.amount,
        unit: parsed.unit as any,
        route: parsed.route,
        timestamp: new Date().toISOString(),
      };

      // Add to database
      await addDose(newDose);
      setSubmitStatus("success");
      
      // Add to recent substances
      setRecentSubstances((prev) => {
        const updated = [parsed.substance.toLowerCase(), ...prev]; // Force lowercase
        return Array.from(new Set(updated)).slice(0, 10);
      });

      // Reset form
      form.reset();
      // Trigger parent update (if any)
      triggerUpdate();

      // Show success toast
      toast({
        title: navigator.onLine
          ? "Dose logged successfully"
          : "Dose queued for sync",
        description: navigator.onLine
          ? undefined
          : "Will be synced when you're back online",
        duration: 2000,
        variant: "success",
      });
    } catch (error) {
      setSubmitStatus("error");
      toast({
        title: "Error logging dose",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitStatus("idle"), 2000);
    }
  };

  // Function to apply a suggestion when clicked
  const applySuggestion = (suggestion: SuggestionItem) => {
    if (!doseString) return;
    
    const words = doseString.split(" ");
    const wordCount = words.filter(w => w.trim()).length;
    let newValue = "";
    
    // If this is a substance suggestion (second word), add a space to trigger route suggestions
    if (wordCount === 2 && words.length >= 2) {
      words[words.length - 1] = suggestion.text;
      newValue = words.join(" ") + " "; // Add space to prepare for route input
      form.setValue("doseString", newValue);
    } else if (wordCount === 3 && words.length >= 3) {
      // This is a route suggestion (third word) - apply it to complete the dose
      words[words.length - 1] = suggestion.text;
      newValue = words.join(" ");
      
      // Update the input value
      form.setValue("doseString", newValue);
      
      // Check if this is a valid exact route match
      const isExactRouteMatch = Object.values(ADMINISTRATION_METHODS)
        .flat()
        .some(route => 
          !route.startsWith("@") && 
          route.toLowerCase() === suggestion.text.toLowerCase()
        );
        
      if (isExactRouteMatch) {
        console.log("Applied exact route match:", suggestion.text);
        
        // Immediately try to parse the dose to update the UI
        try {
          const parsedDose = parseDoseString(newValue);
          console.log("Auto-parsed dose after route selection:", parsedDose);
          
          // Force a form validation check to update the UI
          form.trigger("doseString");
        } catch (error) {
          console.log("Could not auto-parse after route selection:", error);
        }
      }
    } else {
      words[words.length - 1] = suggestion.text;
      newValue = words.join(" ");
      form.setValue("doseString", newValue);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="w-full max-w-md mx-auto shadow-md border-0 overflow-hidden bg-gradient-to-br from-white to-secondary/20 dark:from-background dark:to-secondary/5">
        <CardContent className={!previewParse ? "pt-6" : "pt-4"}>
          <div className="space-y-4">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    placeholder="e.g. 200mg caffeine oral"
                    {...form.register("doseString")}
                    className={`w-full pr-10 transition-all placeholder:text-xs 
                      placeholder:text-muted-foreground/40 ${
                        previewParse
                          ? "!border-green-400 dark:!border-green-500/70 focus-visible:ring-green-400 dark:focus-visible:ring-green-500"
                          : ""
                      }`}
                  />
                </div>

                <AnimatePresence mode="wait">
                  {suggestions.length > 0 && (
                    <SuggestionList
                      suggestions={suggestions}
                      onSelect={applySuggestion}
                    />
                  )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                  {parseError && <ParseErrorDisplay error={parseError} />}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                  {previewParse && !parseError && (
                    <DosePreview parsedDose={previewParse} />
                  )}
                </AnimatePresence>
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: previewParse ? 1 : 0.5 }}
                className="text-right"
              >
                <Button
                  disabled={isSubmitting || !previewParse}
                  className={`w-full ${
                    submitStatus === "success"
                      ? "bg-green-600 hover:bg-green-700"
                      : submitStatus === "error"
                      ? "bg-red-600 hover:bg-red-700"
                      : ""
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Logging dose...
                    </>
                  ) : submitStatus === "success" ? (
                    <>
                      <Check className="mr-2 h-4 w-4" /> Dose logged
                    </>
                  ) : submitStatus === "error" ? (
                    <>
                      <AlertCircle className="mr-2 h-4 w-4" /> Error
                    </>
                  ) : (
                    "Log Dose"
                  )}
                </Button>
              </motion.div>
            </form>

            <AnimatePresence>
              {previewParse && tierAnalysis && (
                <DoseAnalysis
                  parsedDose={previewParse}
                  tierAnalysis={tierAnalysis}
                  safetyInfo={safetyInfo}
                />
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}