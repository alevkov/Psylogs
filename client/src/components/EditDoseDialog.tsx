import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DoseEntry } from "@/lib/constants";
import { ADMINISTRATION_METHODS } from "@/lib/constants";

interface EditDoseDialogProps {
  dose: DoseEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updatedDose: Partial<DoseEntry>) => Promise<void>;
}

export function EditDoseDialog({ dose, open, onOpenChange, onSave }: EditDoseDialogProps) {
  const [amount, setAmount] = useState(dose.amount.toString());
  const [unit, setUnit] = useState(dose.unit);
  const [route, setRoute] = useState(dose.route);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        amount: parseFloat(amount),
        unit,
        route,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save dose:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Dose - {dose.substance}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2">
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min="0"
              step="0.1"
              className="w-24"
            />
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mg">mg</SelectItem>
                <SelectItem value="ug">ug</SelectItem>
                <SelectItem value="ml">ml</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select value={route} onValueChange={setRoute}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADMINISTRATION_METHODS.standard.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
