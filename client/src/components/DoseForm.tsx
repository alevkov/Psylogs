import { useState } from 'react';
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

const formSchema = z.object({
  doseString: z.string().min(1, 'Please enter a dose'),
});

export function DoseForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
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
        title: "Dose logged successfully",
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
