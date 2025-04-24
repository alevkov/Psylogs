import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { parseDoseString } from "../lib/dose-parser";
import { addDose, getDoses } from "../lib/db";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useToast } from "../hooks/use-toast";
import { Card, CardHeader, CardContent, CardFooter } from "./ui/card";
import { ADMINISTRATION_METHODS, UNITS } from "../lib/constants";
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
  Pill,
  Droplet,
  Zap, 
  ArrowRight,
  Sparkles,
  Bookmark,
  CornerDownRight,
  PlusCircle,
  Calendar,
  CheckCircle2,
  XCircle,
  Filter,
  Medal,
  Play,
  Search,
  Wind
} from "lucide-react";
import { useDoseContext } from "../contexts/DoseContext";
import { Badge } from "./ui/badge";
import { analyzePersonalPatterns } from "../lib/analysis";
import doseData from "../lib/dose-tiers.json";
import { analyzeDoseTier, getTierBadgeVariant } from "../lib/dose-tiers.types";
import { getSubstanceSafetyInfo } from "../lib/substance-safety";
import substanceData from "../lib/substance-data.json";
import { useIsMobile } from "../hooks/use-mobile";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "./ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { DoseRangeVisual } from "./DoseRangeVisual";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

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
  doseData: any,
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

  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  
  // Enhanced useEffect for smart suggestions with better intelligence
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
    
    // Command format handling (@action)
    if (format === "command") {
      if (words[0] === "@" && words.length === 1) {
        const methodSuggestions = Object.values(ADMINISTRATION_METHODS)
          .flat()
          .filter((r) => r.startsWith("@"))
          .map((text) => ({ 
            text, 
            type: "pattern" as const,
            icon: <CornerDownRight className="w-4 h-4" />
          }))
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
        // Smart substance suggestions with improved indicators
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
              icon: <Pill className="w-4 h-4" />,
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
    } 
    // Standard format handling (amount unit substance route)
    else if (format === "standard") {
      if (words.length === 1) {
        // Suggesting units when typing amount
        if (isCompleteDoseUnit(lastWord)) {
          setParseError(null);
        } else if (isValidDoseUnitPrefix(lastWord)) {
          // If they've typed a number, suggest units
          if (lastWord.match(/^\d+\.?\d*$/)) {
            const unitSuggestions = UNITS.map(unit => ({
              text: lastWord + unit,
              type: "pattern" as const,
              icon: <Droplet className="w-4 h-4" />
            }));
            setSuggestions(unitSuggestions);
          } else {
            setParseError(null);
          }
        } else if (lastWord.match(/^\d+\.?\d*[a-z]+$/i)) {
          setParseError({
            type: "unit",
            message: "Invalid dose unit",
            suggestion: "Use a standard unit of measurement",
            example: "Valid units: mg, g, ug, ml",
          });
        }
      } else if (words.length === 2 && lastWord.length > 0) {
        // Enhanced substance suggestions with improved categorization
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
              icon: <Pill className="w-4 h-4" />,
            };

            if (recentSubstances.includes(substance)) {
              suggestionItem.type = "recent";
              suggestionItem.icon = <Calendar className="w-4 h-4" />;
            } else if (frequentSubstances.includes(substance)) {
              suggestionItem.type = "frequent";
              suggestionItem.icon = <Medal className="w-4 h-4" />;
            }

            return suggestionItem;
          });

        setSuggestions(matchedSubstances);
      } else if (words.length === 3 && lastWord.length > 0) {
        // Improved route suggestions with icons
        const routeGroups = Object.entries(ADMINISTRATION_METHODS);
        let matchedRoutes: SuggestionItem[] = [];
        
        // Group routes by category for better organization
        for (const [category, routes] of routeGroups) {
          const matchingRoutes = routes
            .filter(route => !route.startsWith('@') && route.includes(lastWord))
            .map(route => {
              let icon;
              // Add appropriate icons based on route category
              switch(category) {
                case 'oral': icon = <Droplet className="w-4 h-4" />; break;
                case 'intranasal': icon = <ArrowRight className="w-4 h-4" />; break;
                case 'inhaled': icon = <Wind className="w-4 h-4" />; break;
                case 'intravenous': icon = <Zap className="w-4 h-4" />; break;
                default: icon = <Filter className="w-4 h-4" />;
              }
              
              return {
                text: route,
                type: "pattern" as const,
                icon
              };
            });
            
          matchedRoutes = [...matchedRoutes, ...matchingRoutes];
        }
        
        setSuggestions(matchedRoutes.slice(0, 5));
        
        // Check for exact matches and handle route selection
        const exactRouteMatch = matchedRoutes.find(r => r.text === lastWord);
        if (exactRouteMatch) {
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
    const currentValue = form.getValues("doseString");
    const words = currentValue.trim().split(/\s+/);
    
    // Special handling for @action suggestions
    if (suggestion.text.startsWith("@")) {
      form.setValue("doseString", suggestion.text + " ");
      inputRef.current?.focus();
      return;
    }
    
    // If the suggestion includes a unit (like "200mg"), replace the whole word
    if (suggestion.text.match(/^\d+\.?\d*(mg|g|ug|ml)$/i)) {
      words[0] = suggestion.text;
      form.setValue("doseString", words.join(" ") + " ");
      inputRef.current?.focus();
      return;
    }
    
    // Replace the last word with the suggestion
    words[words.length - 1] = suggestion.text;
    form.setValue("doseString", words.join(" ") + " ");
    inputRef.current?.focus();
  };

  const getTierBadgeVariant = (tier: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (tier) {
      case "threshold":
        return "secondary";
      case "light":
        return "outline";
      case "common":
        return "default";
      case "strong":
        return "outline"; // Changed from warning to avoid type error
      case "heavy":
        return "destructive";
      default:
        return "secondary";
    }
  };

  // Get appropriate icon for route
  const getRouteIcon = (route: string) => {
    switch(route) {
      case 'oral': return <Droplet className="h-4 w-4 text-blue-500" />;
      case 'intranasal': return <ArrowRight className="h-4 w-4 text-indigo-500" />;
      case 'inhaled': return <Wind className="h-4 w-4 text-sky-500" />;
      case 'intravenous': return <Zap className="h-4 w-4 text-violet-500" />;
      case 'intramuscular': return <Zap className="h-4 w-4 text-purple-500" />;
      case 'rectal': return <Filter className="h-4 w-4 text-pink-500" />;
      default: return <Pill className="h-4 w-4 text-emerald-500" />;
    }
  };

  // Get icon and color for dose tier
  const getTierIcon = (tier: string) => {
    switch(tier) {
      case 'threshold': return { icon: <Droplet className="h-4 w-4" />, color: 'text-blue-500' };
      case 'light': return { icon: <Sparkles className="h-4 w-4" />, color: 'text-green-500' };
      case 'common': return { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-emerald-500' };
      case 'strong': return { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-amber-500' };
      case 'heavy': return { icon: <XCircle className="h-4 w-4" />, color: 'text-red-500' };
      default: return { icon: <Info className="h-4 w-4" />, color: 'text-gray-500' };
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      <Card className="w-full max-w-md mx-auto border shadow-sm">
        <CardHeader className="pb-2">
          <motion.div
            className="flex items-center justify-between"
            initial={false}
            animate={submitStatus}
            variants={{
              success: { scale: [1, 1.02, 1] },
              error: { x: [0, -10, 10, -10, 10, 0] },
            }}
          >
            <h2 className="text-xl font-bold flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" />
              <span>Log Dose</span>
            </h2>
            
            {previewParse && (
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-primary/5">
                  <Check className="w-3 h-3 mr-1" /> Valid
                </Badge>
                {tierAnalysis && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant={getTierBadgeVariant(tierAnalysis.tier)} className={`${getTierIcon(tierAnalysis.tier).color} bg-opacity-15`}>
                          {getTierIcon(tierAnalysis.tier).icon}
                          <span className="ml-1">{tierAnalysis.tier.charAt(0).toUpperCase() + tierAnalysis.tier.slice(1)}</span>
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{tierAnalysis.analysis}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </motion.div>
        </CardHeader>

        <CardContent className="pt-0">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <div className="relative mt-2">
                <div className="relative rounded-md shadow-sm">
                  <Input
                    placeholder={isMobile ? "e.g. 200mg caffeine oral" : "Enter dose (e.g. 200mg caffeine oral or @drank 10mg substance)"}
                    {...form.register("doseString")}
                    className={`w-full transition-all pr-10 ${
                      previewParse
                        ? "border-green-500 focus-visible:ring-green-500"
                        : parseError
                          ? "border-red-500 focus-visible:ring-red-500"
                          : ""
                    } font-medium h-12 text-base px-4`}
                    disabled={isSubmitting}
                    autoComplete="off"
                    ref={inputRef}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    {previewParse && (
                      <Check className="w-5 h-5 text-green-500" />
                    )}
                    {parseError && (
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    )}
                    {!previewParse && !parseError && (
                      <Search className="w-5 h-5 text-muted-foreground opacity-70" />
                    )}
                  </div>
                </div>
                
                {/* Quick action buttons for common patterns */}
                {!previewParse && !parseError && !suggestions.length && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button 
                      type="button"
                      variant="outline" 
                      size="sm"
                      className="text-xs bg-primary/5"
                      onClick={() => {
                        form.setValue("doseString", "");
                        setTimeout(() => inputRef.current?.focus(), 10);
                      }}
                    >
                      <Pill className="w-3 h-3 mr-1" /> Reset
                    </Button>
                    <Button 
                      type="button"
                      variant="outline" 
                      size="sm"
                      className="text-xs bg-primary/5"
                      onClick={() => {
                        form.setValue("doseString", "@ate ");
                        setTimeout(() => inputRef.current?.focus(), 10);
                      }}
                    >
                      <Droplet className="w-3 h-3 mr-1" /> @ate
                    </Button>
                    <Button 
                      type="button"
                      variant="outline" 
                      size="sm"
                      className="text-xs bg-primary/5"
                      onClick={() => {
                        form.setValue("doseString", "@drank ");
                        setTimeout(() => inputRef.current?.focus(), 10);
                      }}
                    >
                      <Droplet className="w-3 h-3 mr-1" /> @drank
                    </Button>
                    {recentSubstances.length > 0 && (
                      <Button 
                        type="button"
                        variant="outline" 
                        size="sm"
                        className="text-xs bg-primary/5"
                        onClick={() => {
                          const recent = recentSubstances[0];
                          form.setValue("doseString", `mg ${recent} oral`);
                          setTimeout(() => {
                            inputRef.current?.focus();
                            inputRef.current?.setSelectionRange(0, 0);
                          }, 10);
                        }}
                      >
                        <Clock className="w-3 h-3 mr-1" /> Recent
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <AnimatePresence mode="wait">
                {parseError && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="bg-destructive/5 rounded-lg p-3 text-sm space-y-2 border border-destructive/10"
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
                    className="flex flex-wrap gap-2 mt-2"
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
                        className="hover:scale-105 transition-transform flex items-center gap-1 bg-primary/5"
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
                    className="bg-muted/30 border rounded-lg p-4 text-sm space-y-3 mt-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="bg-primary/10 rounded-full p-1.5">
                        <Pill className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-base">{previewParse.substance}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5" />
                            {previewParse.amount}{previewParse.unit}
                          </span>
                          <span className="flex items-center gap-1">
                            {getRouteIcon(previewParse.route)}
                            {previewParse.route}
                          </span>
                        </div>
                      </div>
                      {tierAnalysis && (
                        <div className="flex flex-col items-end">
                          <Badge 
                            variant={getTierBadgeVariant(tierAnalysis.tier)}
                            className={`${getTierIcon(tierAnalysis.tier).color}`}
                          >
                            {getTierIcon(tierAnalysis.tier).icon}
                            <span className="ml-1">{tierAnalysis.tier}</span>
                          </Badge>
                        </div>
                      )}
                    </div>
                    
                    {tierAnalysis?.ranges && (
                      <div className="pt-1">
                        <div className="space-y-2">
                          <h4 className="text-xs font-medium text-muted-foreground">Dose Range</h4>
                          <DoseRangeVisual
                            ranges={tierAnalysis.ranges}
                            currentDose={previewParse.amount}
                            unit={previewParse.unit}
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {safetyInfo && previewParse && (
              <Card className="mt-4 border shadow-sm">
                <CardHeader className="py-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Safety Information
                  </h3>
                </CardHeader>
                <CardContent className="py-0 space-y-3">
                  {/* Dosage Guidance Section */}
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center justify-between w-full text-sm py-2 px-1 hover:bg-muted/50 rounded-md">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">Dosage Guidance</span>
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 transition-transform ui-expanded:rotate-180 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Alert className="mt-2 bg-blue-50 dark:bg-blue-950/30 text-sm">
                        <AlertDescription>{safetyInfo.dosageGuidance}</AlertDescription>
                      </Alert>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Safety Warnings Section */}
                  {safetyInfo.safetyWarnings.length > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center justify-between w-full text-sm py-2 px-1 hover:bg-muted/50 rounded-md">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <span className="font-medium">Safety Warnings</span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 transition-transform ui-expanded:rotate-180 text-muted-foreground" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="space-y-2 mt-2">
                          {safetyInfo.safetyWarnings.map((warning, index) => (
                            <Alert key={index} variant="destructive" className="text-sm bg-red-50 dark:bg-red-950/30">
                              <AlertDescription>{warning}</AlertDescription>
                            </Alert>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Effects Section */}
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center justify-between w-full text-sm py-2 px-1 hover:bg-muted/50 rounded-md">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-500" />
                        <span className="font-medium">Effects</span>
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 transition-transform ui-expanded:rotate-180 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="flex flex-wrap gap-2 mt-2 pb-1">
                        {safetyInfo.effects.map((effect, index) => (
                          <Badge key={index} variant="outline" className="bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300">
                            {effect}
                          </Badge>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Duration/Onset Section */}
                  {(safetyInfo.duration || safetyInfo.onset) && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center justify-between w-full text-sm py-2 px-1 hover:bg-muted/50 rounded-md">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-orange-500" />
                          <span className="font-medium">Timing Information</span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 transition-transform ui-expanded:rotate-180 text-muted-foreground" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex flex-wrap gap-4 mt-2 pb-1">
                          {safetyInfo.onset && (
                            <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-950/30 px-3 py-1.5 rounded-md">
                              <Play className="h-4 w-4 text-orange-500" />
                              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                                Onset: {safetyInfo.onset}
                              </span>
                            </div>
                          )}
                          {safetyInfo.duration && (
                            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 px-3 py-1.5 rounded-md">
                              <Activity className="h-4 w-4 text-green-500" />
                              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                                Duration: {safetyInfo.duration}
                              </span>
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
              disabled={isSubmitting || !previewParse}
              className={`w-full mt-4 h-12 text-base font-medium ${
                !previewParse ? 'opacity-70' : ''
              } transition-all duration-200 ${
                submitStatus === 'success' ? 'bg-green-600 hover:bg-green-700' : ''
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Logging Dose...
                </>
              ) : submitStatus === "success" ? (
                <>
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Dose Logged Successfully
                </>
              ) : (
                <>
                  <PlusCircle className="mr-2 h-5 w-5" />
                  {previewParse ? 'Log Dose' : 'Enter Valid Dose'}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}