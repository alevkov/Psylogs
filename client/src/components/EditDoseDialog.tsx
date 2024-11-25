import { useState } from 'react';
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
    onsetAt: dose.onsetAt || '',
    peakAt: dose.peakAt || '',
    offsetAt: dose.offsetAt || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const updates = {
        ...formData,
        // Convert all timestamps to UTC before saving
        onsetAt: formData.onsetAt ? localToUtcIsoString(formData.onsetAt) : undefined,
        peakAt: formData.peakAt ? localToUtcIsoString(formData.peakAt) : undefined,
        offsetAt: formData.offsetAt ? localToUtcIsoString(formData.offsetAt) : undefined,
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
            <Input
              type="datetime-local"
              value={utcToLocalDatetimeLocal(formData.onsetAt)}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, onsetAt: e.target.value }));
              }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Peak Time</label>
            <Input
              type="datetime-local"
              value={utcToLocalDatetimeLocal(formData.peakAt)}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, peakAt: e.target.value }));
              }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Offset Time</label>
            <Input
              type="datetime-local"
              value={utcToLocalDatetimeLocal(formData.offsetAt)}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, offsetAt: e.target.value }));
              }}
            />
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