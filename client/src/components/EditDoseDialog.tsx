import { useState, useEffect } from 'react';
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
  const date = new Date(localDatetime);
  return date.toISOString();
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
      const onsetTime = formData.onsetAt ? localToUtcIsoString(formData.onsetAt) : undefined;
      const peakTime = formData.peakAt ? localToUtcIsoString(formData.peakAt) : undefined;
      const offsetTime = formData.offsetAt ? localToUtcIsoString(formData.offsetAt) : undefined;

      // Validate timestamp sequence
      const isValid = validateTimestamps(
        formData.timestamp,
        formData.onsetAt || '',
        formData.peakAt || '',
        formData.offsetAt || ''
      );

      if (!isValid) {
        setIsLoading(false);
        return;
      }

      const updates = {
        ...formData,
        onsetAt: onsetTime,
        peakAt: peakTime,
        offsetAt: offsetTime,
      };
      
      // Remove undefined timestamps
      if (!updates.onsetAt) delete updates.onsetAt;
      if (!updates.peakAt) delete updates.peakAt;
      if (!updates.offsetAt) delete updates.offsetAt;
      
      await onSave(dose.id, updates);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to update dose:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Dose</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Creation Time</label>
            <div className="space-y-1">
              <Input
                type="datetime-local"
                value={utcToLocalDatetimeLocal(formData.timestamp)}
                onChange={(e) => {
                  const newTimestamp = e.target.value;
                  setFormData(prev => ({ ...prev, timestamp: localToUtcIsoString(newTimestamp) }));
                  validateTimestamps(
                    localToUtcIsoString(newTimestamp),
                    formData.onsetAt ? localToUtcIsoString(formData.onsetAt) : '',
                    formData.peakAt ? localToUtcIsoString(formData.peakAt) : '',
                    formData.offsetAt ? localToUtcIsoString(formData.offsetAt) : ''
                  );
                }}
                required
              />
              {errors.timestamp && (
                <p className="text-sm text-destructive">{errors.timestamp}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Substance</label>
            <Input
              value={formData.substance}
              onChange={(e) => setFormData(prev => ({ ...prev, substance: e.target.value }))}
              required
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
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Unit</label>
              <Select
                value={formData.unit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, unit: value as typeof UNITS[number] }))}
              >
                <SelectTrigger>
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
              <SelectTrigger>
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Onset Time</label>
            <div className="space-y-1">
              <Input
                type="datetime-local"
                value={utcToLocalDatetimeLocal(formData.onsetAt)}
                onChange={(e) => {
                  const newOnsetTime = e.target.value;
                  setFormData(prev => ({ ...prev, onsetAt: newOnsetTime }));
                  validateTimestamps(
                    formData.timestamp,
                    localToUtcIsoString(newOnsetTime),
                    formData.peakAt ? localToUtcIsoString(formData.peakAt) : '',
                    formData.offsetAt ? localToUtcIsoString(formData.offsetAt) : ''
                  );
                }}
              />
              {errors.onsetAt && (
                <p className="text-sm text-destructive">{errors.onsetAt}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Peak Time</label>
            <div className="space-y-1">
              <Input
                type="datetime-local"
                value={utcToLocalDatetimeLocal(formData.peakAt)}
                onChange={(e) => {
                  const newPeakTime = e.target.value;
                  setFormData(prev => ({ ...prev, peakAt: newPeakTime }));
                  validateTimestamps(
                    formData.timestamp,
                    formData.onsetAt ? localToUtcIsoString(formData.onsetAt) : '',
                    localToUtcIsoString(newPeakTime),
                    formData.offsetAt ? localToUtcIsoString(formData.offsetAt) : ''
                  );
                }}
              />
              {errors.peakAt && (
                <p className="text-sm text-destructive">{errors.peakAt}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Offset Time</label>
            <div className="space-y-1">
              <Input
                type="datetime-local"
                value={utcToLocalDatetimeLocal(formData.offsetAt)}
                onChange={(e) => {
                  const newOffsetTime = e.target.value;
                  setFormData(prev => ({ ...prev, offsetAt: newOffsetTime }));
                  validateTimestamps(
                    formData.timestamp,
                    formData.onsetAt ? localToUtcIsoString(formData.onsetAt) : '',
                    formData.peakAt ? localToUtcIsoString(formData.peakAt) : '',
                    localToUtcIsoString(newOffsetTime)
                  );
                }}
              />
              {errors.offsetAt && (
                <p className="text-sm text-destructive">{errors.offsetAt}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}