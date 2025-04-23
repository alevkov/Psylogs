import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ExperienceTimeline } from "../components/ExperienceTimeline";
import { MultiExperienceTimeline } from "../components/MultiExperienceTimeline";
import { getAllDosesForStats } from "../lib/db";
import { DoseEntry } from "../lib/constants";
import timelineData from "../lib/dose_tiers_with_timelines.json";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { AlertCircle } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { useDoseContext } from "../contexts/DoseContext";
import { useIsMobile } from "../hooks/use-mobile";
import { useInView } from "react-intersection-observer";

interface TimelineData {
  drug: string;
  method: string;
  dose_ranges: string;
  onset: number;
  peak: number;
  offset: number;
}

export default function ActivePage() {
  const isMobile = useIsMobile();
  const { updateTrigger } = useDoseContext();
  const [activeDoses, setActiveDoses] = useState<DoseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Set up the intersection observer to detect when the component is in view
  const { ref: inViewRef, inView } = useInView({
    threshold: 0.1, // Trigger when at least 10% of the component is visible
    triggerOnce: false, // Keep observing for visibility changes
  });

  // Function to load active doses
  const loadActiveDoses = async () => {
    setLoading(true);
    try {
      const doses = await getAllDosesForStats();

      if (doses.length === 0) {
        setActiveDoses([]);
        setLoading(false);
        return;
      }

      const now = new Date();

      // Find all doses that have timeline data and are still active
      const activeExperiences = doses
        .filter((dose) => {
          const doseTime = new Date(dose.timestamp);
          const timelineDrug = findTimelineData(dose.substance, dose.route);

          if (!timelineDrug) return false;

          // Calculate total duration including grace period (offset + 33% of offset)
          const totalDuration = timelineDrug.offset * 3600000 * 1.33; // convert to ms and add 33%

          // Check if dose is within active timeframe
          return now.getTime() - doseTime.getTime() <= totalDuration;
        })
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

      setActiveDoses(activeExperiences);
      // Update the last update timestamp
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error loading active doses:", error);
    }
    setLoading(false);
  };

  // We no longer need a manual refresh function since we're using visibility detection

  // Load doses when first opening the page or when data changes
  useEffect(() => {
    loadActiveDoses();
  }, [updateTrigger]); // Re-fetch when updateTrigger changes

  // Refresh data when the component comes into view
  useEffect(() => {
    if (inView) {
      console.log("Active page came into view, refreshing data");
      loadActiveDoses();
    }
  }, [inView]); // This will trigger whenever inView changes from false to true

  // Helper function to find timeline data for a substance and route
  const findTimelineData = (
    substance: string,
    route: string,
  ): TimelineData | null => {
    const normalizedSubstance = substance.toLowerCase().trim();
    const normalizedRoute = route.toLowerCase().trim();

    // Look for an exact match
    const exactMatch = timelineData.find(
      (item) =>
        item.drug.toLowerCase() === normalizedSubstance &&
        item.method.toLowerCase() === normalizedRoute,
    );

    if (exactMatch) return exactMatch;

    // If no exact match, look for substance with any route
    const anyRouteMatch = timelineData.find(
      (item) => item.drug.toLowerCase() === normalizedSubstance,
    );

    return anyRouteMatch || null;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full min-h-screen flex flex-col"
      ref={inViewRef} // Attach to the container to detect visibility
    >
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col p-4 pb-20">
        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : activeDoses.length === 0 ? (
          <Card className="w-full shadow-md border-0 bg-white/50 dark:bg-background/50 backdrop-blur-sm rounded-xl">
            <CardContent className="p-8 flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-slate-100 p-3 dark:bg-slate-800 mb-3">
                <AlertCircle className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">
                No Active Experiences
              </h3>
              <p className="text-sm text-muted-foreground">
                When you log doses of substances with known timelines, they'll
                appear here during their active period.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Combined multi-experience timeline showing all active substances */}
            <MultiExperienceTimeline className="mb-4" />

            {/* Individual timelines shown below */}

            {activeDoses.map((dose) => (
              <ExperienceTimeline
                key={dose.id}
                doseId={dose.id}
                standalone={true}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
