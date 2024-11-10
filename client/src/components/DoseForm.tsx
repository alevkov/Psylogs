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
import { Loader2 } from "lucide-react";
import { useDoseContext } from "@/contexts/DoseContext";

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

export function DoseForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewConversion, setPreviewConversion] = useState<string | null>(
    null,
  );
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const { toast } = useToast();
  const { triggerUpdate } = useDoseContext();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    setSubmitStatus("idle");
    try {
      const parsed = parseDoseString(data.doseString);
      await addDose(parsed);
      form.reset();
      setSubmitStatus("success");
      triggerUpdate(); // Trigger update after successful dose addition
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

  // Rest of the component remains the same
  useEffect(() => {
    const doseString = form.watch("doseString")?.toLowerCase() || "";
    const words = doseString.split(" ");
    const lastWord = words[words.length - 1];

    if (!lastWord) {
      setSuggestions([]);
      return;
    }

    if (words.length <= 2) {
      const substanceSuggestions = COMMON_SUBSTANCES.filter((s) =>
        s.startsWith(lastWord),
      ).slice(0, 5);
      setSuggestions(substanceSuggestions);
    } else {
      const routeSuggestions = Object.values(ADMINISTRATION_METHODS)
        .flat()
        .filter((r) => r.startsWith(lastWord))
        .slice(0, 5);
      setSuggestions(routeSuggestions);
    }

    const match = doseString.match(/(\d+\.?\d*)(ug|g)\s/);
    if (match) {
      const [, amount, unit] = match;
      const value = parseFloat(amount);
      if (!isNaN(value)) {
        const mgValue = unit === "ug" ? value / 1000 : value * 1000;
        setPreviewConversion(`${value}${unit} = ${mgValue}mg`);
      }
    } else {
      setPreviewConversion(null);
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
          <h2 className="text-xl font-bold text-center">Enter Dose</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <motion.div
              className="space-y-2"
              animate={submitStatus}
              variants={{
                success: {
                  scale: [1, 1.02, 1],
                  borderColor: ["#ccc", "#22c55e", "#ccc"],
                },
                error: { x: [0, -10, 10, -10, 10, 0] },
              }}
            >
              <Input
                placeholder="e.g. 200mg caffeine oral"
                {...form.register("doseString")}
                className="w-full transition-all"
                disabled={isSubmitting}
              />
              <AnimatePresence>
                {suggestions.length > 0 && (
                  <motion.div
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
              </AnimatePresence>
              {previewConversion && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-muted-foreground"
                >
                  {previewConversion}
                </motion.p>
              )}
              {form.formState.errors.doseString && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-destructive"
                >
                  {form.formState.errors.doseString.message}
                </motion.p>
              )}
            </motion.div>
            <Button
              type="submit"
              className="w-full relative"
              disabled={isSubmitting}
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
