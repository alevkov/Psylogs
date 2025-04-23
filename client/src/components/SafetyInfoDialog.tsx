import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Button } from "./ui/button";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Info, Clock, Activity, AlertTriangle } from "lucide-react";

interface SafetyInfoDialogProps {
  safetyInfo: {
    dosageGuidance: string;
    safetyWarnings: string[];
    effects: string[];
    duration?: string;
    onset?: string;
  };
  substance: string;
}

export function SafetyInfoDialog({ safetyInfo, substance }: SafetyInfoDialogProps) {
  // Removed special case for omeprazole - we now have a proper solution in substance-safety.ts
  // that checks all substances for actual useful data
  console.log(safetyInfo)
  // Make sure safetyInfo itself isn't null or undefined
  if (!safetyInfo) {
    return null;
  }
  
  // Check if we actually have meaningful safety information to display
  // If any of these conditions are true, we have enough data to show the dialog
  const hasEffects = safetyInfo.effects && safetyInfo.effects.length > 0 && 
                    safetyInfo.effects.some(e => e && e.trim().length > 0);
  
  const hasWarnings = safetyInfo.safetyWarnings && safetyInfo.safetyWarnings.length > 0 && 
                     safetyInfo.safetyWarnings.some(w => w && w.trim().length > 0);
  
  const hasTiming = (safetyInfo.duration && safetyInfo.duration.trim().length > 0) || 
                    (safetyInfo.onset && safetyInfo.onset.trim().length > 0);
  
  // If we don't have any meaningful data to show, don't render anything
  if (!hasEffects && !hasWarnings && !hasTiming) {
    return null;
  }
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full mt-2">
          <Info className="h-4 w-4 mr-2" />
          View Safety Information
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Safety Information for {substance}</DialogTitle>
        </DialogHeader>

        <Accordion type="multiple" className="w-full">
          {/* Dosage Guidance Section */}
          {safetyInfo.dosageGuidance && (
            <AccordionItem value="dosage">
              <AccordionTrigger className="text-sm font-medium py-2">
                Dosage Guidance
              </AccordionTrigger>
              <AccordionContent>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    {safetyInfo.dosageGuidance}
                  </AlertDescription>
                </Alert>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Safety Warnings Section */}
          {hasWarnings && (
            <AccordionItem value="warnings">
              <AccordionTrigger className="text-sm font-medium py-2">
                Safety Warnings
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {safetyInfo.safetyWarnings.map((warning, index) => (
                    <Alert key={index} variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Warning</AlertTitle>
                      <AlertDescription>{warning}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Effects Section */}
          {hasEffects && (
            <AccordionItem value="effects">
              <AccordionTrigger className="text-sm font-medium py-2">
                Effects
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-wrap gap-2">
                  {safetyInfo.effects.map((effect, index) => (
                    <Badge key={index} variant="secondary">
                      {effect}
                    </Badge>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Duration/Onset Section */}
          {hasTiming && (
            <AccordionItem value="timing">
              <AccordionTrigger className="text-sm font-medium py-2">
                Timing Information
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  {safetyInfo.onset && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>{safetyInfo.onset}</span>
                    </div>
                  )}
                  {safetyInfo.duration && (
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      <span>{safetyInfo.duration}</span>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}