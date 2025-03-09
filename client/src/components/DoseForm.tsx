import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { parseDoseString } from "@/lib/dose-parser";
import { addDose, getDoses } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ADMINISTRATION_METHODS } from "@/lib/constants";
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
import { useDoseContext } from "@/contexts/DoseContext";
import { Badge } from "@/components/ui/badge";
import { analyzePersonalPatterns } from "@/lib/analysis";
import doseData from "@/lib/dose-tiers.json";
import { analyzeDoseTier, getTierBadgeVariant } from "@/lib/dose-tiers.types";
import { getSubstanceSafetyInfo } from "@/lib/substance-safety";
import substanceData from "@/lib/substance-data.json";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DoseRangeVisual } from "./DoseRangeVisual";

function normalizeSubstanceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_\s]+/g, "") // Remove dashes, underscores, spaces
    .replace(/[^a-z0-9]/g, ""); // Remove any other special characters
}

function findMatchingSubstance(
  userSubstance: string,
  doseData: any,
): string | null {
  const normalizedInput = normalizeSubstanceName(userSubstance);

  // First try exact match
  const exactMatch = Object.keys(doseData).find(
    (substance) => normalizeSubstanceName(substance) === normalizedInput,
  );
  if (exactMatch) return exactMatch;

  // Then try contains match
  const containsMatch = Object.keys(doseData).find(
    (substance) =>
      normalizeSubstanceName(substance).includes(normalizedInput) ||
      normalizedInput.includes(normalizeSubstanceName(substance)),
  );
  if (containsMatch) return containsMatch;

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
      example: "Examples:\n200mg caffeine oral\n@ate 30mg adderall",
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
        const doses = await getDoses();
        const patterns = analyzePersonalPatterns(doses);

        // Get recent substances (last 5 unique)
        const recent = Array.from(
          new Set(
            doses
              .sort(
                (a, b) =>
                  new Date(b.timestamp).getTime() -
                  new Date(a.timestamp).getTime(),
              )
              .map((d) => d.substance),
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

        setRecentSubstances(recent);
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
    if (!doseString.trim()) {
      setSuggestions([]);
      setPreviewParse(null);
      setTierAnalysis(null);
      setParseError(null);
      setSafetyInfo(null);
      return;
    }

    try {
      const parsed = parseDoseString(doseString);
      setPreviewParse(parsed);
      setParseError(null);

      // Get safety information
      const safety = getSubstanceSafetyInfo(
        parsed.substance,
        parsed.amount,
        parsed.route,
        substanceData
      );
      setSafetyInfo(safety);

    } catch (error) {
      setPreviewParse(null);
      setSafetyInfo(null);
      if (error instanceof Error) {
        const errorDetails = getErrorDetails(error, doseString);
        setParseError(errorDetails);
      }
    }

    const words = doseString.trim().split(/\s+/);
    const lastWord = words[words.length - 1];
    const format = getDoseFormat(doseString);

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
        const matchingRoutes = Object.values(ADMINISTRATION_METHODS)
          .flat()
          .filter((r) => !r.startsWith("@") && r.startsWith(lastWord || ""))
          .map((text) => ({ text, type: "common" as const }));

        if (matchingRoutes.length > 0) {
          setSuggestions(matchingRoutes);
          setParseError(null);

          if (matchingRoutes.some((r) => r.text === lastWord)) {
            try {
              const parsed = parseDoseString(doseString);
              setPreviewParse(parsed);
            } catch (error) {
              setPreviewParse(null);
            }
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
            const allRoutes = Object.values(ADMINISTRATION_METHODS)
              .flat()
              .filter((r) => !r.startsWith("@"))
              .map((text) => ({ text, type: "common" as const }))
              .slice(0, 5);
            setSuggestions(allRoutes);
            setParseError(null);
          }
        }

        if (matchingRoutes.some((r) => r.text === lastWord)) {
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
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <motion.div
            className="flex items-center justify-between"
            initial={false}
            animate={submitStatus}
            variants={{
              success: { scale: [1, 1.02, 1] },
              error: { x: [0, -10, 10, -10, 10, 0] },
            }}
          >
            <h2 className="text-xl font-bold">Enter Dose</h2>
            {previewParse && (
              <div className="flex gap-2">
                <Badge variant="outline">Valid Format</Badge>
                {tierAnalysis && (
                  <Badge variant={getTierBadgeVariant(tierAnalysis.tier)}>
                    {tierAnalysis.tier.charAt(0).toUpperCase() +
                      tierAnalysis.tier.slice(1)}{" "}
                    Dose
                  </Badge>
                )}
              </div>
            )}
          </motion.div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    placeholder="e.g. 200mg caffeine oral"
                    {...form.register("doseString")}
                    className={`w-full pr-10 transition-all ${
                      previewParse
                        ? "border-green-500"
                        : parseError
                          ? "border-red-500"
                          : ""
                    }`}
                    disabled={isSubmitting}
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

                  {suggestions.length > 0 && !parseError && (
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
                        <span className="text-muted-foreground">Substance:</span>
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
                        <span className="font-medium">{previewParse.route}</span>
                      </div>
                      {tierAnalysis ? (
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
                        <div className="pt-2 mt-2 border-t border-border">
                          <Badge variant="secondary">Valid Format</Badge>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {safetyInfo && previewParse && (
                <Card className="mt-4">
                  <CardHeader>
                    <h3 className="text-lg font-semibold">Safety Information</h3>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Dose Range Visual */}
                    {tierAnalysis?.ranges && (
                      <div className="space-y-2">
                        <h4 className="font-medium">Dose Range</h4>
                        <DoseRangeVisual
                          ranges={tierAnalysis.ranges}
                          currentDose={previewParse.amount}
                          unit={previewParse.unit}
                        />
                      </div>
                    )}

                    {/* Dosage Guidance Section */}
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center justify-between w-full">
                        <h4 className="font-medium">Dosage Guidance</h4>
                        <ChevronDown className="h-4 w-4 transition-transform ui-expanded:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <Alert className="mt-2">
                          <Info className="h-4 w-4" />
                          <AlertDescription>
                            {safetyInfo.dosageGuidance}
                          </AlertDescription>
                        </Alert>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Safety Warnings Section */}
                    {safetyInfo.safetyWarnings.length > 0 && (
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center justify-between w-full">
                          <h4 className="font-medium">Safety Warnings</h4>
                          <ChevronDown className="h-4 w-4 transition-transform ui-expanded:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="space-y-2 mt-2">
                            {safetyInfo.safetyWarnings.map((warning, index) => (
                              <Alert key={index} variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Warning</AlertTitle>
                                <AlertDescription>{warning}</AlertDescription>
                              </Alert>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Effects Section */}
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center justify-between w-full">
                        <h4 className="font-medium">Effects</h4>
                        <ChevronDown className="h-4 w-4 transition-transform ui-expanded:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {safetyInfo.effects.map((effect, index) => (
                            <Badge key={index} variant="secondary">
                              {effect}
                            </Badge>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Duration/Onset Section */}
                    {(safetyInfo.duration || safetyInfo.onset) && (
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center justify-between w-full">
                          <h4 className="font-medium">Timing Information</h4>
                          <ChevronDown className="h-4 w-4 transition-transform ui-expanded:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="flex gap-4 mt-2">
                            {safetyInfo.onset && (
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                <span className="text-sm">{safetyInfo.onset}</span>
                              </div>
                            )}
                            {safetyInfo.duration && (
                              <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4" />
                                <span className="text-sm">{safetyInfo.duration}</span>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </CardContent>
                </Card>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-4"
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