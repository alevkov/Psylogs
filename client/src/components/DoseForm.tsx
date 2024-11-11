import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { parseDoseString } from "@/lib/dose-parser";
import { addDose } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ADMINISTRATION_METHODS } from "@/lib/constants";
import { Loader2, AlertCircle, Check, Info } from "lucide-react";
import { useDoseContext } from "@/contexts/DoseContext";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  doseString: z.string().min(1, "Please enter a dose"),
});

const COMMON_SUBSTANCES = [
  "acetaminophen",
  "ibuprofen",
  "aspirin",
  "amoxicillin",
  "omeprazole",
];

interface ParseError {
  type: 'format' | 'amount' | 'route' | 'unit' | 'substance' | 'unknown';
  message: string;
  suggestion?: string;
  example?: string;
}

function getErrorDetails(error: Error): ParseError {
  const message = error.message.toLowerCase();
  
  if (message.includes('invalid dose string format')) {
    return {
      type: 'format',
      message: "Format not recognized",
      suggestion: "Use the format: amount + unit + substance + route",
      example: "Example: 200mg caffeine oral"
    };
  }
  
  if (message.includes('amount must be')) {
    return {
      type: 'amount',
      message: "Invalid amount",
      suggestion: "Enter a positive number",
      example: "Examples: 20, 0.5, 100"
    };
  }
  
  if (message.includes('unknown route')) {
    return {
      type: 'route',
      message: "Route not recognized",
      suggestion: "Use one of the standard administration routes",
      example: "Common routes: oral, nasal, inhaled, injected"
    };
  }
  
  if (message.includes('unknown unit')) {
    return {
      type: 'unit',
      message: "Unit not recognized",
      suggestion: "Use a standard unit of measurement",
      example: "Valid units: mg, g, ug, ml"
    };
  }

  if (message.includes('@')) {
    return {
      type: 'format',
      message: "Invalid shorthand format",
      suggestion: "Start with @ followed by action, amount, and substance",
      example: "Example: @ate 30mg substance"
    };
  }

  return {
    type: 'unknown',
    message: "Something's not quite right",
    suggestion: "Check that your input follows the expected format",
    example: "Format: amount + unit + substance + route"
  };
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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const { toast } = useToast();
  const { triggerUpdate } = useDoseContext();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      doseString: "",
    },
  });

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
        title: navigator.onLine ? "Dose logged successfully" : "Dose queued for sync",
        description: navigator.onLine
          ? undefined
          : "Will be synced when you're back online",
        duration: 2000,
      });
    } catch (error) {
      setSubmitStatus("error");
      toast({
        title: "Error logging dose",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitStatus("idle"), 2000);
    }
  };

  useEffect(() => {
    const doseString = form.watch("doseString")?.toLowerCase() || "";
    const words = doseString.split(" ");
    const lastWord = words[words.length - 1];

    // Reset error state when input changes
    setParseError(null);

    if (!lastWord) {
      setSuggestions([]);
      setPreviewParse(null);
      return;
    }

    // Try to parse the current input
    try {
      const parsed = parseDoseString(doseString);
      setPreviewParse(parsed);
      setParseError(null);
    } catch (error) {
      setPreviewParse(null);
      if (error instanceof Error) {
        setParseError(getErrorDetails(error));
      }
    }

    // Generate suggestions based on input context
    if (words.length <= 2) {
      const substanceSuggestions = COMMON_SUBSTANCES.filter((s) =>
        s.startsWith(lastWord)
      ).slice(0, 5);
      setSuggestions(substanceSuggestions);
    } else {
      const routeSuggestions = Object.values(ADMINISTRATION_METHODS)
        .flat()
        .filter((r) => r.startsWith(lastWord))
        .slice(0, 5);
      setSuggestions(routeSuggestions);
    }
  }, [form.watch("doseString")]);

  const applySuggestion = (suggestion: string) => {
    const doseString = form.watch("doseString") || "";
    const words = doseString.split(" ");
    words[words.length - 1] = suggestion;
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
                    previewParse ? "border-green-500" : parseError ? "border-red-500" : ""
                  }`}
                  disabled={isSubmitting}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {previewParse && <Check className="w-4 h-4 text-green-500" />}
                  {parseError && <AlertCircle className="w-4 h-4 text-destructive" />}
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
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => applySuggestion(suggestion)}
                        className="hover:scale-105 transition-transform"
                      >
                        {suggestion}
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
                      <span className="font-medium">{previewParse.substance}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="font-medium">
                        {previewParse.amount}{previewParse.unit}
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
              disabled={isSubmitting || !previewParse}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Logging...
                </span>
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