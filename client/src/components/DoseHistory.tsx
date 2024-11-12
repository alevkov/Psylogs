import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDoses, deleteDose, editDose } from "@/lib/db";
import type { DoseEntry } from "@/lib/constants";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EditDoseDialog } from "@/components/EditDoseDialog";
import {
  format,
  isToday,
  isYesterday,
  isSameWeek,
  formatDistanceToNow,
} from "date-fns";
import {
  Loader2,
  Filter,
  Calendar,
  Pill,
  Route,
  MoreVertical,
  Pencil,
  Trash,
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
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

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

export function DoseHistory() {
  const [doses, setDoses] = useState<DoseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDose, setSelectedDose] = useState<DoseEntry | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedSubstances, setSelectedSubstances] = useState<string[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<"time" | "substance" | "route">("time");
  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.classList.contains("dark")
  );
  const { toast } = useToast();
  const { updateTrigger, triggerUpdate, lastDeletedDose, setLastDeletedDose } = useDoseContext();

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

  const handleDelete = async (dose: DoseEntry) => {
    if (!dose.id) return;
    
    try {
      await deleteDose(dose.id);
      setLastDeletedDose(dose);
      setDoses((prev) => prev.filter((d) => d.id !== dose.id));
      triggerUpdate();
      
      toast({
        title: "Dose deleted",
        description: "The dose has been deleted successfully",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error deleting dose",
        description: "Could not delete the dose",
        variant: "destructive",
      });
    }
  };

  const handleEdit = async (updatedFields: Partial<DoseEntry>) => {
    if (!selectedDose?.id) return;
    
    try {
      await editDose(selectedDose.id, updatedFields);
      setDoses((prev) =>
        prev.map((d) =>
          d.id === selectedDose.id ? { ...d, ...updatedFields } : d
        )
      );
      triggerUpdate();
      
      toast({
        title: "Dose updated",
        description: "The dose has been updated successfully",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Error updating dose",
        description: "Could not update the dose",
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
                            isDarkMode
                          ),
                          transition: "all 0.2s ease-in-out",
                        }}
                      >
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <h4 className="font-medium">{dose.substance}</h4>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {dose.amount}
                                  {dose.unit}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {dose.route}
                                </Badge>
                              </div>
                              {!navigator.onLine && dose.id === undefined && (
                                <Badge variant="secondary" className="text-xs">
                                  Pending Sync
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-foreground">
                                {formatDistanceToNow(new Date(dose.timestamp), {
                                  addSuffix: true,
                                })}
                              </span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedDose(dose);
                                      setEditDialogOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(dose)}
                                    className="text-destructive"
                                  >
                                    <Trash className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
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

        {lastDeletedDose && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (lastDeletedDose) {
                  try {
                    await addDose({
                      substance: lastDeletedDose.substance,
                      amount: lastDeletedDose.amount,
                      unit: lastDeletedDose.unit,
                      route: lastDeletedDose.route,
                    });
                    setLastDeletedDose(null);
                    triggerUpdate();
                    toast({
                      title: "Dose restored",
                      description: "The last deleted dose has been restored",
                    });
                  } catch (error) {
                    toast({
                      title: "Error restoring dose",
                      description: "Could not restore the dose",
                      variant: "destructive",
                    });
                  }
                }
              }}
            >
              Undo Delete
            </Button>
          </div>
        )}
      </CardContent>

      {selectedDose && (
        <EditDoseDialog
          dose={selectedDose}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSave={handleEdit}
        />
      )}
    </Card>
  );
}