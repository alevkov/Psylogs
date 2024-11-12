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
import { Loader2, AlertCircle, Check, Info, Clock, Star } from "lucide-react";
import { useDoseContext } from "@/contexts/DoseContext";
import { Badge } from "@/components/ui/badge";
import { analyzePersonalPatterns } from "@/lib/analysis";

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
  const queryChars = query.split('');
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
  type: 'recent' | 'common' | 'frequent' | 'pattern';
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
        const recent = Array.from(new Set(
          doses
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map(d => d.substance)
        )).slice(0, 5);
        
        // Get most frequent substances
        const frequent = patterns
          .sort((a, b) => 
            (b.recentTrends.avgDailyDose || 0) - (a.recentTrends.avgDailyDose || 0)
          )
          .map(p => p.substance)
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

  // Enhanced useEffect for smart suggestions
  useEffect(() => {
    const doseString = form.watch("doseString")?.toLowerCase() || "";
    const words = doseString.trim().split(/\s+/);
    const lastWord = words[words.length - 1];
    const format = getDoseFormat(doseString);

    setParseError(null);

    if (!doseString.trim()) {
      setSuggestions([]);
      setPreviewParse(null);
      return;
    }

    if (format === "command") {
      if (words[0] === "@" && words.length === 1) {
        const methodSuggestions = Object.values(ADMINISTRATION_METHODS)
          .flat()
          .filter((r) => r.startsWith("@"))
          .map(text => ({ text, type: 'common' as const }))
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
        const allSubstances = Array.from(new Set([
          ...recentSubstances,
          ...frequentSubstances,
          ...BASE_SUBSTANCES
        ]));

        const matchedSubstances = allSubstances
          .map(substance => ({
            substance,
            score: fuzzyMatch(lastWord, substance)
          }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ substance }) => {
            const suggestionItem: SuggestionItem = {
              text: substance,
              type: 'common',
              icon: undefined
            };

            if (recentSubstances.includes(substance)) {
              suggestionItem.type = 'recent';
              suggestionItem.icon = <Clock className="w-4 h-4" />;
            } else if (frequentSubstances.includes(substance)) {
              suggestionItem.type = 'frequent';
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
        const allSubstances = Array.from(new Set([
          ...recentSubstances,
          ...frequentSubstances,
          ...BASE_SUBSTANCES
        ]));

        const matchedSubstances = allSubstances
          .map(substance => ({
            substance,
            score: fuzzyMatch(lastWord, substance)
          }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ substance }) => {
            const suggestionItem: SuggestionItem = {
              text: substance,
              type: 'common',
              icon: undefined
            };

            if (recentSubstances.includes(substance)) {
              suggestionItem.type = 'recent';
              suggestionItem.icon = <Clock className="w-4 h-4" />;
            } else if (frequentSubstances.includes(substance)) {
              suggestionItem.type = 'frequent';
              suggestionItem.icon = <Star className="w-4 h-4" />;
            }

            return suggestionItem;
          });

        setSuggestions(matchedSubstances);
      } else if (words.length === 3) {
        const matchingRoutes = Object.values(ADMINISTRATION_METHODS)
          .flat()
          .filter((r) => !r.startsWith("@") && r.startsWith(lastWord || ""))
          .map(text => ({ text, type: 'common' as const }));

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
              .map(text => ({ text, type: 'common' as const }))
              .slice(0, 5);
            setSuggestions(allRoutes);
            setParseError(null);
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
              <Badge variant="outline" className="animate-fadeIn">
                Valid Format
              </Badge>
            )}
          </motion.div>
        </CardHeader>
        <CardContent>
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
                  {previewParse && <Check className="w-4 h-4 text-green-500" />}
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
                        onClick={() => applySuggestion(suggestion)}
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button
              type="submit"
              className="w-full relative"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Log Dose"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
