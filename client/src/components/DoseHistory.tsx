import React, { useEffect, useState, useRef, useMemo } from "react";
import { getDoses, updateDose, deleteDose } from "../lib/db";
import { UNITS, type DoseEntry } from "../lib/constants";
import { getSubstanceColor, getContrastTextColor } from "../lib/color-utils";
import { Card, CardContent } from "./ui/card";
import { useIsMobile } from "../hooks/use-mobile";
import {
  format,
  isToday,
  isYesterday,
  isSameWeek,
  parseISO,
  differenceInMinutes,
} from "date-fns";
import {
  Activity,
  AlertCircle,
  Clock,
  Filter,
  Beaker,
  Loader2,
  MoreHorizontal,
  Pencil,
  Route,
  TrendingDown,
  Trash,
  FileX,
  Play,
  Triangle,
  ArrowDown,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";
import { useDoseContext } from "../contexts/DoseContext";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { NotesSection } from "./NotesSection";
import { addNote, updateNote, deleteNote } from "../lib/db";

interface GroupedDoses {
  [key: string]: DoseEntry[];
}

// Timeline visualizer component
function TimelineVisualization({ dose }: { dose: DoseEntry }) {
  const isDarkMode = document.documentElement.classList.contains("dark");

  // If no onset data, don't render timeline
  if (!dose.onsetAt) {
    return null;
  }

  const startTime = parseISO(dose.timestamp);
  const onsetTime = parseISO(dose.onsetAt);
  const peakTime = dose.peakAt ? parseISO(dose.peakAt) : null;
  const offsetTime = dose.offsetAt ? parseISO(dose.offsetAt) : null;

  const lastTime = offsetTime || peakTime || onsetTime;
  const totalDuration = differenceInMinutes(lastTime, startTime);

  if (totalDuration <= 0) {
    return null;
  }

  const onsetPercent = Math.max(
    0,
    Math.min(
      100,
      (differenceInMinutes(onsetTime, startTime) / totalDuration) * 100,
    ),
  );

  const peakPercent = peakTime
    ? Math.max(
        0,
        Math.min(
          100,
          (differenceInMinutes(peakTime, startTime) / totalDuration) * 100,
        ),
      )
    : null;

  const offsetPercent = offsetTime
    ? Math.max(
        0,
        Math.min(
          100,
          (differenceInMinutes(offsetTime, startTime) / totalDuration) * 100,
        ),
      )
    : null;

  // Get color for the substance
  const bgColor = getSubstanceColor(dose.substance, isDarkMode);

  // Extract RGB components
  const rgbaMatch = bgColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
  let r = 100,
    g = 100,
    b = 230; // Default

  if (rgbaMatch) {
    r = parseInt(rgbaMatch[1], 10);
    g = parseInt(rgbaMatch[2], 10);
    b = parseInt(rgbaMatch[3], 10);
  }

  return (
    <div className="w-full mt-0.5">
      {/* Phase labels */}
      <div className="flex justify-between text-[7px] text-muted-foreground mb-0.5">
        <span>Dose</span>
        <span>Onset</span>
        {peakTime && <span>Peak</span>}
        {offsetTime && <span>Offset</span>}
      </div>

      {/* Timeline visualization */}
      <div className="relative h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden w-full shadow-inner">
        {/* Onset phase */}
        <div
          className="absolute h-full rounded-l-full"
          style={{
            width: `${onsetPercent}%`,
            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.5)`,
          }}
        />

        {/* Peak phase */}
        {peakTime && (
          <div
            className="absolute h-full"
            style={{
              left: `${onsetPercent}%`,
              width: `${peakPercent! - onsetPercent}%`,
              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.9)`,
            }}
          />
        )}

        {/* Offset phase */}
        {offsetTime && peakTime && (
          <div
            className="absolute h-full rounded-r-full"
            style={{
              left: `${peakPercent!}%`,
              width: `${offsetPercent! - peakPercent!}%`,
              backgroundColor: `rgba(${r}, ${g}, ${b}, 0.5)`,
            }}
          />
        )}

        {/* Phase markers */}
        <div
          className="absolute top-0 w-0.5 h-full"
          style={{
            left: `calc(${onsetPercent}% - 0.25px)`,
            backgroundColor: `rgb(${r}, ${g}, ${b})`,
            boxShadow: "0 0 1px rgba(0,0,0,0.7)",
          }}
        />

        {peakTime && (
          <div
            className="absolute top-0 w-0.5 h-full"
            style={{
              left: `calc(${peakPercent}% - 0.25px)`,
              backgroundColor: `rgb(${r}, ${g}, ${b})`,
              boxShadow: "0 0 1px rgba(0,0,0,0.7)",
            }}
          />
        )}

        {offsetTime && (
          <div
            className="absolute top-0 w-0.5 h-full"
            style={{
              left: `calc(${offsetPercent}% - 0.25px)`,
              backgroundColor: `rgb(${r}, ${g}, ${b})`,
              boxShadow: "0 0 1px rgba(0,0,0,0.7)",
            }}
          />
        )}
      </div>

      {/* Duration indicator */}
      <div className="flex justify-end text-[7px] text-muted-foreground mt-0.5">
        <span>Duration: {totalDuration}m</span>
      </div>
    </div>
  );
}

// DoseCard component with timeline visualization
function DoseCard({
  dose,
  isDarkMode,
  hideTimestampButtons,
  onEdit,
  onDelete,
  onUpdateDose,
}: {
  dose: DoseEntry;
  isDarkMode: boolean;
  hideTimestampButtons: boolean;
  onEdit: (dose: DoseEntry) => void;
  onDelete: (dose: DoseEntry) => void;
  onUpdateDose: (id: number, updates: Partial<DoseEntry>) => Promise<void>;
}) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const hasTimeline = dose.onsetAt || dose.peakAt || dose.offsetAt;
  const bgColor = getSubstanceColor(dose.substance, isDarkMode);
  const hasNotes = dose.notes && dose.notes.length > 0;

  // Function to set timestamps directly from buttons
  const setTimestamp = async (type: "onset" | "peak" | "offset") => {
    if (!dose.id) return;

    const now = new Date().toISOString();
    const updates: Partial<DoseEntry> = {};

    if (type === "onset") {
      updates.onsetAt = now;
    } else if (type === "peak") {
      updates.peakAt = now;
    } else if (type === "offset") {
      updates.offsetAt = now;
    }

    await onUpdateDose(dose.id, updates);
  };

  // Handle note operations
  const handleAddNote = async (doseId: number, text: string) => {
    if (!doseId) return;
    await addNote(doseId, text);
    // Refresh data through parent
    const updatedDose = await onUpdateDose(doseId, {});
  };

  const handleUpdateNote = async (
    doseId: number,
    noteId: string,
    text: string,
  ) => {
    if (!doseId) return;
    await updateNote(doseId, noteId, text);
    // Refresh data through parent
    const updatedDose = await onUpdateDose(doseId, {});
  };

  const handleDeleteNote = async (doseId: number, noteId: string) => {
    if (!doseId) return;
    await deleteNote(doseId, noteId);
    // Refresh data through parent
    const updatedDose = await onUpdateDose(doseId, {});
  };

  // Determine if we should show anything in the bottom section
  const showBottomSection =
    !hideTimestampButtons || hasTimeline || hasNotes || notesExpanded;

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      {/* Main dose info row */}
      <div className="flex min-h-[40px]">
        {/* Color bar */}
        <div
          className="w-1 self-stretch flex-shrink-0 mr-2"
          style={{ backgroundColor: bgColor }}
        />

        {/* Dose information */}
        <div className="flex-1 flex flex-col justify-center py-0.5">
          {/* Time indicator */}
          <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
            {format(new Date(dose.timestamp), "EEE HH:mm")}
          </div>

          {/* Substance name */}
          <div className="font-medium text-xs leading-tight">
            {dose.substance}
          </div>

          {/* Dose details */}
          <div className="text-[10px] text-gray-600 dark:text-gray-400 leading-tight flex items-center">
            {dose.amount} {dose.unit} {dose.route && `· ${dose.route}`}
            {hasNotes && (
              <span className="ml-1.5 flex items-center text-blue-500 dark:text-blue-400">
                <MessageSquare className="h-2 w-2 mr-0.5" />
                {dose.notes!.length}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center mr-1 gap-3">
          {/* Notes toggle button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setNotesExpanded(!notesExpanded)}
          >
            {notesExpanded ? (
              <ChevronUp className="h-2.5 w-2.5" />
            ) : (
              <ChevronDown className="h-2.5 w-2.5" />
            )}
          </Button>

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                <MoreHorizontal className="h-2.5 w-2.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-[10px]">
              <DropdownMenuItem
                onClick={() => onEdit(dose)}
                className="text-[10px] py-0.5 h-6"
              >
                <Pencil className="h-2.5 w-2.5 mr-1" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setNotesExpanded(true)}
                className="text-[10px] py-0.5 h-6"
              >
                <MessageSquare className="h-2.5 w-2.5 mr-1" />
                {hasNotes ? "View Notes" : "Add Note"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive text-[10px] py-0.5 h-6"
                onClick={() => onDelete(dose)}
              >
                <Trash className="h-2.5 w-2.5 mr-1" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Bottom section: Timeline and Notes */}
      {showBottomSection && (
        <div className="px-3 pb-1">
          {/* Phase buttons - only show if hideTimestampButtons is false */}
          {!hideTimestampButtons && (
            <div className="flex gap-0.5 mb-1">
              <Button
                variant={dose.onsetAt ? "default" : "outline"}
                size="sm"
                className="h-5 text-[8px] flex-1 px-0"
                onClick={() => setTimestamp("onset")}
                disabled={!dose.id}
              >
                <Play className="h-2.5 w-2.5 mr-0.5" />
                {dose.onsetAt ? "Onset" : "Set Onset"}
              </Button>

              <Button
                variant={dose.peakAt ? "default" : "outline"}
                size="sm"
                className="h-5 text-[8px] flex-1 px-0"
                onClick={() => setTimestamp("peak")}
                disabled={!dose.id || !dose.onsetAt}
              >
                <Triangle className="h-2.5 w-2.5 mr-0.5" />
                {dose.peakAt ? "Peak" : "Set Peak"}
              </Button>

              <Button
                variant={dose.offsetAt ? "default" : "outline"}
                size="sm"
                className="h-5 text-[8px] flex-1 px-0"
                onClick={() => setTimestamp("offset")}
                disabled={!dose.id || !dose.peakAt}
              >
                <ArrowDown className="h-2.5 w-2.5 mr-0.5" />
                {dose.offsetAt ? "Offset" : "Set Offset"}
              </Button>
            </div>
          )}

          {/* Timeline visualization for doses with onset data */}
          {hasTimeline && <TimelineVisualization dose={dose} />}

          {/* Notes section */}
          {notesExpanded && dose.id && (
            <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
              <NotesSection
                doseId={dose.id}
                notes={dose.notes || []}
                onAddNote={handleAddNote}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DoseHistory() {
  const [doses, setDoses] = useState<DoseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDose, setSelectedDose] = useState<DoseEntry | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedSubstances, setSelectedSubstances] = useState<string[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<"time" | "substance" | "route">(
    "time",
  );
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains("dark"),
  );
  const [hideTimestampButtons, setHideTimestampButtons] = useState(
    localStorage.getItem("hideTimestampButtons") === "true",
  );
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { updateTrigger, triggerUpdate } = useDoseContext();
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);

  // Load doses
  useEffect(() => {
    async function loadDoses() {
      try {
        setLoading(true);
        const result = await getDoses(1000, 0); // Increase limit to fetch all doses
        const loadedDoses = result.doses || [];
        setDoses(loadedDoses);

        // Initialize filters with all unique values
        const substances = Array.from(
          new Set(loadedDoses.map((d) => d.substance)),
        );
        const routes = Array.from(new Set(loadedDoses.map((d) => d.route)));
        setSelectedSubstances(substances);
        setSelectedRoutes(routes);
      } catch (err) {
        console.error("Error loading doses:", err);
        setError("Failed to load dose history");
      } finally {
        setLoading(false);
      }
    }

    loadDoses();
  }, [updateTrigger]);

  // Monitor dark mode changes
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

  // Listen for changes to the hideTimestampButtons setting in localStorage
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "hideTimestampButtons") {
        setHideTimestampButtons(e.newValue === "true");
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
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

  const handleUpdate = async (
    id: number,
    updates: Partial<{
      substance: string;
      amount: number;
      unit: (typeof UNITS)[number];
      route: string;
      timestamp: string;
      onsetAt?: string;
      peakAt?: string;
      offsetAt?: string;
    }>,
  ) => {
    try {
      await updateDose(id, updates);
      setDoses((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      );
      triggerUpdate(); // Refresh data across components
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
      const groups = doses.reduce((groups: GroupedDoses, dose) => {
        const key = dose.substance;
        if (!groups[key]) groups[key] = [];
        groups[key].push(dose);
        return groups;
      }, {});

      // Sort doses within each group by timestamp, newest first
      Object.keys(groups).forEach((key) => {
        groups[key].sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
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
      Object.keys(groups).forEach((key) => {
        groups[key].sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
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
      } else if (isSameWeek(doseDate, new Date(), { weekStartsOn: 1 })) {
        key = "This Week";
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(dose);
      return groups;
    }, {});

    // Sort doses within each group by timestamp, newest first
    Object.keys(groups).forEach((key) => {
      groups[key].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    });

    return groups;
  };

  // Sort and group doses
  const sortedAndFilteredDoses = useMemo(() => {
    return filteredDoses.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [filteredDoses]);

  const sortedGroupEntries = useMemo<Array<[string, DoseEntry[]]>>(() => {
    const groups = groupDoses(sortedAndFilteredDoses);

    // Define the order for time-based groups
    const orderedKeys = ["Today", "Yesterday", "This Week", "Older"];

    // Get all keys from the groups and sort them
    let keys = Object.keys(groups);

    // For time-based grouping, sort keys according to the defined order
    if (groupBy === "time") {
      keys = keys.sort((a, b) => {
        const aIndex = orderedKeys.indexOf(a);
        const bIndex = orderedKeys.indexOf(b);
        return aIndex - bIndex;
      });
    } else {
      // For substance and route, sort alphabetically
      keys = keys.sort();
    }

    // Return the sorted group entries with proper typing
    return keys.map((key) => [key, groups[key]]);
  }, [sortedAndFilteredDoses, groupBy]);

  // Get all unique substances and routes for filtering
  const allSubstances = useMemo(() => {
    return Array.from(new Set(doses.map((d) => d.substance))).sort();
  }, [doses]);

  const allRoutes = useMemo(() => {
    return Array.from(new Set(doses.map((d) => d.route))).sort();
  }, [doses]);

  // Log count information for debugging
  useEffect(() => {
    console.log("Total doses:", doses.length);
    console.log("Filtered doses:", filteredDoses.length);
    console.log(
      "Active tab count:",
      sortedGroupEntries.reduce(
        (total, [_, groupDoses]) => total + groupDoses.length,
        0,
      ),
    );
  }, [doses, filteredDoses, sortedGroupEntries]);

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto flex-1 shadow-md border-0 bg-white/50 dark:bg-background/50 backdrop-blur-sm rounded-xl">
        <CardContent className="p-4">
          <div className="flex flex-col items-center justify-center h-full p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">Loading doses...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-md mx-auto flex-1 shadow-md border-0 bg-white/50 dark:bg-background/50 backdrop-blur-sm rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center p-4 text-destructive">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto flex-1 shadow-md border-0 bg-white/50 dark:bg-background/50 backdrop-blur-sm rounded-xl">
      <CardContent className="pt-1 px-4 pb-4 flex flex-col h-full">
        {/* Header section with controls */}
        <div className="flex flex-col mb-2 space-y-1.5">
          {/* Entry count badge */}
          <div className="flex justify-end">
            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              {doses.length} {doses.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            {/* Group selector */}
            <div className="flex flex-1 items-center">
              <div className="flex flex-1">
                <button
                  onClick={() => setGroupBy("time")}
                  className={`h-8 flex items-center justify-center flex-1 rounded-l-md border border-r-0 text-xs ${
                    groupBy === "time"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Time
                </button>
                <button
                  onClick={() => setGroupBy("substance")}
                  className={`h-8 flex items-center justify-center flex-1 border-y border-x-0 text-xs ${
                    groupBy === "substance"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground"
                  }`}
                >
                  <Beaker className="h-3.5 w-3.5 mr-1.5" />
                  Drug
                </button>
                <button
                  onClick={() => setGroupBy("route")}
                  className={`h-8 flex items-center justify-center flex-1 rounded-r-md border border-l-0 text-xs ${
                    groupBy === "route"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground"
                  }`}
                >
                  <Route className="h-3.5 w-3.5 mr-1.5" />
                  Route
                </button>
              </div>
            </div>

            {/* Filter dropdown */}
            <DropdownMenu open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <DropdownMenuTrigger asChild>
                <button className="h-8 flex items-center justify-center gap-1 px-2 text-xs border rounded-md bg-background text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" />
                  Filter
                  {selectedSubstances.length < allSubstances.length ||
                  selectedRoutes.length < allRoutes.length ? (
                    <span className="ml-0.5 bg-primary/10 text-primary text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
                      ✓
                    </span>
                  ) : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">
                  Substances
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allSubstances.map((substance) => (
                  <DropdownMenuCheckboxItem
                    key={substance}
                    className="text-xs"
                    checked={selectedSubstances.includes(substance)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedSubstances([
                          ...selectedSubstances,
                          substance,
                        ]);
                      } else {
                        setSelectedSubstances(
                          selectedSubstances.filter((s) => s !== substance),
                        );
                      }
                    }}
                  >
                    {substance}
                  </DropdownMenuCheckboxItem>
                ))}

                <DropdownMenuLabel className="text-xs mt-2">
                  Routes
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allRoutes.map((route) => (
                  <DropdownMenuCheckboxItem
                    key={route}
                    className="text-xs"
                    checked={selectedRoutes.includes(route)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedRoutes([...selectedRoutes, route]);
                      } else {
                        setSelectedRoutes(
                          selectedRoutes.filter((r) => r !== route),
                        );
                      }
                    }}
                  >
                    {route}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Scrollable dose list container */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-auto pb-4 pr-1"
          style={{ maxHeight: "calc(100vh - 220px)" }}
        >
          {sortedGroupEntries.length === 0 ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center">
                <FileX className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <p className="mt-2 text-muted-foreground">No doses found</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedGroupEntries.map(([group, groupDoses]) => (
                <div key={group}>
                  {/* Group header */}
                  <h2 className="font-semibold text-[10px] px-1 mb-0.5 text-muted-foreground uppercase">
                    {group === "Today" && (
                      <span>TODAY ({groupDoses.length})</span>
                    )}
                    {group === "Yesterday" && (
                      <span>YESTERDAY ({groupDoses.length})</span>
                    )}
                    {group === "This Week" && (
                      <span>THIS WEEK ({groupDoses.length})</span>
                    )}
                    {group === "Older" && (
                      <span>OLDER ({groupDoses.length})</span>
                    )}
                    {group !== "Today" &&
                      group !== "Yesterday" &&
                      group !== "This Week" &&
                      group !== "Older" && (
                        <span>
                          {group} ({groupDoses.length})
                        </span>
                      )}
                  </h2>

                  {/* Dose items */}
                  <div className="rounded-md overflow-hidden bg-white dark:bg-gray-900 shadow-sm">
                    {groupDoses.map((dose: DoseEntry) => (
                      <DoseCard
                        key={dose.id}
                        dose={dose}
                        isDarkMode={isDarkMode}
                        hideTimestampButtons={hideTimestampButtons}
                        onEdit={() => {
                          setSelectedDose(dose);
                          setIsEditDialogOpen(true);
                        }}
                        onDelete={() => {
                          setSelectedDose(dose);
                          setIsDeleteDialogOpen(true);
                        }}
                        onUpdateDose={handleUpdate}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Dialog */}
        {selectedDose && (
          <EditDoseDialog
            dose={{
              id: selectedDose.id || 0,
              substance: selectedDose.substance,
              amount: selectedDose.amount,
              unit: selectedDose.unit,
              route: selectedDose.route,
              timestamp: selectedDose.timestamp,
              onsetAt: selectedDose.onsetAt,
              peakAt: selectedDose.peakAt,
              offsetAt: selectedDose.offsetAt,
            }}
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            onSave={async (id, updates) => {
              console.log("Received updates in DoseHistory:", updates);
              if (id) {
                // Ensure unit is properly typed as UNITS[number]
                const typeCheckedUpdates: Partial<{
                  substance: string;
                  amount: number;
                  unit: (typeof UNITS)[number];
                  route: string;
                  timestamp: string;
                  onsetAt?: string;
                  peakAt?: string;
                  offsetAt?: string;
                }> = {
                  ...updates,
                  unit: updates.unit as (typeof UNITS)[number],
                };

                await handleUpdate(id, typeCheckedUpdates);
                // Refresh the doses to show the updated data
                triggerUpdate();
              }
              setIsEditDialogOpen(false);
              setSelectedDose(null);
            }}
          />
        )}

        {/* Delete Dialog */}
        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent className="max-w-xs">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete dose</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this dose? This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="h-8"
                onClick={() => setSelectedDose(null)}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction className="h-8" onClick={handleDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
