import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useIsMobile } from "../hooks/use-mobile";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  format,
  isSameDay,
  subDays,
  startOfDay,
  isAfter,
} from "date-fns";

// Import your existing database functions
import { getAllDosesForStats } from "../lib/db";
import { analyzePersonalPatterns } from "../lib/analysis";
import { CompactToleranceCurve } from "./CompactToleranceCurve";
import { getSubstanceColor, getContrastTextColor } from "../lib/color-utils";
import { useTheme } from "../hooks/use-theme";

// Custom hooks
const useWindowSize = () => {
  const [size, setSize] = useState([window.innerWidth, window.innerHeight]);

  useEffect(() => {
    const updateSize = () => {
      setSize([window.innerWidth, window.innerHeight]);
    };
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  return size;
};

// We now use getSubstanceColor from color-utils.ts instead of a local color array

const ROUTE_COLORS = {
  oral: "#FF6B6B",
  sublingual: "#4ECDC4",
  nasal: "#45B7D1",
  inhaled: "#FFA5AB",
  rectal: "#98D4BB",
  smoked: "#CAB8FF",
  injected: "#FFD166",
  transdermal: "#06D6A0",
};

// We now import getSubstanceColor from ../lib/color-utils

// Function to parse drug name and extract main name
const parseDrugName = (drugName) => {
  // Check if there are alternative names in parentheses
  const match = drugName.match(/^(.*?)\s*\((.*?)\)$/);

  if (match) {
    return {
      mainName: match[1].trim(),
      alternatives: match[2].trim().split(", "),
    };
  }

  // No alternatives found
  return {
    mainName: drugName,
    alternatives: [],
  };
};

// Format the timestamp for display
const formatTimestamp = (timestamp, format = "MMM d, yyyy h:mm a") => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
  } catch (error) {
    console.error("Error formatting timestamp:", error);
    return timestamp;
  }
};


// Calendar visualization component (simplified)
const CalendarView = ({ doseData, width, height }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  // Add click handler to close tooltips when clicking outside cells
  useEffect(() => {
    const handleDocumentClick = (e) => {
      // If click is outside a calendar cell
      if (
        !e.target.closest(".calendar-cell") &&
        !e.target.closest(".calendar-tooltip")
      ) {
        // Find all tooltips and hide them with animation
        const tooltips = document.querySelectorAll(".calendar-tooltip");
        tooltips.forEach((tooltip) => {
          tooltip.style.opacity = "0";
          // Wait for fade out animation to complete before hiding
          setTimeout(() => {
            tooltip.classList.add("hidden");
          }, 150);
        });
      }
    };

    // Add event listener
    document.addEventListener("click", handleDocumentClick);

    // Clean up on unmount
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  // Group doses by date
  const dosesByDate = useMemo(() => {
    const groupedData = {};
    doseData.forEach((dose) => {
      const date = new Date(dose.timestamp).toISOString().split("T")[0];
      if (!groupedData[date]) {
        groupedData[date] = [];
      }
      groupedData[date].push(dose);
    });
    return groupedData;
  }, [doseData]);

  // Create calendar data for the last 90 days
  const calendarData = useMemo(() => {
    const data = [];
    const now = new Date();
    for (let i = 0; i < 90; i++) {
      const date = subDays(now, i);
      const dateKey = date.toISOString().split("T")[0];
      const doses = dosesByDate[dateKey] || [];

      // Group doses by substance for this date
      const substanceGroups = {};
      doses.forEach((dose) => {
        if (!substanceGroups[dose.substance]) {
          substanceGroups[dose.substance] = {
            count: 0,
            doses: [],
          };
        }
        substanceGroups[dose.substance].count += 1;
        substanceGroups[dose.substance].doses.push(dose);
      });

      data.push({
        date,
        dateKey,
        count: doses.length,
        substances: Object.keys(substanceGroups),
        substanceGroups,
      });
    }
    return data;
  }, [dosesByDate]);

  return (
    <div className="w-full overflow-hidden">
      <div className="flex justify-between items-center mb-1">
        <div className="text-xs font-medium">Last 90 Days</div>
        <div className="text-[10px] italic text-gray-500">
          <span>Colors represent substances</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-medium text-gray-500 py-0.5"
          >
            {day}
          </div>
        ))}

        {/* Generate empty cells for week alignment */}
        {(() => {
          const firstDate = calendarData[calendarData.length - 1].date;
          const firstDay = firstDate.getDay();
          return Array.from({ length: firstDay }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="h-6 rounded bg-gray-100 dark:bg-gray-800 calendar-cell"
            ></div>
          ));
        })()}

        {/* Create the actual calendar cells */}
        {calendarData
          .slice()
          .reverse()
          .map((day, i) => {
            // If no doses, use the default empty cell color
            if (day.count === 0) {
              const isToday = isSameDay(day.date, new Date());
              const borderClass = isToday ? "border border-red-500" : "";

              return (
                <div
                  key={day.dateKey}
                  className={`h-6 rounded bg-gray-100 dark:bg-gray-800 ${borderClass} flex items-center justify-center text-[10px] relative group cursor-pointer calendar-cell`}
                  title={`${format(day.date, "MMM d, yyyy")}: No doses`}
                >
                  <span>{day.date.getDate()}</span>
                </div>
              );
            }

            // For days with doses, create a gradient background based on the substances
            const isToday = isSameDay(day.date, new Date());
            const borderClass = isToday ? "border border-red-500" : "";

            // Create a CSS gradient from the substance colors
            let gradientColors = "";
            const totalSubstances = day.substances.length;

            if (totalSubstances === 1) {
              // If only one substance, use a solid color with opacity based on count
              const substance = day.substances[0];
              const opacity = Math.min(
                0.4 + day.substanceGroups[substance].count * 0.15,
                0.9,
              );
              const color = getSubstanceColor(substance, isDarkMode);
              gradientColors = color;
            } else if (totalSubstances === 2) {
              // For two substances, create a smooth linear gradient
              const color1 = getSubstanceColor(day.substances[0], isDarkMode);
              const color2 = getSubstanceColor(day.substances[1], isDarkMode);
              gradientColors = `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`;
            } else if (totalSubstances === 3) {
              // For three substances, create a smooth tri-color gradient
              const color1 = getSubstanceColor(day.substances[0], isDarkMode);
              const color2 = getSubstanceColor(day.substances[1], isDarkMode);
              const color3 = getSubstanceColor(day.substances[2], isDarkMode);

              // Create a triangular gradient that smoothly blends all three colors
              gradientColors = `
                linear-gradient(to bottom right, 
                  ${color1} 0%, 
                  ${color2} 50%, 
                  ${color3} 100%
                )
              `;
            } else {
              // For any number of substances greater than 3, create a smooth multi-color blend
              // This approach creates a customized gradient that works for any number of substances

              // Calculate percent step based on number of substances
              const percentStep = 100 / (totalSubstances - 1);

              const smoothGradient = day.substances
                .map((substance, index) => {
                  const color = getSubstanceColor(substance, isDarkMode);
                  const position = Math.round(index * percentStep);

                  // Return color with position
                  return `${color} ${position}%`;
                })
                .join(", ");

              // Create a smooth diagonal gradient with all substance colors
              gradientColors = `linear-gradient(135deg, ${smoothGradient})`;
            }

            // Determine text color based on the background intensity
            const textColor =
              day.count >= 3 ? "text-white" : "text-gray-800 dark:text-white";

            return (
              <div
                key={day.dateKey}
                className={`h-6 rounded ${borderClass} flex items-center justify-center text-[10px] relative cursor-pointer calendar-cell`}
                style={{ background: gradientColors }}
                title={`${format(day.date, "MMM d, yyyy")}: ${day.count} doses`}
                onTouchStart={(e) => {
                  // Special handler for mobile - immediately show tooltip on touch
                  if ("ontouchstart" in window) {
                    e.stopPropagation();

                    // Close all other tooltips
                    const allTooltips =
                      document.querySelectorAll(".calendar-tooltip");
                    allTooltips.forEach((tooltip) => {
                      if (tooltip.id !== `tooltip-${day.dateKey}`) {
                        tooltip.style.opacity = "0";
                        setTimeout(() => {
                          tooltip.classList.add("hidden");
                        }, 150);
                      }
                    });

                    // Show this tooltip
                    const tooltip = document.getElementById(
                      `tooltip-${day.dateKey}`,
                    );
                    if (tooltip) {
                      // Position the tooltip above the cell
                      const rect = e.currentTarget.getBoundingClientRect();
                      const tooltipWidth = 160; // w-40 = 10rem = 160px
                      tooltip.style.left = `${rect.left + rect.width / 2 - tooltipWidth / 2}px`;
                      tooltip.style.top = `${rect.top - 120}px`; // Position above the cell with some space

                      tooltip.classList.remove("hidden");
                      setTimeout(() => {
                        tooltip.style.opacity = "1";
                      }, 10);
                    }
                  }
                }}
                onClick={(e) => {
                  // Prevent event bubbling
                  e.stopPropagation();

                  // Skip for mobile devices (handled by touchstart)
                  if ("ontouchstart" in window) return;

                  // Find all tooltip elements and close any that are open
                  const allTooltips =
                    document.querySelectorAll(".calendar-tooltip");
                  allTooltips.forEach((tooltip) => {
                    if (tooltip.id !== `tooltip-${day.dateKey}`) {
                      tooltip.style.opacity = "0";
                      setTimeout(() => {
                        tooltip.classList.add("hidden");
                      }, 150);
                    }
                  });

                  // Toggle the current tooltip with animation
                  const tooltip = document.getElementById(
                    `tooltip-${day.dateKey}`,
                  );
                  if (tooltip) {
                    // Position the tooltip above the cell
                    const rect = e.currentTarget.getBoundingClientRect();
                    const tooltipWidth = 160; // w-40 = 10rem = 160px
                    tooltip.style.left = `${rect.left + rect.width / 2 - tooltipWidth / 2}px`;
                    tooltip.style.top = `${rect.top - 120}px`; // Position above the cell with some space

                    if (tooltip.classList.contains("hidden")) {
                      tooltip.classList.remove("hidden");
                      // Small delay before showing the tooltip to allow CSS transition to work
                      setTimeout(() => {
                        tooltip.style.opacity = "1";
                      }, 10);
                    } else {
                      tooltip.style.opacity = "0";
                      // Wait for fade out transition before hiding
                      setTimeout(() => {
                        tooltip.classList.add("hidden");
                      }, 150);
                    }
                  }
                }}
                onMouseEnter={(e) => {
                  // Skip for touch devices
                  if ("ontouchstart" in window) return;

                  const tooltip = document.getElementById(
                    `tooltip-${day.dateKey}`,
                  );
                  if (tooltip) {
                    // Position the tooltip above the cell
                    const rect = e.currentTarget.getBoundingClientRect();
                    const tooltipWidth = 160; // w-40 = 10rem = 160px
                    tooltip.style.left = `${rect.left + rect.width / 2 - tooltipWidth / 2}px`;
                    tooltip.style.top = `${rect.top - 120}px`; // Position above the cell with some space

                    tooltip.classList.remove("hidden");
                    setTimeout(() => {
                      tooltip.style.opacity = "1";
                    }, 10);
                  }
                }}
                onMouseLeave={(e) => {
                  // Only hide if we're not on a touch device where click is the primary interaction
                  if (!("ontouchstart" in window)) {
                    const tooltip = document.getElementById(
                      `tooltip-${day.dateKey}`,
                    );
                    if (tooltip) {
                      tooltip.style.opacity = "0";
                      setTimeout(() => {
                        tooltip.classList.add("hidden");
                      }, 150);
                    }
                  }
                }}
              >
                <span className={textColor}>{day.date.getDate()}</span>

                {/* Tooltip that works with both hover and tap */}
                {day.count > 0 && (
                  <div
                    id={`tooltip-${day.dateKey}`}
                    className="calendar-tooltip fixed z-50 hidden bg-white dark:bg-gray-900 p-1.5 rounded shadow-lg text-[10px] w-40 transition-opacity duration-150 ease-in-out pointer-events-auto"
                    style={{ opacity: 0 }}
                  >
                    <div className="font-medium">
                      {format(day.date, "MMM d, yyyy")}
                    </div>
                    <div className="text-gray-500">
                      {day.count} dose{day.count !== 1 ? "s" : ""}
                    </div>
                    <ul className="mt-0.5">
                      {Object.entries(day.substanceGroups).map(
                        ([substance, data], idx) => (
                          <li
                            key={idx}
                            className="flex justify-between truncate"
                          >
                            <div className="flex items-center">
                              <div
                                className="w-2 h-2 rounded-full mr-1 flex-shrink-0"
                                style={{
                                  backgroundColor: getSubstanceColor(substance, isDarkMode),
                                }}
                              />
                              <span className="truncate max-w-[85px]">
                                {substance}
                              </span>
                            </div>
                            <span>{data.count}x</span>
                          </li>
                        ),
                      )}
                    </ul>
                    {/* Tooltip pointer */}
                    <div className="absolute bottom-[-6px] left-1/2 transform -translate-x-1/2 rotate-45 w-3 h-3 bg-white dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700 shadow-sm"></div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};

// Custom tooltip component for time of day chart
const TimeOfDayTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    // Find the total for all substances at this hour
    const total = payload.reduce((sum, entry) => sum + entry.value, 0);

    return (
      <div className="bg-white dark:bg-gray-800 p-2 border rounded shadow-lg">
        <p className="font-medium text-xs">{label}</p>
        <p className="text-xs text-gray-500">{total} total doses</p>
        <div className="mt-1">
          {payload.map((entry, index) => (!!!entry.value) ? null : (
            <div key={index} className="flex items-center mt-0.5">
              <div
                className="w-2 h-2 rounded-full mr-1"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-[10px] truncate max-w-[120px]">
                {entry.name}: {entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

// Multi-day tooltip for Past 20 Days chart
const MultiDayTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 p-2 border rounded shadow-lg">
        <p className="font-medium text-xs">{label}</p>
        <div className="mt-1">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center mt-0.5">
              <div
                className="w-2 h-2 rounded-full mr-1"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-[10px] truncate max-w-[120px]">
                {entry.name}: {entry.value} doses
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

// New component for past 20 days analysis
const Past20DaysAnalysis = ({ doseData }) => {
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Create data for past 20 days analysis
  const past20DaysData = useMemo(() => {
    // Create array of the past 20 days
    const days = [];
    for (let i = 19; i >= 0; i--) {
      const date = subDays(new Date(), i);
      days.push({
        date,
        dateFormatted: format(date, "MMM dd"),
        day: format(date, "EEE"),
        total: 0,
      });
    }

    // Group substances by day
    const substancesByDay = {};

    // Filter doses for the past 20 days
    const cutoffDate = subDays(new Date(), 20);
    const recentDoses = doseData.filter((dose) =>
      isAfter(new Date(dose.timestamp), cutoffDate),
    );

    // Count substances by day
    recentDoses.forEach((dose) => {
      const doseDate = startOfDay(new Date(dose.timestamp));
      const doseDateStr = format(doseDate, "yyyy-MM-dd");

      if (!substancesByDay[doseDateStr]) {
        substancesByDay[doseDateStr] = {};
      }

      if (!substancesByDay[doseDateStr][dose.substance]) {
        substancesByDay[doseDateStr][dose.substance] = 0;
      }

      substancesByDay[doseDateStr][dose.substance] += 1;
    });

    // Add substance data to days array
    days.forEach((day) => {
      const dayStr = format(day.date, "yyyy-MM-dd");
      const daySubstances = substancesByDay[dayStr] || {};

      // Add each substance count to the day
      Object.entries(daySubstances).forEach(([substance, count]) => {
        day[substance] = count;
        day.total += count;
      });
    });

    // Get unique substances from the past 20 days
    const substances = Array.from(
      new Set(recentDoses.map((dose) => dose.substance)),
    ).map((substance) => ({
      name: substance,
      color: getSubstanceColor(substance, isDarkMode),
    }));

    // Calculate summary statistics
    const totalDoses = recentDoses.length;
    const activeDays = days.filter((day) => day.total > 0).length;
    const heaviestDay = [...days].sort((a, b) => b.total - a.total)[0];

    return {
      days,
      substances,
      hasData: recentDoses.length > 0,
      stats: {
        totalDoses,
        activeDays,
        heaviestDay,
      },
    };
  }, [doseData]);

  // No data case
  if (!past20DaysData.hasData) {
    return (
      <div className="flex items-center justify-center w-full h-56 bg-gray-100 dark:bg-gray-800 rounded-lg p-2">
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          No data available for the past 20 days
        </p>
      </div>
    );
  }

  const { stats } = past20DaysData;

  return (
    <div className="w-full">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Past 20 Days</h3>
          <div className="text-[10px] text-gray-500">
            Each bar represents a day with colored segments for different
            substances
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-500 mb-1">Summary:</div>
          <div className="flex gap-2">
            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-[10px]">
              {stats.totalDoses} doses
            </span>
            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded text-[10px]">
              {stats.activeDays} active days
            </span>
            {stats.heaviestDay?.total > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded text-[10px]">
                Max: {stats.heaviestDay?.total} on{" "}
                {format(stats.heaviestDay?.date, "MMM d")}
              </span>
            )}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={past20DaysData.days}
          margin={{ top: 10, right: 10, left: 5, bottom: 30 }}
          layout="vertical"
          barSize={isMobile ? 14 : 16}
          barGap={1}
          barCategoryGap={isMobile ? 3 : 5}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#eee"
            opacity={0.5}
            horizontal={false}
          />
          <XAxis type="number" tick={{ fontSize: 10 }} tickCount={5} />
          <YAxis
            dataKey="dateFormatted"
            type="category"
            tick={{ fontSize: 10 }}
            tickFormatter={(value, index) => {
              const day = past20DaysData.days[index].day;
              return `${value} (${day})`;
            }}
            width={isMobile ? 70 : 80}
          />
          <Tooltip content={<MultiDayTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "10px" }}
            iconSize={8}
            formatter={(value) => (
              <span style={{ fontSize: "10px" }}>{value}</span>
            )}
          />

          {/* Create a bar segment for each substance */}
          {past20DaysData.substances.map((substance) => (
            <Bar
              key={substance.name}
              dataKey={substance.name}
              stackId="a"
              fill={substance.color}
              name={substance.name}
              radius={[0, 4, 4, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// Component for Time of Day heatmap
const TimeOfDayHeatmap = ({ doseData, width, height }) => {
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Create data for time of day analysis by substance
  const timeOfDayData = useMemo(() => {
    const hourData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      hourFormatted: `${i.toString().padStart(2, "0")}:00`,
      total: 0,
    }));

    // Count doses by hour for each substance
    const substancesMap = {};

    doseData.forEach((dose) => {
      const hour = new Date(dose.timestamp).getHours();

      // Add to total for this hour
      hourData[hour].total += 1;

      // Add to substance count for this hour
      if (!substancesMap[dose.substance]) {
        substancesMap[dose.substance] = Array(24).fill(0);
      }
      substancesMap[dose.substance][hour] += 1;
    });

    // Convert to array of substances
    const substances = Object.keys(substancesMap).map((substance) => ({
      name: substance,
      color: getSubstanceColor(substance, isDarkMode),
      data: substancesMap[substance].map((count, hour) => ({
        hour,
        hourFormatted: `${hour.toString().padStart(2, "0")}:00`,
        [substance]: count,
      })),
    }));

    // Add substance data to hourData
    Object.entries(substancesMap).forEach(([substance, counts]) => {
      counts.forEach((count, hour) => {
        hourData[hour][substance] = count;
      });
    });

    return {
      hourData,
      substances,
      maxValue: Math.max(...hourData.map((h) => h.total)),
    };
  }, [doseData]);

  // No data case
  if (doseData.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-32 bg-gray-100 dark:bg-gray-800 rounded-lg p-2">
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          No time of day data available
        </p>
      </div>
    );
  }

  // Calculate peak hours
  const peakHours = useMemo(() => {
    if (!timeOfDayData.hourData.length) return [];

    // Find the top 3 hours with most doses
    return [...timeOfDayData.hourData]
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map((hour) => ({
        hour: hour.hour,
        hourFormatted: hour.hourFormatted,
        total: hour.total,
      }));
  }, [timeOfDayData]);

  return (
    <div className="w-full">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Hour Analysis</h3>
          <div className="text-[10px] text-gray-500">
            Distribution of doses by hour of day
          </div>
        </div>
        {peakHours.length > 0 && (
          <div className="text-right">
            <div className="text-[10px] text-gray-500 mb-1">Peak Hours:</div>
            <div className="flex gap-1">
              {peakHours.map((peak) => (
                <span
                  key={peak.hour}
                  className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-[10px]"
                >
                  {peak.hourFormatted.split(":")[0]}:00 ({peak.total})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={timeOfDayData.hourData}
          margin={{ top: 10, right: 10, left: 5, bottom: 30 }}
          layout="horizontal"
          barSize={isMobile ? 8 : 12}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" opacity={0.5} />
          <XAxis
            dataKey="hourFormatted"
            interval={isMobile ? 3 : 2}
            angle={-45}
            textAnchor="end"
            height={50}
            scale="band"
            tickFormatter={(value) => value.split(":")[0]}
            tick={{ fontSize: 10 }}
          />
          <YAxis width={25} tick={{ fontSize: 10 }} tickCount={5} />
          <Tooltip content={<TimeOfDayTooltip />} />

          {/* Create a bar for each substance */}
          {timeOfDayData.substances.map((substance) => (
            <Bar
              key={substance.name}
              dataKey={substance.name}
              stackId="a"
              fill={substance.color}
              name={substance.name}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// Substance Explorer tab component
const SubstanceExplorer = ({ doseData, personalPatterns }) => {
  const [selectedSubstance, setSelectedSubstance] = useState(null);
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Get list of all substances
  const substances = useMemo(() => {
    const uniqueSubstances = [
      ...new Set(doseData.map((dose) => dose.substance)),
    ];
    return uniqueSubstances
      .map((substance) => {
        const doses = doseData.filter((dose) => dose.substance === substance);
        const pattern = personalPatterns.find((p) => p.substance === substance);

        return {
          name: substance,
          color: getSubstanceColor(substance, isDarkMode),
          count: doses.length,
          lastDose: doses.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          )[0],
          pattern,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [doseData, personalPatterns]);

  // Set default selected substance if none selected
  useEffect(() => {
    if (substances.length > 0 && !selectedSubstance) {
      setSelectedSubstance(substances[0].name);
    }
  }, [substances, selectedSubstance]);

  // Get doses for selected substance
  const selectedSubstanceDoses = useMemo(() => {
    if (!selectedSubstance) return [];
    return doseData
      .filter((dose) => dose.substance === selectedSubstance)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
  }, [doseData, selectedSubstance]);

  // Get pattern for selected substance
  const selectedPattern = useMemo(() => {
    if (!selectedSubstance) return null;
    return personalPatterns.find((p) => p.substance === selectedSubstance);
  }, [personalPatterns, selectedSubstance]);

  // Dose size trend data
  const doseSizeData = useMemo(() => {
    if (!selectedSubstanceDoses.length) return [];

    return selectedSubstanceDoses
      .slice()
      .reverse()
      .map((dose, index) => ({
        index,
        date: new Date(dose.timestamp),
        dateFormatted: format(new Date(dose.timestamp), "MMM d"),
        amount: dose.amount,
        unit: dose.unit,
      }));
  }, [selectedSubstanceDoses]);

  // Route distribution data
  const routeData = useMemo(() => {
    if (!selectedSubstanceDoses.length) return [];

    const routes = {};
    selectedSubstanceDoses.forEach((dose) => {
      routes[dose.route] = (routes[dose.route] || 0) + 1;
    });

    return Object.entries(routes).map(([route, count]) => ({
      name: route,
      value: count,
      color: ROUTE_COLORS[route] || getSubstanceColor(route, isDarkMode),
    }));
  }, [selectedSubstanceDoses]);

  // If no data, show placeholder
  if (doseData.length === 0) {
    return (
      <div className="p-2 bg-white dark:bg-gray-900 rounded-lg">
        <div className="text-center text-gray-500 dark:text-gray-400 p-4 text-xs">
          No data available. Add some doses to see substance analytics.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg p-4">
      <div className="flex flex-wrap mb-3 gap-1">
        {substances.map((substance) => (
          <button
            key={substance.name}
            className={`px-2 py-1 rounded-md text-xs font-medium ${
              selectedSubstance === substance.name
                ? "bg-primary text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            }`}
            onClick={() => setSelectedSubstance(substance.name)}
          >
            {substance.name} ({substance.count})
          </button>
        ))}
      </div>

      {selectedSubstance && selectedSubstanceDoses.length > 0 && (
        <div className="space-y-6">
          {/* Overview card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
              <h3 className="text-xl font-bold mb-2">
                {selectedSubstanceDoses.length}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total Doses
              </p>
              <p className="text-xs mt-2">
                Last: {formatTimestamp(selectedSubstanceDoses[0]?.timestamp)}
              </p>
            </div>

            {selectedPattern && (
              <>
                <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                  <h3 className="text-xl font-bold mb-2">
                    {selectedPattern.recentTrends.typicalDoseRange.avg.toFixed(
                      1,
                    )}
                    <span className="text-sm font-normal ml-1">mg</span>
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Average Dose
                  </p>
                  <p className="text-xs mt-2">
                    Range: {selectedPattern.recentTrends.typicalDoseRange.min}-
                    {selectedPattern.recentTrends.typicalDoseRange.max}mg
                  </p>
                </div>

                <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                  <h3 className="text-xl font-bold mb-2">
                    {selectedPattern.recentTrends.avgTimeBetweenDoses.toFixed(
                      1,
                    )}
                    <span className="text-sm font-normal ml-1">hours</span>
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Average Interval
                  </p>
                  <p className="text-xs mt-2">
                    Peak time: {selectedPattern.recentTrends.commonTimeOfDay}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Dose charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Dose size trend chart */}
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Dose Trend</h3>
              {doseSizeData.length > 1 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={doseSizeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="dateFormatted"
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      label={{
                        value: `Dose (${doseSizeData[0]?.unit})`,
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke={getSubstanceColor(selectedSubstance, isDarkMode)}
                      strokeWidth={2}
                      dot={{ fill: getSubstanceColor(selectedSubstance, isDarkMode) }}
                      activeDot={{ r: 6 }}
                    />

                    {/* Add trend line */}
                    {selectedPattern && (
                      <ReferenceLine
                        stroke={
                          selectedPattern.changeMetrics.doseSizeTrend > 0
                            ? "#EF4444"
                            : "#10B981"
                        }
                        strokeDasharray="3 3"
                        segment={[
                          {
                            x: doseSizeData[0]?.dateFormatted,
                            y: doseSizeData[0]?.amount,
                          },
                          {
                            x: doseSizeData[doseSizeData.length - 1]
                              ?.dateFormatted,
                            y:
                              doseSizeData[0]?.amount *
                              (1 + selectedPattern.changeMetrics.doseSizeTrend),
                          },
                        ]}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <p className="text-gray-500">
                    Not enough data for trend analysis
                  </p>
                </div>
              )}
            </div>

            {/* Route distribution chart */}
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Admin Methods
              </h3>
              {routeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={routeData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                    >
                      {routeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [`${value} doses`, name]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <p className="text-gray-500">No route data available</p>
                </div>
              )}
            </div>
          </div>

          {/* History section */}
          <div className="mt-6">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Recent History</h3>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Date & Time
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Dose
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Route
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {selectedSubstanceDoses.slice(0, 10).map((dose, index) => (
                      <tr
                        key={index}
                        className={
                          index % 2 === 0 ? "bg-gray-50 dark:bg-gray-800" : ""
                        }
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-300">
                          {formatTimestamp(dose.timestamp)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-300">
                          {dose.amount}
                          {dose.unit}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-300">
                          {dose.route}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedSubstanceDoses.length > 10 && (
                <div className="py-1 px-2 text-center text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800">
                  + {selectedSubstanceDoses.length - 10} more doses
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// Main component
export function DoseStats() {
  const [windowWidth, windowHeight] = useWindowSize();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Only "overview" and "substance" tabs are available
  const [activeTab, setActiveTab] = useState("overview");
  const [doses, setDoses] = useState([]);
  const [personalPatterns, setPersonalPatterns] = useState([]);

  // Add global document click/touch handler to close any open tooltips when clicking outside
  useEffect(() => {
    const handleDocumentClick = (e) => {
      // Don't close if clicking on a calendar cell or tooltip (let the cell's own handler manage it)
      if (
        e.target.closest(".calendar-cell") ||
        e.target.closest(".calendar-tooltip")
      ) {
        return;
      }

      // Close all tooltips
      const allTooltips = document.querySelectorAll(".calendar-tooltip");
      allTooltips.forEach((tooltip) => {
        tooltip.style.opacity = "0";
        setTimeout(() => {
          tooltip.classList.add("hidden");
        }, 150);
      });
    };

    // Use mousedown instead of click for better mobile compatibility
    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("touchstart", handleDocumentClick, {
      passive: true,
    });

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("touchstart", handleDocumentClick);
    };
  }, []);

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // Load all doses from database
        const allDoses = await getAllDosesForStats();
        setDoses(allDoses);

        // Calculate personal patterns
        const patterns = analyzePersonalPatterns(allDoses);
        setPersonalPatterns(patterns);

        setLoading(false);
      } catch (error) {
        console.error("Error loading data:", error);
        setError("Failed to load dose data");
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Calculate overall stats
  const stats = useMemo(() => {
    if (doses.length === 0) return null;

    // Total doses
    const totalDoses = doses.length;

    // Unique substances
    const uniqueSubstances = [...new Set(doses.map((d) => d.substance))];

    // Most used substance
    const substanceCounts = {};
    doses.forEach((dose) => {
      substanceCounts[dose.substance] =
        (substanceCounts[dose.substance] || 0) + 1;
    });
    const mostUsedSubstance = Object.entries(substanceCounts).sort(
      (a, b) => b[1] - a[1],
    )[0];

    // Most recent dose
    const sortedDoses = [...doses].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    const mostRecentDose = sortedDoses[0];

    // Route distribution
    const routeCounts = {};
    doses.forEach((dose) => {
      routeCounts[dose.route] = (routeCounts[dose.route] || 0) + 1;
    });
    const routeDistribution = Object.entries(routeCounts)
      .map(([route, count]) => ({ name: route, value: count }))
      .sort((a, b) => b.value - a.value);

    return {
      totalDoses,
      uniqueSubstances,
      mostUsedSubstance,
      mostRecentDose,
      routeDistribution,
    };
  }, [doses]);

  // Loading state
  if (loading) {
    return (
      <div className="w-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">
            Loading your psychonautics data...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h3 className="text-xl font-medium mb-2">Error Loading Data</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <button
            className="px-4 py-2 bg-primary text-white rounded-lg"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No data state
  if (!stats || doses.length === 0) {
    return (
      <div className="w-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-gray-300 text-5xl mb-4">📊</div>
          <h3 className="text-xl font-medium mb-2">No Dose Data Found</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Start tracking your doses to see advanced analytics and insights.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
      </div>

      {/* Stats Overview Cards */}
      {/* No stats cards here, moved to the dashboard tab */}

      {/* Tab Navigation */}
      <div className="mb-4 border-b border-gray-200 dark:border-gray-700">
        <nav className="flex overflow-x-auto hide-scrollbar">
          <button
            className={`px-3 py-2 text-xs font-medium border-b flex items-center gap-1.5 ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
            onClick={() => setActiveTab("overview")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5"
            >
              <rect width="7" height="9" x="3" y="3" rx="1" />
              <rect width="7" height="5" x="14" y="3" rx="1" />
              <rect width="7" height="9" x="14" y="12" rx="1" />
              <rect width="7" height="5" x="3" y="16" rx="1" />
            </svg>
            Dashboard
          </button>
          <button
            className={`px-3 py-2 text-xs font-medium border-b flex items-center gap-1.5 ${
              activeTab === "substance"
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
            onClick={() => setActiveTab("substance")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5"
            >
              <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z" />
              <path d="M7.752 14.256A1.3 1.3 0 0 0 7.8 16.6l2.748 2.1a1.3 1.3 0 0 0 1.894-.389l1.139-2.007a1.3 1.3 0 0 0-.347-1.736l-3.568-2.718a1.3 1.3 0 0 0-1.893.33Z" />
              <path d="M4.292 7.445A1.3 1.3 0 0 0 2.6 8.669v2.742a1.3 1.3 0 0 0 1.276 1.3l2.38.092a1.3 1.3 0 0 0 1.291-1.629l-.633-2.728a1.3 1.3 0 0 0-2.098-.658Z" />
              <path d="M14.338 9.945a1.3 1.3 0 0 0-.392 1.316l.503 1.73a1.3 1.3 0 0 0 1.659.888l2.225-.946a1.3 1.3 0 0 0 .536-2.123l-2.264-2.13a1.3 1.3 0 0 0-2.099.09Z" />
            </svg>
            Substances
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mb-4">
        {activeTab === "overview" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-auto">
            {/* Top Stats Cards - 2 in a row on mobile, side by side on desktop */}
            <div className="grid grid-cols-2 gap-2 col-span-1 md:col-span-2 auto-rows-auto">
              {/* Doses | Drugs Card */}
              <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">
                      Doses | Drugs
                    </p>
                    <h3 className="text-base font-semibold mt-0.5">
                      {stats.totalDoses} | {stats.uniqueSubstances.length}
                    </h3>
                  </div>
                  <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-1.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                    >
                      <path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z" />
                      <path d="M3 7.6v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8" />
                      <path d="M15 2v5h5" />
                    </svg>
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 truncate">
                  <span className="font-medium">Top:</span>{" "}
                  {stats.mostUsedSubstance?.[0]} ({stats.mostUsedSubstance?.[1]}x)
                </div>
              </div>

              {/* Latest Dose Card */}
              <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">
                      Latest Dose
                    </p>
                    <h3 className="text-base font-semibold mt-0.5 truncate max-w-[120px]">
                      {stats.mostRecentDose?.substance}
                    </h3>
                  </div>
                  <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-1.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4 text-green-600 dark:text-green-400"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 truncate">
                  <span className="font-medium">When:</span>{" "}
                  {formatTimestamp(stats.mostRecentDose?.timestamp)}
                </div>
              </div>
            </div>

            {/* Calendar View */}
            <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
              <CalendarView doseData={doses} />
            </div>

            {/* Current Tolerance Status - height auto */}
            <div className="bg-white dark:bg-gray-800 py-1.5 px-2 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 h-auto flex flex-col self-start">
              <h3 className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Tolerance Status
              </h3>
              <CompactToleranceCurve
                substances={[...new Set(doses.map((d) => d.substance))]}
                recentDoses={doses}
              />
            </div>

            {/* Past 20 Days Analysis */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 col-span-1 md:col-span-2">
              <Past20DaysAnalysis doseData={doses} />
            </div>

            {/* Time of Day Analysis */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 col-span-1 md:col-span-2">
              <TimeOfDayHeatmap doseData={doses} />
            </div>
          </div>
        ) : (
          <SubstanceExplorer
            doseData={doses}
            personalPatterns={personalPatterns}
          />
        )}
      </div>
    </div>
  );
}
