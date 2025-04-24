import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDoses, updateDose, deleteDose } from "../lib/db";
import { UNITS, type DoseEntry } from "../lib/constants";
import { Card, CardContent, CardHeader } from "./ui/card";
import { useIsMobile } from "../hooks/use-mobile";
import { FixedSizeList as List } from 'react-window';
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
  TrendingDown,
} from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";
import { useDoseContext } from "../contexts/DoseContext";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import EditDoseDialog from "./EditDoseDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

// Generate consistent colors for substances
const getSubstanceColor = (substance: string, isDarkMode: boolean) => {
  let hash = 0;
  for (let i = 0; i < substance.length; i++) {
    hash = substance.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;

  // Adjust saturation and lightness based on dark mode
  return isDarkMode
    ? `hsl(${hue}, 70%, 15%)` // Darker background
    : `hsl(${hue}, 70%, 95%)`; // Lighter background
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
    <div className="mt-1 sm:mt-2 space-y-0.5 sm:space-y-1">
      <div className="relative h-1.5 sm:h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-primary/20 rounded-full"
          style={{ width: `${onsetPercent}%` }}
        />
        {peakTime && (
          <div
            className="absolute h-full bg-primary/40 rounded-full"
            style={{
              left: `${onsetPercent}%`,
              width: `${peakPercent! - onsetPercent}%`
            }}
          />
        )}
        {offsetTime && peakTime && (
          <div
            className="absolute h-full bg-primary/20 rounded-full"
            style={{
              left: `${peakPercent!}%`,
              width: `${offsetPercent! - peakPercent!}%`
            }}
          />
        )}
        {/* Timeline markers */}
        <div
          className="absolute top-0 w-0.5 sm:w-1 h-full bg-primary"
          style={{ left: `${onsetPercent}%` }}
        />
        {peakTime && (
          <div
            className="absolute top-0 w-0.5 sm:w-1 h-full bg-primary"
            style={{ left: `${peakPercent}%` }}
          />
        )}
        {offsetTime && (
          <div
            className="absolute top-0 w-0.5 sm:w-1 h-full bg-primary"
            style={{ left: `${offsetPercent}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
        <span>0m</span>
        <span>{totalDuration}m</span>
      </div>
    </div>
  );
}

// DoseCard component to render a single dose item
function DoseCard({ 
  dose, 
  isDarkMode, 
  onEdit, 
  onDelete,
  onTimestampUpdate,
  getTimestampButtonState
}: { 
  dose: DoseEntry; 
  isDarkMode: boolean;
  onEdit: (dose: DoseEntry) => void;
  onDelete: (dose: DoseEntry) => void;
  onTimestampUpdate: (dose: DoseEntry, type: string, value: string) => Promise<void>;
  getTimestampButtonState: (dose: DoseEntry, type: 'onset' | 'peak' | 'offset') => boolean;
}) {
  return (
    <Card 
      className="relative overflow-hidden shadow-sm hover:shadow transition-all rounded-xl border-0" 
      style={{
        backgroundColor: getSubstanceColor(dose.substance, isDarkMode),
        transition: 'all 0.2s ease-in-out'
      }}
    >
      <CardContent className="p-2 sm:p-3">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="p-1 sm:p-2">
              <div className="font-medium text-sm sm:text-base px-2.5 py-1.5 mb-2 rounded bg-white/30 dark:bg-black/10 backdrop-blur-sm shadow-sm">
                {dose.substance}
              </div>
              <div className="flex gap-1 mt-0.5">
                <Badge variant="secondary" className="text-xs shadow-sm border-0 bg-white/50 dark:bg-background/50 backdrop-blur-sm">
                  {dose.amount}
                  {dose.unit}
                </Badge>
                <Badge variant="outline" className="text-xs py-0 border-0 shadow-sm bg-white/30 dark:bg-background/30 backdrop-blur-sm">
                  {dose.route}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 sm:gap-2">
              <TimestampButton
                dose={dose}
                type="onset"
                value={dose.onsetAt}
                onUpdate={(type, value) => onTimestampUpdate(dose, type, value)}
                disabled={getTimestampButtonState(dose, 'onset')}
              />
              <TimestampButton
                dose={dose}
                type="peak"
                value={dose.peakAt}
                onUpdate={(type, value) => onTimestampUpdate(dose, type, value)}
                disabled={getTimestampButtonState(dose, 'peak')}
              />
              <TimestampButton
                dose={dose}
                type="offset"
                value={dose.offsetAt}
                onUpdate={(type, value) => onTimestampUpdate(dose, type, value)}
                disabled={getTimestampButtonState(dose, 'offset')}
              />
            </div>

            <DurationVisualizer dose={dose} />
          </div>

          <div className="flex flex-col items-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs sm:text-sm">
                <DropdownMenuItem
                  onClick={() => onEdit(dose)}
                  className="text-xs sm:text-sm py-1 h-7 sm:h-8"
                >
                  <Pencil className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive text-xs sm:text-sm py-1 h-7 sm:h-8"
                  onClick={() => onDelete(dose)}
                >
                  <Trash className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-xs text-muted-foreground mt-1">
              {formatDistanceToNow(new Date(dose.timestamp), {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
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
        return <Clock className="h-3 w-3 sm:h-4 sm:w-4" />;
      case 'peak':
        return <Activity className="h-3 w-3 sm:h-4 sm:w-4" />;
      case 'offset':
        return <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4" />;
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
            <Badge variant="secondary" className="cursor-default text-xs h-6 px-1.5 sm:px-2">
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
      className="flex items-center gap-0.5 sm:gap-1 h-6 sm:h-8 text-xs sm:text-sm px-1.5 sm:px-2"
    >
      {getIcon()}
      <span className="capitalize">{type}</span>
    </Button>
  );
}

// Virtualized list row component
interface VirtualItemData {
  items: { type: 'header' | 'dose', content: string | DoseEntry, group: string }[];
  isDarkMode: boolean;
  handleEdit: (dose: DoseEntry) => void;
  handleDelete: (dose: DoseEntry) => void;
  handleTimestampUpdate: (dose: DoseEntry, type: string, value: string) => Promise<void>;
  getTimestampButtonState: (dose: DoseEntry, type: 'onset' | 'peak' | 'offset') => boolean;
}

const VirtualizedDoseItem = React.memo(({ index, style, data }: { 
  index: number; 
  style: React.CSSProperties; 
  data: VirtualItemData;
}) => {
  const item = data.items[index];
  
  if (item.type === 'header') {
    return (
      <div style={style} className="flex items-center gap-1 py-2">
        <h3 className="font-semibold text-xs sm:text-sm text-muted-foreground">
          {item.content as string}
        </h3>
      </div>
    );
  }
  
  const dose = item.content as DoseEntry;
  
  return (
    <div style={{...style, paddingBottom: '8px'}}>
      <DoseCard 
        dose={dose}
        isDarkMode={data.isDarkMode}
        onEdit={data.handleEdit}
        onDelete={data.handleDelete}
        onTimestampUpdate={data.handleTimestampUpdate}
        getTimestampButtonState={data.getTimestampButtonState}
      />
    </div>
  );
});

// Add display name for debugging
VirtualizedDoseItem.displayName = 'VirtualizedDoseItem';

export function DoseHistory() {
  const [doses, setDoses] = useState<DoseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDose, setSelectedDose] = useState<DoseEntry | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSubstances, setSelectedSubstances] = useState<string[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<"time" | "substance" | "route">("time");
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains("dark"),
  );
  const { toast } = useToast();
  const { updateTrigger } = useDoseContext();
  const isMobile = useIsMobile();

  useEffect(() => {
    const loadDoses = async () => {
      try {
        const loadedDoses = await getDoses();
        setDoses(loadedDoses);

        // Initialize filters with all unique values
        const substances = Array.from(new Set(loadedDoses.map((d) => d.substance)));
        const routes = Array.from(new Set(loadedDoses.map((d) => d.route)));
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

  const handleUpdate = async (id: number, updates: Partial<{
    substance: string;
    amount: number;
    unit: "mg" | "ug" | "ml";
    route: string;
    timestamp: string;
    onsetAt?: string;
    peakAt?: string;
    offsetAt?: string;
  }>) => {
    try {
      await updateDose(id, updates);
      setDoses((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      );
      toast({
        title: "Dose updated",
        duration: 3000,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error updating dose",
        description: "Failed to update the dose",
        variant: "destructive",
      });
    }
  };

  const handleTimestampUpdate = async (dose: DoseEntry, type: string, value: string) => {
    if (!dose.id) return;
    
    try {
      const updates: Record<string, string> = {
        [`${type}At`]: value
      };
      
      await updateDose(dose.id, updates as any);
      setDoses(prev =>
        prev.map(d => d.id === dose.id ? { ...d, ...updates } : d)
      );
      
      toast({
        title: `${type} time set`,
        duration: 3000,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: `Error setting ${type} time`,
        description: "Failed to update the dose",
        variant: "destructive",
      });
    }
  };

  const getTimestampButtonState = (dose: DoseEntry, type: 'onset' | 'peak' | 'offset'): boolean => {
    switch (type) {
      case 'onset':
        return false;
      case 'peak':
        return !dose.onsetAt;
      case 'offset':
        return !dose.peakAt || !dose.onsetAt;
      default:
        return false;
    }
  };

  const filteredDoses = doses.filter(
    (dose) =>
      selectedSubstances.includes(dose.substance) &&
      selectedRoutes.includes(dose.route),
  );

  const groupDoses = (doses: DoseEntry[]): GroupedDoses => {
    if (groupBy === "substance") {
      const groups = doses.reduce((groups: GroupedDoses, dose) => {
        const key = dose.substance;
        if (!groups[key]) groups[key] = [];
        groups[key].push(dose);
        return groups;
      }, {});

      // Sort doses within each group by timestamp, newest first
      Object.keys(groups).forEach(key => {
        groups[key].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      });

      return groups;
    }

    if (groupBy === "route") {
      const groups = doses.reduce((groups: GroupedDoses, dose) => {
        const key = dose.route;
        if (!groups[key]) groups[key] = [];
        groups[key].push(dose);
        return groups;
      }, {});

      // Sort doses within each group by timestamp, newest first
      Object.keys(groups).forEach(key => {
        groups[key].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      });

      return groups;
    }

    // Default: group by time
    const groups = doses.reduce((groups: GroupedDoses, dose) => {
      let key = "Older";
      const doseDate = new Date(dose.timestamp);
      if (isToday(doseDate)) {
        key = "Today";
      } else if (isYesterday(doseDate)) {
        key = "Yesterday";
      } else if (isSameWeek(doseDate, new Date())) {
        key = "This Week";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(dose);
      return groups;
    }, {});

    // Sort doses within each group by timestamp, newest first
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    });

    return groups;
  };

  // Simplified data structures for virtualization
  const sortedAndFilteredDoses = useMemo(() => {
    return filteredDoses
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [filteredDoses]);

  // Group doses
  const groupedDoses = useMemo(() => {
    return groupDoses(sortedAndFilteredDoses);
  }, [sortedAndFilteredDoses, groupBy]);

  // Define the order for time-based groups
  const timeGroupOrder = ["Today", "Yesterday", "This Week", "Older"];

  // Get sorted group entries based on grouping type
  const sortedGroupEntries = useMemo(() => {
    const entries = Object.entries(groupedDoses);
    if (groupBy === "time") {
      return entries.sort((a, b) => {
        const indexA = timeGroupOrder.indexOf(a[0]);
        const indexB = timeGroupOrder.indexOf(b[0]);
        return indexA - indexB;
      });
    }
    // For substance and route grouping, sort alphabetically
    return entries.sort((a, b) => a[0].localeCompare(b[0]));
  }, [groupedDoses, groupBy]);

  // Flatten groups for virtualization
  const flattenedDoses = useMemo(() => {
    const result: { type: 'header' | 'dose', content: string | DoseEntry, group: string }[] = [];

    sortedGroupEntries.forEach(([group, doses]) => {
      // Add a header
      result.push({ type: 'header', content: `${group} (${doses.length})`, group });
      
      // Add doses
      doses.forEach(dose => {
        result.push({ type: 'dose', content: dose, group });
      });
    });

    return result;
  }, [sortedGroupEntries]);

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto flex-1 shadow-md border-0 bg-white/50 dark:bg-background/50 backdrop-blur-sm rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center justify-center min-h-[300px]">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto flex-1 flex flex-col shadow-md border-0 bg-white/50 dark:bg-background/50 backdrop-blur-sm rounded-xl">
      <CardContent className="p-3 sm:p-4 flex-1 flex flex-col">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">Recent Doses</h2>
          <div className="flex gap-1 sm:gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-lg shadow-sm border-0 bg-secondary/30 hover:bg-secondary/50">
                  <Filter className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Filters
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Group By</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={groupBy === "time"}
                  onCheckedChange={() => setGroupBy("time")}
                >
                  Time
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={groupBy === "substance"}
                  onCheckedChange={() => setGroupBy("substance")}
                >
                  Substance
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={groupBy === "route"}
                  onCheckedChange={() => setGroupBy("route")}
                >
                  Route
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Substances</DropdownMenuLabel>
                {Array.from(new Set(doses.map((d) => d.substance))).map(
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
                {Array.from(new Set(doses.map((d) => d.route))).map((route) => (
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
          </div>
        </div>

        <div className="flex-1 min-h-0 w-full pr-2">
          {flattenedDoses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">No doses found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="h-full">
              <List
                className="pr-1 no-scrollbar"
                height={isMobile ? 500 : 600}
                width="100%"
                itemCount={flattenedDoses.length}
                itemSize={(index) => {
                  // Headers are smaller than dose cards
                  return flattenedDoses[index].type === 'header' ? 40 : 200;
                }}
                itemData={{
                  items: flattenedDoses,
                  isDarkMode,
                  handleEdit: (dose: DoseEntry) => {
                    setSelectedDose(dose);
                    setIsEditDialogOpen(true);
                  },
                  handleDelete: (dose: DoseEntry) => {
                    setSelectedDose(dose);
                    setIsDeleteDialogOpen(true);
                  },
                  handleTimestampUpdate,
                  getTimestampButtonState
                }}
              >
                {VirtualizedDoseItem}
              </List>
            </div>
          )}
        </div>
      </CardContent>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This dose entry will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedDose && selectedDose.id && (
        <EditDoseDialog
          dose={{
            id: selectedDose.id,
            substance: selectedDose.substance,
            amount: selectedDose.amount,
            unit: selectedDose.unit,
            route: selectedDose.route,
            timestamp: selectedDose.timestamp,
            onsetAt: selectedDose.onsetAt,
            peakAt: selectedDose.peakAt,
            offsetAt: selectedDose.offsetAt
          }}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSave={handleUpdate}
        />
      )}
    </Card>
  );
}