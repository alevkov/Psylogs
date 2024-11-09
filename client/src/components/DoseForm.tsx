import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { parseDoseString } from '@/lib/dose-parser';
import { addDose } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { ADMINISTRATION_METHODS } from '@/lib/constants';

const formSchema = z.object({
  doseString: z.string().min(1, 'Please enter a dose'),
});

const COMMON_SUBSTANCES = [
  'acetaminophen',
  'ibuprofen',
  'aspirin',
  'amoxicillin',
  'omeprazole',
];

export function DoseForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewConversion, setPreviewConversion] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const { toast } = useToast();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const parsed = parseDoseString(data.doseString);
      await addDose(parsed);
      form.reset();
      toast({
        title: navigator.onLine ? "Dose logged successfully" : "Dose queued for sync",
        description: navigator.onLine ? undefined : "Will be synced when you're back online",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Error logging dose",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle input suggestions
  useEffect(() => {
    const doseString = form.watch('doseString')?.toLowerCase() || '';
    const words = doseString.split(' ');
    const lastWord = words[words.length - 1];

    if (!lastWord) {
      setSuggestions([]);
      return;
    }

    // Suggest substances
    if (words.length <= 2) {
      const substanceSuggestions = COMMON_SUBSTANCES
        .filter(s => s.startsWith(lastWord))
        .slice(0, 5);
      setSuggestions(substanceSuggestions);
    }
    // Suggest routes
    else {
      const routeSuggestions = Object.values(ADMINISTRATION_METHODS)
        .flat()
        .filter(r => r.startsWith(lastWord))
        .slice(0, 5);
      setSuggestions(routeSuggestions);
    }

    // Show unit conversion preview
    const match = doseString.match(/(\d+\.?\d*)(ug|g)\s/);
    if (match) {
      const [, amount, unit] = match;
      const value = parseFloat(amount);
      if (!isNaN(value)) {
        const mgValue = unit === 'ug' ? value / 1000 : value * 1000;
        setPreviewConversion(`${value}${unit} = ${mgValue}mg`);
      }
    } else {
      setPreviewConversion(null);
    }
  }, [form.watch('doseString')]);

  const applySuggestion = (suggestion: string) => {
    const doseString = form.watch('doseString') || '';
    const words = doseString.split(' ');
    words[words.length - 1] = suggestion;
    form.setValue('doseString', words.join(' '));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <h2 className="text-2xl font-bold text-center">Log Dose</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="20mg substance route"
                {...form.register('doseString')}
                className="w-full"
              />
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              )}
              {previewConversion && (
                <p className="text-sm text-muted-foreground">
                  {previewConversion}
                </p>
              )}
              {form.formState.errors.doseString && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.doseString.message}
                </p>
              )}
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Logging...' : 'Log Dose'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
