import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { parseDoseString } from "../lib/dose-parser";
import { addDose, getDoses } from "../lib/db";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useToast } from "../hooks/use-toast";
import { Card, CardHeader, CardContent } from "./ui/card";
import { ADMINISTRATION_METHODS, DoseEntry } from "../lib/constants";
import {
  Loader2,
  AlertCircle,
  Check,
  Info,
  Clock,
  Star,
  AlertTriangle,
  Activity,
  ChevronDown,
} from "lucide-react";
import { useDoseContext } from "../contexts/DoseContext";
import { Badge } from "./ui/badge";
import { analyzePersonalPatterns } from "../lib/analysis";
import doseData from "../lib/dose_tiers_with_timelines.json";
import {
  analyzeDoseTier,
  getTierBadgeVariant,
  SubstanceData,
} from "../lib/dose-tiers.types";
import { getSubstanceSafetyInfo } from "../lib/substance-safety";
import { SubstanceData as SafetySubstanceData } from "../lib/substance-safety";
// @ts-ignore - Ignoring type mismatch for this imported JSON data
import substanceData from "../lib/substance-data.json";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { DoseRangeVisual } from "./DoseRangeVisual";
import { SafetyInfoDialog } from "./SafetyInfoDialog";

function normalizeSubstanceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s]+/g, "") // Remove dashes, underscores, spaces
    .replace(/[^a-z0-9,\.-]/g, ""); // Remove special characters except commas, periods, dashes and numbers
}

function findMatchingSubstance(
  userSubstance: string,
  doseData: any,
): string | null {
  if (!userSubstance || userSubstance.length < 2 || !doseData) {
    return null;
  }

  const normalizedInput = normalizeSubstanceName(userSubstance);
  if (!normalizedInput) return null;

  // First try exact match - highest priority
  const exactMatch = Object.keys(doseData).find(
    (substance) => normalizeSubstanceName(substance) === normalizedInput,
  );
  if (exactMatch) return exactMatch;

  // Try prefix match for abbreviated names (like "diaz" for "diazepam")
  // This should be higher priority than general contains match
  if (normalizedInput.length >= 3) {
    const prefixMatch = Object.keys(doseData).find((substance) => {
      const normalizedSubstance = normalizeSubstanceName(substance);
      // Check if normalizedInput is the start of a substance name (prefix match)
      return normalizedSubstance.startsWith(normalizedInput);
    });
    if (prefixMatch) return prefixMatch;
  }

  // Only do a contains match if the input is substantial (4+ chars)
  // to avoid matching "am" to "amphetamine" or other false positives
  if (normalizedInput.length >= 4) {
    // Try a strict contains match (only match if the substance contains the input)
    // We don't want to match if the input contains the substance (which can lead to bad matches)
    const substanceContainsInput = Object.keys(doseData).find((substance) => {
      const normalizedSubstance = normalizeSubstanceName(substance);
      return normalizedSubstance.includes(normalizedInput);
    });
    if (substanceContainsInput) return substanceContainsInput;
  }

  // No match found
  return null;
}

export function tryGetTierAnalysis(
  substance: string,
  method: string,
  dose: number,
  unit: string,
  doseData: SubstanceData[],
): { tier: string; analysis: string; ranges?: any } | null {
  try {
    return analyzeDoseTier(substance, method, dose, unit, doseData);
  } catch (error) {
    console.log(error);
    return null;
  }
}

const formSchema = z.object({
  doseString: z.string().min(1, "Please enter a dose"),
});

// Base common substances
const BASE_SUBSTANCES = [
  "acetaminophen",
  "ibuprofen",
  "aspirin",
  "amoxicillin",
  "omeprazole",
];

interface ParseError {
  type: "format" | "amount" | "route" | "unit" | "substance" | "unknown";
  message: string;
  suggestion?: string;
  example?: string;
}

// Fuzzy match function for substance names
function fuzzyMatch(query: string, substance: string): number {
  query = query.toLowerCase();
  substance = substance.toLowerCase();

  if (substance.startsWith(query)) return 2; // Prefix match gets highest priority
  if (substance.includes(query)) return 1; // Contains match gets medium priority

  let score = 0;
  const queryChars = query.split("");
  let lastFoundIndex = -1;

  for (const char of queryChars) {
    const index = substance.indexOf(char, lastFoundIndex + 1);
    if (index === -1) return 0;
    score += 1 / (index - lastFoundIndex);
    lastFoundIndex = index;
  }

  return score / queryChars.length;
}

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

interface SuggestionItem {
  text: string;
  type: "recent" | "common" | "frequent" | "pattern";
  icon?: React.ReactNode;
}

export function DoseForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewParse, setPreviewParse] = useState<{
    substance: string;
    amount: number;
    unit: string;
    route: string;
  } | null>(null);
  const [parseError, setParseError] = useState<ParseError | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [recentSubstances, setRecentSubstances] = useState<string[]>([]);
  const [frequentSubstances, setFrequentSubstances] = useState<string[]>([]);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const { toast } = useToast();
  const { triggerUpdate } = useDoseContext();

  const [tierAnalysis, setTierAnalysis] = useState<{
    tier: string;
    analysis: string;
    ranges?: {
      threshold?: number;
      light?: { lower: number; upper: number };
      common?: { lower: number; upper: number };
      strong?: { lower: number; upper: number };
      heavy?: number;
    };
  } | null>(null);

  const [safetyInfo, setSafetyInfo] = useState<{
    dosageGuidance: string;
    safetyWarnings: string[];
    effects: string[];
    duration?: string;
    onset?: string;
  } | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      doseString: "",
    },
  });

  // Load historical data on mount
  useEffect(() => {
    const loadHistoricalData = async () => {
      try {
        const dosesData = await getDoses();
        const dosesArray = dosesData.doses || [];
        const patterns = analyzePersonalPatterns(dosesArray);

        // Get recent substances (last 5 unique)
        const recent = Array.from(
          new Set(
            dosesArray
              .sort(
                (a: DoseEntry, b: DoseEntry) =>
                  new Date(b.timestamp).getTime() -
                  new Date(a.timestamp).getTime(),
              )
              .map((d: DoseEntry) => d.substance),
          ),
        ).slice(0, 5);

        // Get most frequent substances
        const frequent = patterns
          .sort(
            (a, b) =>
              (b.recentTrends.avgDailyDose || 0) -
              (a.recentTrends.avgDailyDose || 0),
          )
          .map((p) => p.substance)
          .slice(0, 5);

        setRecentSubstances(recent as string[]);
        setFrequentSubstances(frequent);
      } catch (error) {
        console.error("Error loading historical data:", error);
      }
    };

    loadHistoricalData();
  }, []);

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    setSubmitStatus("idle");
    try {
      const parsed = parseDoseString(data.doseString);
      await addDose(parsed);
      form.reset();
      setSubmitStatus("success");
      triggerUpdate();
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

  function getDoseFormat(input: string): "standard" | "command" | null {
    const words = input.trim().split(/\s+/);
    if (words[0]?.startsWith("@")) return "command";
    if (words[0]?.match(/^\d+\.?\d*/)) return "standard";
    return null;
  }

  function isValidDoseUnitPrefix(input: string): boolean {
    return /^\d+\.?\d*[mug]?$/i.test(input);
  }

  function isCompleteDoseUnit(input: string): boolean {
    return /^\d+\.?\d*(mg|g|ug|ml)$/i.test(input);
  }

  const getBasicParsePreview = (doseString: string) => {
    try {
      const parsed = parseDoseString(doseString);
      // Always return parsed result if basic format is valid
      return {
        isValid: true,
        parsed,
        error: null,
      };
    } catch (error) {
      return {
        isValid: false,
        parsed: null,
        error:
          error instanceof Error ? getErrorDetails(error, doseString) : null,
      };
    }
  };

  // Enhanced useEffect for smart suggestions
  useEffect(() => {
    const doseString = form.watch("doseString")?.toLowerCase() || "";

    // Clear all state if input is empty
    if (!doseString.trim()) {
      setSuggestions([]);
      setPreviewParse(null);
      setTierAnalysis(null);
      setParseError(null);
      setSafetyInfo(null);
      return;
    }

    // Process the input string once
    const words = doseString.trim().split(/\s+/);
    const lastWord = words[words.length - 1];
    const format = getDoseFormat(doseString);

    // Always clear safety info when input is incomplete (less than 3 words)
    // or when the substance is very short (to prevent showing safety data for "am" when typing "amphetamine")
    if (words.length < 3) {
      setSafetyInfo(null);
    }

    // Try to parse the dose string
    try {
      const parsed = parseDoseString(doseString);
      setPreviewParse(parsed);
      setParseError(null);

      // Only show safety info when we have a complete valid dose (all three components)
      // AND the substance name is substantial (at least 4 chars)
      // This prevents showing safety data for incomplete entries or very short substance names
      if (
        parsed.substance &&
        parsed.amount &&
        parsed.route &&
        parsed.substance.length >= 4 &&
        // Make sure we're seeing a complete dose string, not a partial one
        words.length === 3
      ) {
        // Get safety information
        const safety = getSubstanceSafetyInfo(
          parsed.substance,
          parsed.amount,
          parsed.route,
          // @ts-ignore - Casting JSON data to the expected interface
          substanceData,
        );
        setSafetyInfo(safety);
      } else {
        setSafetyInfo(null);
      }
    } catch (error) {
      setPreviewParse(null);
      setSafetyInfo(null);
      if (error instanceof Error) {
        const errorDetails = getErrorDetails(error, doseString);
        setParseError(errorDetails);
      }
    }

    // First check basic parsing - this should work for any valid format
    const { isValid, parsed, error } = getBasicParsePreview(doseString);

    // If basic parsing succeeds, show preview and try tier analysis
    if (isValid && parsed) {
      setPreviewParse(parsed);
      setParseError(null);

      // Try tier analysis but don't let it affect validity
      const analysis = tryGetTierAnalysis(
        parsed.substance,
        parsed.route,
        parsed.amount,
        parsed.unit,
        doseData,
      );

      setTierAnalysis(analysis);
      // The dose is valid even if tier analysis returns null
    } else {
      setPreviewParse(null);
      setTierAnalysis(null);
      setParseError(error);
    }
    if (format === "command") {
      if (words[0] === "@" && words.length === 1) {
        const methodSuggestions = Object.values(ADMINISTRATION_METHODS)
          .flat()
          .filter((r) => r.startsWith("@"))
          .map((text) => ({ text, type: "common" as const }))
          .slice(0, 5);
        setSuggestions(methodSuggestions);
      } else if (words.length === 2) {
        setSuggestions([]);
        const doseAmount = words[1];
        if (
          !isCompleteDoseUnit(doseAmount) &&
          !isValidDoseUnitPrefix(doseAmount)
        ) {
          setParseError({
            type: "unit",
            message: "Invalid dose unit",
            suggestion: "Use a standard unit of measurement",
            example: "Valid units: mg, g, ug, ml",
          });
        }
      } else if (words.length === 3 && lastWord.length > 1) {
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
          .map(({ substance }) => {
            const suggestionItem: SuggestionItem = {
              text: substance,
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
          });

        setSuggestions(matchedSubstances);

        try {
          const parsed = parseDoseString(doseString);
          setPreviewParse(parsed);
          setParseError(null);
        } catch (error) {
          setPreviewParse(null);
          if (error instanceof Error) {
            const errorDetails = getErrorDetails(error, doseString);
            setParseError(errorDetails);
          }
        }
      }
    } else if (format === "standard") {
      if (words.length === 1) {
        if (isCompleteDoseUnit(lastWord)) {
          setParseError(null);
        } else if (isValidDoseUnitPrefix(lastWord)) {
          setParseError(null);
        } else if (lastWord.match(/^\d+\.?\d*[a-z]+$/i)) {
          setParseError({
            type: "unit",
            message: "Invalid dose unit",
            suggestion: "Use a standard unit of measurement",
            example: "Valid units: mg, g, ug, ml",
          });
        }
      } else if (words.length === 2 && lastWord.length > 0) {
        // Enhanced substance suggestions with history
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
          .map(({ substance }) => {
            const suggestionItem: SuggestionItem = {
              text: substance,
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
          });

        setSuggestions(matchedSubstances);
      } else if (words.length === 3) {
        // For route suggestions, if lastWord is very short (1-2 chars) or empty, 
        // show all routes instead of only matching ones
        const showAllRoutes = !lastWord || lastWord.length <= 2;
        
        // If the lastWord is short or empty, show all routes
        // Otherwise, filter routes that match the prefix
        const matchingRoutes = Object.values(ADMINISTRATION_METHODS)
          .flat()
          .filter((r) => !r.startsWith("@") && (
            showAllRoutes || 
            r.startsWith(lastWord) ||
            r.includes(lastWord)
          ))
          .map((text) => ({ text, type: "common" as const }));

        if (matchingRoutes.length > 0) {
          // Sort routes: exact matches first, then by length (shorter routes first)
          const sortedRoutes = matchingRoutes.sort((a, b) => {
            // Exact matches come first
            if (a.text === lastWord) return -1;
            if (b.text === lastWord) return 1;
            
            // Then sort by whether it starts with the lastWord
            const aStartsWithLastWord = a.text.startsWith(lastWord);
            const bStartsWithLastWord = b.text.startsWith(lastWord);
            if (aStartsWithLastWord && !bStartsWithLastWord) return -1;
            if (!aStartsWithLastWord && bStartsWithLastWord) return 1;
            
            // Then sort by length (shorter first)
            return a.text.length - b.text.length;
          });
          
          // Limit number of suggestions to 6 to prevent UI overflow
          setSuggestions(sortedRoutes.slice(0, 6));
          setParseError(null);

          // Only attempt to parse if there's an exact match AND it's not just a short input
          // This prevents "o" from matching "oral" automatically
          const hasExactMatch = matchingRoutes.some((r) => r.text === lastWord);
          if (hasExactMatch && lastWord.length > 2) {
            try {
              const parsed = parseDoseString(doseString);
              setPreviewParse(parsed);
            } catch (error) {
              setPreviewParse(null);
            }
          } else {
            // Reset preview parse when user is still selecting a route
            setPreviewParse(null);
          }
        } else {
          if (lastWord && lastWord.length > 0) {
            setSuggestions([]);
            setParseError({
              type: "route",
              message: "Route not recognized",
              suggestion: "Use one of the standard administration routes",
              example: "Common routes: oral, nasal, inhaled, injected",
            });
          } else {
            // Show common, easy-to-understand routes first
            const commonRoutes = ["oral", "sublingual", "nasal", "inhaled", "injected"];
            const remainingRoutes = Object.values(ADMINISTRATION_METHODS)
              .flat()
              .filter((r) => !r.startsWith("@") && !commonRoutes.includes(r));
            
            const allRoutes = [
              ...commonRoutes.map((text) => ({ text, type: "common" as const })),
              ...remainingRoutes
                .map((text) => ({ text, type: "common" as const }))
            ]
            .slice(0, 6); // Limit to 6 choices
            setSuggestions(allRoutes);
            setParseError(null);
          }
        }

        // Only attempt to parse if there's an exact match AND it's not just a short input
        // This prevents "o" from matching "oral" automatically
        const hasExactMatch = matchingRoutes.some((r) => r.text === lastWord);
        if (hasExactMatch && lastWord.length > 2) {
          try {
            const parsed = parseDoseString(doseString);
            setPreviewParse(parsed);
            // Run tier analysis immediately after successful parse
            const analysis = analyzeDoseTier(
              parsed.substance,
              parsed.route,
              parsed.amount,
              parsed.unit,
              doseData,
            );
            setTierAnalysis(analysis);
          } catch (error) {
            setPreviewParse(null);
            setTierAnalysis(null);
          }
        }
      }
    }
  }, [form.watch("doseString"), recentSubstances, frequentSubstances]);

  const applySuggestion = (suggestion: SuggestionItem) => {
    const doseString = form.watch("doseString") || "";
    const words = doseString.split(" ");
    words[words.length - 1] = suggestion.text;
    form.setValue("doseString", words.join(" "));
  };

  const getTierBadgeVariant = (tier: string) => {
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
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="w-full max-w-md mx-auto shadow-md border-0 overflow-hidden bg-gradient-to-br from-white to-secondary/20 dark:from-background dark:to-secondary/5">
       {previewParse && (
          <CardHeader className="pb-0">
            <motion.div
              className="flex items-center justify-between"
              initial={false}
              animate={submitStatus}
              variants={{
                success: { scale: [1, 1.02, 1] },
                error: { x: [0, -10, 10, -10, 10, 0] },
              }}
            >
              <div className="flex pt-5 gap-2">
              
                
              </div>
            </motion.div>
          </CardHeader>
        )} 
        <CardContent className={!previewParse ? "pt-6" : ""}>
          <div className="space-y-4">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    placeholder="e.g. 200mg caffeine oral"
                    {...form.register("doseString")}
                    className={`w-full pr-10 transition-all placeholder:text-xs placeholder:text-muted-foreground/40 ${
                      previewParse
                        ? "border-green-500 shadow-md ring-1 ring-green-200"
                        : parseError
                          ? "border-red-500 shadow-md ring-1 ring-red-200"
                          : "shadow-sm hover:shadow focus:shadow-md transition-shadow"
                    } h-12 sm:h-10 px-4 rounded-lg`}
                    disabled={isSubmitting}
                    autoComplete="off"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {previewParse && (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                    {parseError && (
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {parseError && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="bg-destructive/5 rounded-lg p-3 text-sm space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                        <div className="space-y-1 flex-grow">
                          <p className="font-medium text-destructive">
                            {parseError.message}
                          </p>
                          {parseError.suggestion && (
                            <p className="text-muted-foreground">
                              {parseError.suggestion}
                            </p>
                          )}
                          {parseError.example && (
                            <p className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                              {parseError.example}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {suggestions.length > 0 && !parseError && !previewParse && (
                    <motion.div
                      key="suggestions"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex flex-wrap gap-2"
                    >
                      {suggestions.map((suggestion) => (
                        <Button
                          key={suggestion.text}
                          variant="outline"
                          size="sm"
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applySuggestion(suggestion);
                          }}
                          className="hover:scale-105 transition-transform flex items-center gap-1"
                        >
                          {suggestion.icon}
                          {suggestion.text}
                        </Button>
                      ))}
                    </motion.div>
                  )}

                  {previewParse && (
                    <motion.div
                      key="preview"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-muted rounded-lg p-3 text-sm space-y-1"
                    >
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Substance:
                        </span>
                        <span className="font-medium">
                          {previewParse.substance}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount:</span>
                        <span className="font-medium">
                          {previewParse.amount}
                          {previewParse.unit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Route:</span>
                        <span className="font-medium">
                          {previewParse.route}
                        </span>
                      </div>
                      {tierAnalysis && tierAnalysis.tier ? (
                        <div className="pt-2 mt-2 border-t border-border">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-muted-foreground">
                              Dose Level:
                            </span>
                            <Badge
                              variant={getTierBadgeVariant(tierAnalysis.tier)}
                            >
                              {tierAnalysis.tier.charAt(0).toUpperCase() +
                                tierAnalysis.tier.slice(1)}
                            </Badge>
                          </div>
                          {tierAnalysis.ranges && (
                            <div className="text-xs space-y-1 pt-1">
                              {tierAnalysis.ranges.threshold && (
                                <div className="flex justify-between">
                                  <span>Threshold:</span>
                                  <span>
                                    {tierAnalysis.ranges.threshold}
                                    {previewParse.unit}
                                  </span>
                                </div>
                              )}
                              {tierAnalysis.ranges.light && (
                                <div className="flex justify-between">
                                  <span>Light:</span>
                                  <span>
                                    {tierAnalysis.ranges.light.lower}-
                                    {tierAnalysis.ranges.light.upper}
                                    {previewParse.unit}
                                  </span>
                                </div>
                              )}
                              {tierAnalysis.ranges.common && (
                                <div className="flex justify-between">
                                  <span>Common:</span>
                                  <span>
                                    {tierAnalysis.ranges.common.lower}-
                                    {tierAnalysis.ranges.common.upper}
                                    {previewParse.unit}
                                  </span>
                                </div>
                              )}
                              {tierAnalysis.ranges.strong && (
                                <div className="flex justify-between">
                                  <span>Strong:</span>
                                  <span>
                                    {tierAnalysis.ranges.strong.lower}-
                                    {tierAnalysis.ranges.strong.upper}
                                    {previewParse.unit}
                                  </span>
                                </div>
                              )}
                              {tierAnalysis.ranges.heavy && (
                                <div className="flex justify-between">
                                  <span>Heavy:</span>
                                  <span>
                                    ≥{tierAnalysis.ranges.heavy}
                                    {previewParse.unit}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="pt-2 mt-2 border-t border-border text-center">
                          <Badge variant="secondary">Valid Format</Badge>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {previewParse &&
                safetyInfo &&
                // Only show this card if we have actual safety information
                (safetyInfo.effects.length > 0 ||
                safetyInfo.safetyWarnings.length > 0 ||
                safetyInfo.duration ||
                safetyInfo.onset ? (
                  <Card className="overflow-hidden">
                    <CardContent className="p-3">
                      {/* Dose Information and Range Visual */}
                      <div className="flex items-center gap-1 mb-2">
                        <span className="text-xs text-muted-foreground">
                          Dose:
                        </span>
                        <span className="text-xs font-medium">
                          {previewParse.amount}
                          {previewParse.unit}
                        </span>

                        {tierAnalysis?.tier && (
                          <Badge
                            variant={getTierBadgeVariant(tierAnalysis.tier)}
                            className="ml-auto"
                          >
                            {tierAnalysis.tier.charAt(0).toUpperCase() +
                              tierAnalysis.tier.slice(1)}
                          </Badge>
                        )}
                      </div>

                      {tierAnalysis?.ranges ? (
                        <DoseRangeVisual
                          ranges={tierAnalysis.ranges}
                          currentDose={previewParse.amount}
                          unit={previewParse.unit}
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground p-1 border-t border-border pt-2">
                          <Info className="w-4 h-4 inline mr-1" />
                          No dose level information available for{" "}
                          {previewParse.substance}
                        </div>
                      )}

                      {/* Safety Info Dialog - only show when safetyInfo exists */}
                      {safetyInfo && (
                        <SafetyInfoDialog
                          safetyInfo={safetyInfo}
                          substance={previewParse.substance}
                        />
                      )}
                    </CardContent>
                  </Card>
                ) : null)}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-4 h-12 sm:h-10 text-base sm:text-sm"
                style={{
                  backgroundColor:
                    "#9b19f5" /* Dutch fields vibrant purple/violet */,
                  color: "white",
                  boxShadow: "0 2px 8px rgba(155, 25, 245, 0.3)",
                  border: "none",
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging...
                  </>
                ) : submitStatus === "success" ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Logged
                  </>
                ) : (
                  "Log Dose"
                )}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
