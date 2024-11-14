import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDoses } from "@/lib/db";
import type { DoseEntry } from "@/lib/constants";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  format,
  isToday,
  isYesterday,
  isSameWeek,
  formatDistanceToNow,
  parseISO,
  differenceInMinutes,
} from "date-fns";
import {
  Loader2,
  Filter,
  ChevronDown,
  ChevronUp,
  Calendar,
  Pill,
  Route,
  MoreHorizontal,
  Pencil,
  Trash,
  Clock,
  Star,
  Activity,
  Timer,
  WaveformIcon,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDoseContext } from "@/contexts/DoseContext";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteDose, updateDose } from "@/lib/db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import EditDoseDialog from "./EditDoseDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Generate consistent colors for substances
const getSubstanceColor = (substance: string, isDarkMode: boolean) => {
  let hash = 0;
  for (let i = 0; i < substance.length; i++) {
    hash = substance.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;

  // Adjust saturation and lightness for dark mode
  if (isDarkMode) {
    return `hsl(${hue}, 70%, 45%)`; // Darker, more saturated colors
  }
  return `hsl(${hue}, 70%, 90%)`; // Original light mode colors
};

interface GroupedDoses {
  [key: string]: DoseEntry[];
}

function DurationVisualizer({ dose }: { dose: DoseEntry }) {
  if (!dose.onsetAt) return null;

  const startTime = parseISO(dose.timestamp);
  const onsetTime = parseISO(dose.onsetAt);
  const peakTime = dose.peakAt ? parseISO(dose.peakAt) : null;
  const offsetTime = dose.offsetAt ? parseISO(dose.offsetAt) : null;

  const lastTime = offsetTime || peakTime || onsetTime;
  const totalDuration = differenceInMinutes(lastTime, startTime);
  
  if (totalDuration <= 0) return null;

  const onsetPercent = Math.max(0, Math.min(100, 
    (differenceInMinutes(onsetTime, startTime) / totalDuration) * 100
  ));
  
  const peakPercent = peakTime ? Math.max(0, Math.min(100,
    (differenceInMinutes(peakTime, startTime) / totalDuration) * 100
  )) : null;
  
  const offsetPercent = offsetTime ? Math.max(0, Math.min(100,
    (differenceInMinutes(offsetTime, startTime) / totalDuration) * 100
  )) : null;

  return (
    <div className="mt-2 space-y-1">
      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-primary/20 rounded-full"
          style={{ width: `${onsetPercent}%` }}
        />
        {peakTime && (
          <div
            className="absolute h-full bg-primary/40 rounded-full"
            style={{
              left: `${onsetPercent}%`,
              width: `${peakPercent - onsetPercent}%`
            }}
          />
        )}
        {offsetTime && peakTime && (
          <div
            className="absolute h-full bg-primary/20 rounded-full"
            style={{
              left: `${peakPercent}%`,
              width: `${offsetPercent - peakPercent}%`
            }}
          />
        )}
        {/* Timeline markers */}
        <div
          className="absolute top-0 w-1 h-full bg-primary"
          style={{ left: `${onsetPercent}%` }}
        />
        {peakTime && (
          <div
            className="absolute top-0 w-1 h-full bg-primary"
            style={{ left: `${peakPercent}%` }}
          />
        )}
        {offsetTime && (
          <div
            className="absolute top-0 w-1 h-full bg-primary"
            style={{ left: `${offsetPercent}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0m</span>
        <span>{totalDuration}m</span>
      </div>
    </div>
  );
}

function TimestampButton({ 
  dose,
  type,
  value,
  onUpdate,
  disabled = false
}: { 
  dose: DoseEntry;
  type: 'onset' | 'peak' | 'offset';
  value?: string;
  onUpdate: (type: string, value: string) => Promise<void>;
  disabled?: boolean;
}) {
  const getIcon = () => {
    switch (type) {
      case 'onset':
        return <Clock className="h-4 w-4" />;
      case 'peak':
        return <WaveformIcon className="h-4 w-4" />;
      case 'offset':
        return <TrendingDown className="h-4 w-4" />;
    }
  };

  const handleClick = async () => {
    if (disabled || value) return;
    const now = new Date().toISOString();
    await onUpdate(type, now);
  };

  if (value) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="cursor-default">
              {type}: {format(parseISO(value), 'HH:mm')}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{format(parseISO(value), 'PPpp')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      className="flex items-center gap-1"
    >
      {getIcon()}
      <span className="capitalize">{type}</span>
    </Button>
  );
}

export function DoseHistory() {
  const [doses, setDoses] = useState<DoseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoStack, setUndoStack] = useState<DoseEntry[]>([]);
  const [selectedSubstances, setSelectedSubstances] = useState<string[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [selectedDose, setSelectedDose] = useState<DoseEntry | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<"time" | "substance" | "route">(
    "time",
  );
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains("dark"),
  );
  const { toast } = useToast();
  const { updateTrigger } = useDoseContext();

  useEffect(() => {
    const loadDoses = async () => {
      try {
        const loadedDoses = await getDoses();
        setDoses(loadedDoses.reverse());

        // Initialize filters with all unique values
        const substances = [...new Set(loadedDoses.map((d) => d.substance))];
        const routes = [...new Set(loadedDoses.map((d) => d.route))];
        setSelectedSubstances(substances);
        setSelectedRoutes(routes);
      } catch (error) {
        console.error("Error loading doses:", error);
      } finally {
        setLoading(false);
      }
    };
    loadDoses();
  }, [updateTrigger]);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          setIsDarkMode(document.documentElement.classList.contains("dark"));
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const handleUndo = async () => {
    if (undoStack.length === 0) return;

    const lastDose = undoStack[undoStack.length - 1];
    try {
      setUndoStack((prev) => prev.slice(0, -1));
      setDoses((prev) => prev.filter((d) => d.id !== lastDose.id));

      toast({
        title: "Dose removed",
        description: "The last dose has been removed",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error removing dose",
        description: "Could not remove the dose",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedDose?.id) return;
    try {
      await deleteDose(selectedDose.id);
      setDoses((prev) => prev.filter((d) => d.id !== selectedDose.id));
      toast({
        title: "Dose deleted",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error deleting dose",
        description: "Failed to delete the dose",
        variant: "destructive",
      });
    }
    setIsDeleteDialogOpen(false);
    setSelectedDose(null);
  };

  const handleUpdate = async (id: number, updates: Partial<DoseEntry>) => {
    try {
      await updateDose(id, updates);
      setDoses((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      );
      toast({
        title: "Dose updated",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error updating dose",
        description: "Failed to update the dose",
        variant: "destructive",
      });
    }
  };

  const filteredDoses = doses.filter(
    (dose) =>
      selectedSubstances.includes(dose.substance) &&
      selectedRoutes.includes(dose.route),
  );

  const groupDoses = (doses: DoseEntry[]): GroupedDoses => {
    if (groupBy === "substance") {
      return doses.reduce((groups: GroupedDoses, dose) => {
        const key = dose.substance;
        if (!groups[key]) groups[key] = [];
        groups[key].push(dose);
        return groups;
      }, {});
    }

    if (groupBy === "route") {
      return doses.reduce((groups: GroupedDoses, dose) => {
        const key = dose.route;
        if (!groups[key]) groups[key] = [];
        groups[key].push(dose);
        return groups;
      }, {});
    }

    // Default: group by time
    return doses.reduce((groups: GroupedDoses, dose) => {
      let key = "Older";
      if (isToday(new Date(dose.timestamp))) {
        key = "Today";
      } else if (isYesterday(new Date(dose.timestamp))) {
        key = "Yesterday";
      } else if (isSameWeek(new Date(dose.timestamp), new Date())) {
        key = "This Week";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(dose);
      return groups;
    }, {});
  };

  const groupedDoses = groupDoses(filteredDoses);

  const handleTimestampUpdate = async (dose: DoseEntry, type: string, value: string) => {
    if (!dose.id) return;
    
    try {
      const updates = {
        [`${type}At`]: value
      };
      
      await updateDose(dose.id, updates);
      setDoses(prev =>
        prev.map(d => d.id === dose.id ? { ...d, ...updates } : d)
      );
      
      toast({
        title: `${type} time set`,
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: `Error setting ${type} time`,
        description: "Failed to update the dose",
        variant: "destructive",
      });
    }
  };

  const getTimestampButtonState = (dose: DoseEntry, type: 'onset' | 'peak' | 'offset') => {
    switch (type) {
      case 'onset':
        return false;
      case 'peak':
        return !dose.onsetAt;
      case 'offset':
        return !dose.peakAt || !dose.onsetAt;
    }
  };

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-4">
          <div className="flex items-center justify-center h-[400px]">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const getGroupIcon = () => {
    switch (groupBy) {
      case "substance":
        return <Pill className="h-4 w-4" />;
      case "route":
        return <Route className="h-4 w-4" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Recent Doses</h2>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Substances</DropdownMenuLabel>
                {[...new Set(doses.map((d) => d.substance))].map(
                  (substance) => (
                    <DropdownMenuCheckboxItem
                      key={substance}
                      checked={selectedSubstances.includes(substance)}
                      onCheckedChange={(checked) => {
                        setSelectedSubstances((prev) =>
                          checked
                            ? [...prev, substance]
                            : prev.filter((s) => s !== substance),
                        );
                      }}
                    >
                      {substance}
                    </DropdownMenuCheckboxItem>
                  ),
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Routes</DropdownMenuLabel>
                {[...new Set(doses.map((d) => d.route))].map((route) => (
                  <DropdownMenuCheckboxItem
                    key={route}
                    checked={selectedRoutes.includes(route)}
                    onCheckedChange={(checked) => {
                      setSelectedRoutes((prev) =>
                        checked
                          ? [...prev, route]
                          : prev.filter((r) => r !== route),
                      );
                    }}
                  >
                    {route}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {getGroupIcon()}
                  <span className="ml-2">Group by</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={groupBy === "time"}
                  onCheckedChange={() => setGroupBy("time")}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Time
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={groupBy === "substance"}
                  onCheckedChange={() => setGroupBy("substance")}
                >
                  <Pill className="h-4 w-4 mr-2" />
                  Substance
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={groupBy === "route"}
                  onCheckedChange={() => setGroupBy("route")}
                >
                  <Route className="h-4 w-4 mr-2" />
                  Route
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ScrollArea className="h-[400px] w-full">
          <AnimatePresence>
            {Object.entries(groupedDoses).map(([group, groupDoses]) => (
              <motion.div
                key={group}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-sm text-muted-foreground">
                    {group}
                  </h3>
                  <Badge variant="secondary">{groupDoses.length}</Badge>
                </div>

                <div className="space-y-2">
                  {groupDoses.map((dose, index) => (
                    <motion.div
                      key={dose.id || index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card
                        style={{
                          backgroundColor: getSubstanceColor(
                            dose.substance,
                            isDarkMode,
                          ),
                          transition: "all 0.2s ease-in-out",
                        }}
                      >
                        <CardContent className="p-2">
                          <div className="flex justify-between items-start">
                            <div className="space-y-3">
                              <div className="p-3">
                                <h4 className="font-medium">{dose.substance}</h4>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-xs">
                                  {dose.amount}
                                  {dose.unit}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {dose.route}
                                </Badge>
                                <span className="text-xs text-foreground right-2">
                                  {formatDistanceToNow(new Date(dose.timestamp), {
                                    addSuffix: true,
                                  })}
                                </span>
                              </div>
                              
                              <div className="flex flex-wrap gap-2">
                                <TimestampButton
                                  dose={dose}
                                  type="onset"
                                  value={dose.onsetAt}
                                  onUpdate={(type, value) => handleTimestampUpdate(dose, type, value)}
                                  disabled={!!dose.offsetAt}
                                />
                                <TimestampButton
                                  dose={dose}
                                  type="peak"
                                  value={dose.peakAt}
                                  onUpdate={(type, value) => handleTimestampUpdate(dose, type, value)}
                                  disabled={getTimestampButtonState(dose, 'peak') || !!dose.offsetAt}
                                />
                                <TimestampButton
                                  dose={dose}
                                  type="offset"
                                  value={dose.offsetAt}
                                  onUpdate={(type, value) => handleTimestampUpdate(dose, type, value)}
                                  disabled={getTimestampButtonState(dose, 'offset')}
                                />
                              </div>

                              {(dose.onsetAt || dose.peakAt || dose.offsetAt) && (
                                <DurationVisualizer dose={dose} />
                              )}
                            </div>

                     
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedDose(dose);
                                      setIsEditDialogOpen(true);
                                    }}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => {
                                      setSelectedDose(dose);
                                      setIsDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
 
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredDoses.length === 0 && (
            <div className="text-center text-muted-foreground p-4">
              {doses.length === 0
                ? "No doses logged yet"
                : "No doses match the current filters"}
            </div>
          )}
        </ScrollArea>

        {undoStack.length > 0 && (
          <div className="mt-4 flex justify-center">
            <Button variant="ghost" size="sm" onClick={handleUndo}>
              Undo Last Action
            </Button>
          </div>
        )}
      </CardContent>
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              dose record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedDose && (
        <EditDoseDialog
          dose={selectedDose}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSave={handleUpdate}
        />
      )}
    </Card>
  );
}