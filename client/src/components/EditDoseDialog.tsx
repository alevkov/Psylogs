import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';
import { ADMINISTRATION_METHODS, UNITS } from '../lib/constants';
import { format, parseISO } from 'date-fns';

const allRoutes = Object.values(ADMINISTRATION_METHODS)
  .flat()
  .filter(route => !route.startsWith('@'))
  .sort();

// Helper function to convert UTC ISO string to local datetime-local format
const utcToLocalDatetimeLocal = (utcIsoString: string | null | undefined): string => {
  if (!utcIsoString) return '';
  const date = parseISO(utcIsoString);
  return format(date, "yyyy-MM-dd'T'HH:mm");
};

// Helper function to convert local datetime-local to UTC ISO string
const localToUtcIsoString = (localDatetime: string): string => {
  if (!localDatetime) return '';
  console.log('Converting local datetime:', localDatetime);
  
  // For datetime-local input, we need to handle it specially
  // The value from input is in format YYYY-MM-DDThh:mm without timezone info
  // Create a new date object treating this as local time
  const [datePart, timePart] = localDatetime.split('T');
  if (datePart && timePart) {
    // This is a datetime-local format
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    
    // Create date using local components, so it will be correctly converted to UTC
    const localDate = new Date(year, month - 1, day, hours, minutes);
    const isoString = localDate.toISOString();
    console.log('Converted to ISO:', isoString);
    return isoString;
  }
  
  // Fallback for other formats - direct conversion
  const date = new Date(localDatetime);
  const isoString = date.toISOString();
  console.log('Fallback conversion to ISO:', isoString);
  return isoString;
};

export default function EditDoseDialog({ 
  dose, 
  open, 
  onOpenChange,
  onSave 
}: { 
  dose: { 
    id: number;
    substance: string;
    amount: number;
    unit: typeof UNITS[number];
    route: string;
    timestamp: string;
    onsetAt?: string;
    peakAt?: string;
    offsetAt?: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, updates: any) => Promise<void>;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    substance: dose.substance,
    amount: dose.amount,
    unit: dose.unit,
    route: dose.route,
    timestamp: dose.timestamp,
    onsetAt: dose.onsetAt || '',
    peakAt: dose.peakAt || '',
    offsetAt: dose.offsetAt || '',
  });

  // Reset form data when dose changes
  useEffect(() => {
    setFormData({
      substance: dose.substance,
      amount: dose.amount,
      unit: dose.unit,
      route: dose.route,
      timestamp: dose.timestamp,
      onsetAt: dose.onsetAt || '',
      peakAt: dose.peakAt || '',
      offsetAt: dose.offsetAt || '',
    });
  }, [dose]);
  
  const [errors, setErrors] = useState<{
    timestamp?: string;
    onsetAt?: string;
    peakAt?: string;
    offsetAt?: string;
  }>({});

  // Validate timestamp sequence
  const validateTimestamps = (
    creation: string,
    onset: string,
    peak: string,
    offset: string
  ) => {
    const newErrors: typeof errors = {};
    const creationTime = new Date(creation);
    
    if (!creation) {
      newErrors.timestamp = "Creation time is required";
    }
    
    if (onset && new Date(onset) < creationTime) {
      newErrors.onsetAt = "Onset time cannot be before dose time";
    }
    
    if (peak) {
      if (!onset) {
        newErrors.peakAt = "Must set onset time before peak";
      } else if (new Date(peak) < new Date(onset)) {
        newErrors.peakAt = "Peak time must be after onset";
      }
    }
    
    if (offset) {
      if (!peak) {
        newErrors.offsetAt = "Must set peak time before offset";
      } else if (new Date(offset) < new Date(peak)) {
        newErrors.offsetAt = "Offset time must be after peak";
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // For debugging
      console.log('Form timestamp before conversion:', formData.timestamp);
      
      // Convert local datetime format to UTC ISO string, handle the case with already converted string
      let timestampUtc;
      // Check if timestamp is already in ISO format (contains 'T' and 'Z', ISO timezone indicator)
      if (formData.timestamp.includes('T') && (formData.timestamp.includes('Z') || formData.timestamp.includes('+'))) {
        timestampUtc = formData.timestamp;
        console.log('Timestamp already in UTC format');
      } else {
        timestampUtc = localToUtcIsoString(formData.timestamp);
        console.log('Converted timestamp to UTC:', timestampUtc);
      }
      
      const onsetTime = formData.onsetAt ? localToUtcIsoString(formData.onsetAt) : undefined;
      const peakTime = formData.peakAt ? localToUtcIsoString(formData.peakAt) : undefined;
      const offsetTime = formData.offsetAt ? localToUtcIsoString(formData.offsetAt) : undefined;

      // Validate timestamp sequence
      const isValid = validateTimestamps(
        timestampUtc, // Use UTC ISO string for validation
        formData.onsetAt ? localToUtcIsoString(formData.onsetAt) : '',
        formData.peakAt ? localToUtcIsoString(formData.peakAt) : '',
        formData.offsetAt ? localToUtcIsoString(formData.offsetAt) : ''
      );

      if (!isValid) {
        setIsLoading(false);
        return;
      }

      // Create a new object without spreading formData to avoid timestamp format issues
      const updates = {
        substance: formData.substance,
        amount: formData.amount,
        unit: formData.unit,
        route: formData.route,
        timestamp: timestampUtc, // Use the converted timestamp
        onsetAt: onsetTime,
        peakAt: peakTime,
        offsetAt: offsetTime,
      };
      
      // Remove undefined timestamps
      if (!updates.onsetAt) delete updates.onsetAt;
      if (!updates.peakAt) delete updates.peakAt;
      if (!updates.offsetAt) delete updates.offsetAt;
      
      console.log('Saving updates:', updates);
      await onSave(dose.id, updates);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to update dose:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Edit Dose</DialogTitle>
          <button 
            type="button"
            className="bg-muted/20 p-3 rounded-full hover:bg-muted cursor-pointer flex items-center justify-center" 
            onClick={() => onOpenChange(false)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
            <span className="sr-only">Close</span>
          </button>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Main substance info section */}
          <div className="space-y-4 p-2 bg-muted/10 rounded-md">
            <div className="space-y-2">
              <label className="text-sm font-medium">Substance</label>
              <Input
                value={formData.substance}
                onChange={(e) => setFormData(prev => ({ ...prev, substance: e.target.value }))}
                required
                className="bg-background/100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input
                  type="number"
                  step="any"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                  required
                  className="bg-background/100"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Unit</label>
                <Select
                  value={formData.unit}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, unit: value as typeof UNITS[number] }))}
                >
                  <SelectTrigger className="bg-background/100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Route</label>
              <Select
                value={formData.route}
                onValueChange={(value) => setFormData(prev => ({ ...prev, route: value }))}
              >
                <SelectTrigger className="bg-background/100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allRoutes.map((route) => (
                    <SelectItem key={route} value={route}>
                      {route}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Timestamps section */}
          <div className="space-y-4 p-2 bg-muted/10 rounded-md">
            <h3 className="font-medium text-sm">Timestamps</h3>
            
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex justify-between">
                <span>Creation Time</span>
                <span className="text-xs">(Required)</span>
              </label>
              <div className="space-y-1">
                <Input
                  type="datetime-local"
                  value={utcToLocalDatetimeLocal(formData.timestamp)}
                  onChange={(e) => {
                    const newTimestamp = e.target.value;
                    console.log('New timestamp input:', newTimestamp);
                    const convertedTimestamp = localToUtcIsoString(newTimestamp);
                    console.log('Converted to UTC:', convertedTimestamp);
                    setFormData(prev => {
                      const updated = { ...prev, timestamp: convertedTimestamp };
                      console.log('Updated form data:', updated);
                      return updated;
                    });
                    validateTimestamps(
                      convertedTimestamp,
                      formData.onsetAt ? localToUtcIsoString(formData.onsetAt) : '',
                      formData.peakAt ? localToUtcIsoString(formData.peakAt) : '',
                      formData.offsetAt ? localToUtcIsoString(formData.offsetAt) : ''
                    );
                  }}
                  required
                  className="bg-background/100"
                />
                {errors.timestamp && (
                  <p className="text-sm text-destructive">{errors.timestamp}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Onset</label>
                <div className="space-y-1">
                  <Input
                    type="datetime-local"
                    value={utcToLocalDatetimeLocal(formData.onsetAt)}
                    onChange={(e) => {
                      const newOnsetTime = e.target.value;
                      console.log('New onset time:', newOnsetTime);
                      // Don't convert to UTC here - just store the raw datetime-local value
                      setFormData(prev => ({ ...prev, onsetAt: newOnsetTime }));
                      validateTimestamps(
                        formData.timestamp,
                        localToUtcIsoString(newOnsetTime),
                        formData.peakAt ? localToUtcIsoString(formData.peakAt) : '',
                        formData.offsetAt ? localToUtcIsoString(formData.offsetAt) : ''
                      );
                    }}
                    className="bg-background/100"
                  />
                  {errors.onsetAt && (
                    <p className="text-sm text-destructive">{errors.onsetAt}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Peak</label>
                <div className="space-y-1">
                  <Input
                    type="datetime-local"
                    value={utcToLocalDatetimeLocal(formData.peakAt)}
                    onChange={(e) => {
                      const newPeakTime = e.target.value;
                      console.log('New peak time:', newPeakTime);
                      // Don't convert to UTC here - just store the raw datetime-local value
                      setFormData(prev => ({ ...prev, peakAt: newPeakTime }));
                      validateTimestamps(
                        formData.timestamp,
                        formData.onsetAt ? localToUtcIsoString(formData.onsetAt) : '',
                        localToUtcIsoString(newPeakTime),
                        formData.offsetAt ? localToUtcIsoString(formData.offsetAt) : ''
                      );
                    }}
                    className="bg-background/100"
                  />
                  {errors.peakAt && (
                    <p className="text-sm text-destructive">{errors.peakAt}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Offset</label>
                <div className="space-y-1">
                  <Input
                    type="datetime-local"
                    value={utcToLocalDatetimeLocal(formData.offsetAt)}
                    onChange={(e) => {
                      const newOffsetTime = e.target.value;
                      console.log('New offset time:', newOffsetTime);
                      // Don't convert to UTC here - just store the raw datetime-local value
                      setFormData(prev => ({ ...prev, offsetAt: newOffsetTime }));
                      validateTimestamps(
                        formData.timestamp,
                        formData.onsetAt ? localToUtcIsoString(formData.onsetAt) : '',
                        formData.peakAt ? localToUtcIsoString(formData.peakAt) : '',
                        localToUtcIsoString(newOffsetTime)
                      );
                    }}
                    className="bg-background/100"
                  />
                  {errors.offsetAt && (
                    <p className="text-sm text-destructive">{errors.offsetAt}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            <div className="w-full flex justify-between gap-2">
              <Button 
                variant="outline" 
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}