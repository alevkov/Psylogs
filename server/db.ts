import { openDB, DBSchema, IDBPDatabase } from "idb";

// Define the stored dose entry type
import { UNITS, DoseEntry, Note } from "./constants";

interface DoseLogDB extends DBSchema {
  doses: {
    key: number;
    value: DoseEntry;
    indexes: {
      "by-date": string; // ISO string format for timestamp
      "by-substance": string;
      "by-route": string;
    };
  };
}

let db: IDBPDatabase<DoseLogDB> | undefined;

export async function getDB() {
  if (!db) {
    db = await openDB<DoseLogDB>("dose-log", 2, {
      upgrade(db, oldVersion, newVersion) {
        console.log(
          `Upgrading database from version ${oldVersion} to ${newVersion}`,
        );

        // Initial setup (version 1)
        if (oldVersion < 1) {
          console.log("Creating initial database schema (version 1)");
          const store = db.createObjectStore("doses", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("by-date", "timestamp");
          store.createIndex("by-substance", "substance");
          store.createIndex("by-route", "route");
        }

        // Add notes support (version 2)
        if (oldVersion < 2 && oldVersion > 0) {
          console.log("Upgrading to version 2: adding notes support");

          // In an upgrade transaction, we already have a transaction context
          // Get the store directly from the database object
          const store = db.objectStore("doses");

          // Use a cursor to iterate through all doses and add notes array
          const request = store.openCursor();

          request.onsuccess = function (event) {
            const cursor = event.target.result;
            if (cursor) {
              // Get dose at current cursor position
              const dose = cursor.value;

              // Add empty notes array if it doesn't exist
              if (!dose.notes) {
                dose.notes = [];
                cursor.update(dose);
              }

              // Move to next item
              cursor.continue();
            }
          };
        }
      },
      blocked() {
        console.warn("Database upgrade blocked - please close other tabs");
      },
      blocking() {
        db?.close();
      },
      terminated() {
        db = undefined;
      },
    });
  }
  return db;
}

export async function addDose(dose: Omit<DoseEntry, "id" | "timestamp">) {
  try {
    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    // Validate dose data
    if (!dose.substance || !dose.amount || !dose.route) {
      throw new Error("Invalid dose data: missing required fields");
    }

    const id = await tx.store.add({
      ...dose,
      timestamp: new Date().toISOString(),
      notes: [],
    });

    await tx.done;

    // Register for background sync if supported
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        // Need to use type assertion because TypeScript doesn't recognize the sync property
        const syncManager =
          "sync" in registration ? (registration as any).sync : null;
        if (syncManager) {
          await syncManager.register("sync-doses");
        }
      } catch (err) {
        console.error("Background sync registration failed:", err);
      }
    }

    return id;
  } catch (error) {
    console.error("Failed to add dose:", error);
    throw error;
  }
}

export async function getDoses(
  limit: number = 50,
  offset: number = 0,
): Promise<{ doses: DoseEntry[]; total: number }> {
  const db = await getDB();
  const tx = db.transaction("doses", "readonly");
  const store = tx.objectStore("doses");

  // Get total count
  const total = await store.count();

  // Get all doses first for sorting (we'll paginate after sorting)
  const allDoses = await db.getAllFromIndex("doses", "by-date");

  // Sort by timestamp, newest first
  allDoses.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Extract the requested slice
  const doses = allDoses.slice(offset, offset + limit);

  return { doses, total };
}

/**
 * Get all doses for statistics purposes without pagination
 * This function should only be used for analytics/stats where all data is needed
 */
export async function getAllDosesForStats(): Promise<DoseEntry[]> {
  try {
    console.log("Getting all doses for statistics");
    const db = await getDB();
    // Get all doses
    const allDoses = await db.getAll("doses");

    // Sort by timestamp, newest first
    allDoses.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    console.log(`Loaded ${allDoses.length} doses for statistics`);
    return allDoses;
  } catch (error) {
    console.error("Error fetching all doses for stats:", error);
    return [];
  }
}

export async function getDosesBySubstance(
  substance: string,
  limit: number = 50,
  offset: number = 0,
): Promise<{ doses: DoseEntry[]; total: number }> {
  const db = await getDB();
  const tx = db.transaction("doses", "readonly");
  const index = tx.store.index("by-substance");

  // Get total count for this substance
  const keyRange = IDBKeyRange.only(substance);
  const total = await index.count(keyRange);

  // Get all matching doses
  const allDoses = await db.getAllFromIndex("doses", "by-substance", substance);

  // Sort the doses by timestamp (newest first)
  allDoses.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Get the requested page
  const doses = allDoses.slice(offset, offset + limit);

  return { doses, total };
}

export async function getDosesByRoute(
  route: string,
  limit: number = 50,
  offset: number = 0,
): Promise<{ doses: DoseEntry[]; total: number }> {
  const db = await getDB();
  const tx = db.transaction("doses", "readonly");
  const index = tx.store.index("by-route");

  // Get total count for this route
  const keyRange = IDBKeyRange.only(route);
  const total = await index.count(keyRange);

  // Get all matching doses
  const allDoses = await db.getAllFromIndex("doses", "by-route", route);

  // Sort the doses by timestamp (newest first)
  allDoses.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Get the requested page
  const doses = allDoses.slice(offset, offset + limit);

  return { doses, total };
}

export async function getDosesByDateRange(
  startDate: Date,
  endDate: Date,
  limit: number = 50,
  offset: number = 0,
): Promise<{ doses: DoseEntry[]; total: number }> {
  const db = await getDB();
  const allDoses = await db.getAllFromIndex("doses", "by-date");
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  // Filter doses in the date range
  const filteredDoses = allDoses.filter(
    (dose) => dose.timestamp >= startIso && dose.timestamp <= endIso,
  );

  // Sort the doses by timestamp (newest first)
  filteredDoses.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Get the total count
  const total = filteredDoses.length;

  // Get the requested page
  const doses = filteredDoses.slice(offset, offset + limit);

  return { doses, total };
}

export async function clearDoses(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");
    await tx.store.clear();
    await tx.done;
  } catch (error) {
    console.error("Failed to clear doses:", error);
    throw error;
  }
}

export async function deleteDose(id: number): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");
    await tx.store.delete(id);
    await tx.done;
  } catch (error) {
    console.error("Failed to delete dose:", error);
    throw error;
  }
}

export async function updateDose(
  id: number,
  updates: Partial<Omit<DoseEntry, "id">>,
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    // Get existing dose
    const existingDose = await tx.store.get(id);
    if (!existingDose) {
      throw new Error("Dose not found");
    }

    // Update dose
    const updatedDose = {
      ...existingDose,
      ...updates,
    };

    await tx.store.put(updatedDose);
    await tx.done;
  } catch (error) {
    console.error("Failed to update dose:", error);
    throw error;
  }
}

/**
 * Add a note to a dose
 * @param doseId The ID of the dose to add the note to
 * @param text The text content of the note
 */
export async function addNote(doseId: number, text: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    // Get existing dose
    const existingDose = await tx.store.get(doseId);
    if (!existingDose) {
      throw new Error("Dose not found");
    }

    // Create new note
    const newNote = {
      id: crypto.randomUUID(), // Generate a unique ID for the note
      timestamp: new Date().toISOString(),
      text,
    };

    // Add note to dose
    const notes = existingDose.notes || [];
    const updatedDose = {
      ...existingDose,
      notes: [...notes, newNote],
    };

    await tx.store.put(updatedDose);
    await tx.done;
  } catch (error) {
    console.error("Failed to add note:", error);
    throw error;
  }
}

/**
 * Update an existing note
 * @param doseId The ID of the dose containing the note
 * @param noteId The ID of the note to update
 * @param text The new text content of the note
 */
export async function updateNote(
  doseId: number,
  noteId: string,
  text: string,
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    // Get existing dose
    const existingDose = await tx.store.get(doseId);
    if (!existingDose) {
      throw new Error("Dose not found");
    }

    // Find the note to update
    const notes = existingDose.notes || [];
    const noteIndex = notes.findIndex((note) => note.id === noteId);

    if (noteIndex === -1) {
      throw new Error("Note not found");
    }

    // Update the note
    const updatedNotes = [...notes];
    updatedNotes[noteIndex] = {
      ...updatedNotes[noteIndex],
      text,
    };

    // Update the dose with the new notes
    const updatedDose = {
      ...existingDose,
      notes: updatedNotes,
    };

    await tx.store.put(updatedDose);
    await tx.done;
  } catch (error) {
    console.error("Failed to update note:", error);
    throw error;
  }
}

/**
 * Delete a note from a dose
 * @param doseId The ID of the dose containing the note
 * @param noteId The ID of the note to delete
 */
export async function deleteNote(
  doseId: number,
  noteId: string,
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    // Get existing dose
    const existingDose = await tx.store.get(doseId);
    if (!existingDose) {
      throw new Error("Dose not found");
    }

    // Filter out the note to delete
    const notes = existingDose.notes || [];
    const updatedNotes = notes.filter((note) => note.id !== noteId);

    // Update the dose with the filtered notes
    const updatedDose = {
      ...existingDose,
      notes: updatedNotes,
    };

    await tx.store.put(updatedDose);
    await tx.done;
  } catch (error) {
    console.error("Failed to delete note:", error);
    throw error;
  }
}

export async function exportData(): Promise<void> {
  try {
    // For export, we need all doses with no pagination
    const db = await getDB();
    const allDoses = await db.getAll("doses");

    const blob = new Blob([JSON.stringify(allDoses, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dose-log-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to export data:", error);
    throw error;
  }
}

export async function importData(file: File): Promise<void> {
  try {
    const text = await file.text();
    const doses: DoseEntry[] = JSON.parse(text);

    // Validate array structure
    if (!Array.isArray(doses)) {
      throw new Error("Invalid data format - expected array of doses");
    }

    // Validate each dose
    doses.forEach((dose, index) => {
      if (!dose.substance || !dose.amount || !dose.route || !dose.timestamp) {
        throw new Error(`Invalid dose data at index ${index}`);
      }
      // Validate timestamp format
      if (isNaN(Date.parse(dose.timestamp))) {
        throw new Error(`Invalid timestamp format at index ${index}`);
      }
      // Validate unit
      if (!(UNITS as readonly string[]).includes(dose.unit)) {
        throw new Error(`Invalid unit at index ${index}: ${dose.unit}`);
      }
    });

    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    await tx.store.clear();
    await Promise.all(doses.map((dose) => tx.store.add(dose)));
    await tx.done;
  } catch (error) {
    console.error("Failed to import data:", error);
    throw error;
  }
}

// New function to handle the newline-separated JSON objects
export async function importDataFromTextFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    const lines = text.split("\n").filter((line) => line.trim());

    const doses: DoseEntry[] = lines.map((line, index) => {
      try {
        const obj = JSON.parse(line);
        const { drug, dose, units, created } = obj;

        if (!drug || !dose || !units || !created) {
          throw new Error(`Missing fields at line ${index + 1}`);
        }

        const amount =
          units === "g" ? parseFloat(dose) * 1000 : parseFloat(dose);
        // Normalize unit to match what's in UNITS
        let normalizedUnit = units.toLowerCase();
        // Special case for 'g' since we want to convert to mg but keep 'g' in UNITS
        const unit =
          normalizedUnit === "g" && amount > 0
            ? "mg"
            : (normalizedUnit as (typeof UNITS)[number]);
        const timestamp = new Date(created).toISOString();
        const route = "oral"; // Default to 'oral', adjust based on your needs

        if (isNaN(amount) || isNaN(Date.parse(timestamp))) {
          throw new Error(`Invalid data at line ${index + 1}`);
        }

        return {
          substance: drug.toLowerCase(),
          amount,
          unit,
          route,
          timestamp,
          notes: [],
        };
      } catch (err) {
        const error = err as Error;
        throw new Error(`Error parsing line ${index + 1}: ${error.message}`);
      }
    });

    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    await Promise.all(doses.map((dose) => tx.store.add(dose)));
    await tx.done;
  } catch (error) {
    console.error("Failed to import data from text file:", error);
    throw error;
  }
}

// Map PW Journal route names to our format
const routeMap: Record<string, string> = {
  ORAL: "oral",
  INSUFFLATED: "nasal",
  SUBLINGUAL: "sublingual",
  INTRAVENOUS: "intravenous-injection",
  INTRAMUSCULAR: "intramuscular-injection",
  RECTAL: "rectal",
  TRANSDERMAL: "transdermal",
  BUCCAL: "buccal",
  SMOKED: "inhaled",
  VAPORIZED: "inhaled",
};

interface PWJournalExperience {
  title?: string;
  text?: string;
  ingestions?: Array<{
    substanceName: string;
    dose: number;
    units: string;
    administrationRoute: string;
    time: number;
  }>;
  timedNotes?: Array<{
    note: string;
    time: number;
  }>;
}

interface PWJournalData {
  experiences: Array<PWJournalExperience>;
}

// Helper function to analyze a file's JSON structure
export async function analyzeJSONFile(file: File): Promise<{
  isValid: boolean;
  format: string;
  sample?: any;
  error?: string;
}> {
  try {
    const text = await file.text();
    const jsonData = JSON.parse(text);

    // Check what type of data structure we have
    if (Array.isArray(jsonData)) {
      // It's an array - check if it's likely dose data
      const firstItem = jsonData[0] || {};
      const hasDoseProps =
        "substance" in firstItem || "drug" in firstItem || "dose" in firstItem;

      return {
        isValid: true,
        format: hasDoseProps ? "dose-array" : "array",
        sample: firstItem,
      };
    } else if (typeof jsonData === "object") {
      // It's an object - check if it's PW Journal format
      if ("experiences" in jsonData && Array.isArray(jsonData.experiences)) {
        // It's likely a PW Journal export
        const hasIngestions =
          jsonData.experiences[0]?.ingestions &&
          Array.isArray(jsonData.experiences[0]?.ingestions);

        return {
          isValid: true,
          format: "pw-journal",
          sample: hasIngestions ? jsonData.experiences[0].ingestions[0] : null,
        };
      }
      // Any other object structure
      return {
        isValid: true,
        format: "object",
        sample: jsonData,
      };
    }

    return { isValid: false, format: "unknown" };
  } catch (error) {
    return {
      isValid: false,
      format: "invalid",
      error: error instanceof Error ? error.message : "Unknown parsing error",
    };
  }
}

export async function importPWJournalData(file: File) {
  try {
    const text = await file.text();
    let data: PWJournalData;

    try {
      data = JSON.parse(text);
    } catch (jsonError) {
      console.error("JSON parse error:", jsonError);
      throw new Error(
        "Invalid JSON format in the journal file. Please ensure it's a valid JSON file.",
      );
    }

    // Check if this is a PW Journal export (should have experiences array)
    if (!data?.experiences) {
      // If not a PW Journal format, see if it's directly an array of doses
      try {
        const directDoses = JSON.parse(text);
        if (Array.isArray(directDoses)) {
          // Convert to our expected format
          data = {
            experiences: [
              {
                ingestions: directDoses.map((d) => ({
                  substanceName: d.substance || d.drug,
                  dose: d.amount || d.dose,
                  units: d.unit || d.units || "mg",
                  administrationRoute: d.route || "ORAL",
                  time: d.timestamp
                    ? new Date(d.timestamp).getTime()
                    : Date.now(),
                })),
              },
            ],
          };
          console.log("Converted direct dose array to PW Journal format");
        } else {
          throw new Error(
            "Invalid data format - expected array of doses or PW Journal format",
          );
        }
      } catch (e) {
        throw new Error(
          "Invalid PW Journal data format: No experiences array found",
        );
      }
    }

    // Make sure experiences is an array (even if empty)
    const experiences = Array.isArray(data.experiences) ? data.experiences : [];

    if (experiences.length === 0) {
      throw new Error("No experiences found in journal data");
    }

    // Count experiences without ingestions for user feedback
    const experiencesWithoutIngestions = experiences.filter(
      (exp) =>
        !exp.ingestions ||
        !Array.isArray(exp.ingestions) ||
        exp.ingestions.length === 0,
    ).length;

    if (experiencesWithoutIngestions > 0) {
      console.log(
        `Found ${experiencesWithoutIngestions} experiences without ingestions`,
      );
    }

    // Process experiences to extract dose information
    let doses = [];
    try {
      doses = experiences
        .flatMap((experience) => {
          // Check if experience has ingestions array before processing
          if (!experience.ingestions || !Array.isArray(experience.ingestions)) {
            console.log(
              "Experience without ingestions:",
              experience.title || "Untitled",
            );
            return []; // Skip this experience and return empty array for flatMap
          }

          // Log the ingestions for debugging
          console.log(
            `Processing ${experience.ingestions.length} ingestions for experience: ${experience.title || "Untitled"}`,
          );

          return experience.ingestions
            .filter((ing) => {
              // Special handling for cannabis which often has null doses in PW Journal
              if (
                !ing ||
                (!ing.dose && ing.substanceName.toLowerCase() !== "cannabis") ||
                !ing.substanceName ||
                !ing.time
              ) {
                console.log("Skipping invalid ingestion:", ing);
                return false;
              }
              return true;
            })
            .map((ingestion) => {
              // Normalize units to ensure they match our system
              let unit = (ingestion.units || "mg").toLowerCase();
              let substance = (
                ingestion.substanceName || "unknown"
              ).toLowerCase();

              // Handle null doses (common with cannabis in PW Journal)
              let amount = 0;
              if (ingestion.dose === null || ingestion.dose === undefined) {
                if (substance === "cannabis") {
                  // Use 1 as a default amount for cannabis with null dose
                  amount = 1;
                  console.log("Using default dose of 1 for cannabis entry");
                } else {
                  // Try to parse the dose, default to 0 if not possible
                  amount = 0;
                }
              } else {
                amount = parseFloat(ingestion.dose.toString());
              }

              // Special case for Cannabis with "mg THC" units
              if (substance === "cannabis" && unit === "mg thc") {
                unit = "mg";
                substance = "thc";
                console.log(
                  "Converting Cannabis with 'mg THC' units to 'thc' substance with 'mg' units",
                );
              }

              // Handle common unit conversions
              if (unit === "g") {
                amount = amount * 1000;
                unit = "mg";
              } else if (unit.includes("mg")) {
                unit = "mg";
              } else if (
                unit.includes("ug") ||
                unit.includes("µg") ||
                unit.includes("mcg")
              ) {
                unit = "ug";
              } else if (unit.includes("ml") || unit.includes("cc")) {
                unit = "ml";
              } else {
                // For other units, default to mg
                console.log(
                  `Unknown unit '${ingestion.units}' for ${substance}, defaulting to mg`,
                );
                unit = "mg";
              }

              // Make sure the unit is one of our accepted units
              if (!(UNITS as readonly string[]).includes(unit)) {
                console.log(`Converting unrecognized unit '${unit}' to 'mg'`);
                unit = "mg";
              }

              // Normalize the route
              const route = routeMap[ingestion.administrationRoute] || "oral";

              // Create timestamp
              let timestamp;
              try {
                timestamp = new Date(ingestion.time).toISOString();
              } catch (e) {
                console.error("Invalid timestamp, using current time:", e);
                timestamp = new Date().toISOString();
              }

              // Check for timed notes in the experience
              const notes: Note[] = [];
              if (
                experience.timedNotes &&
                Array.isArray(experience.timedNotes)
              ) {
                experience.timedNotes.forEach((timedNote) => {
                  if (timedNote.note && timedNote.time) {
                    notes.push({
                      id: crypto.randomUUID(),
                      timestamp: new Date(timedNote.time).toISOString(),
                      text: timedNote.note,
                    });
                  }
                });
              }

              return {
                substance: substance, // Using the potentially modified substance
                amount: amount,
                unit: unit as (typeof UNITS)[number],
                route: route,
                timestamp: timestamp,
                notes: notes,
              };
            });
        })
        .filter((dose) => {
          if (
            !dose.substance ||
            (dose.amount <= 0 && dose.substance.toLowerCase() !== "cannabis") ||
            !(UNITS as readonly string[]).includes(dose.unit)
          ) {
            console.log("Filtering out invalid dose:", dose);
            return false;
          }
          return true;
        });
    } catch (error) {
      console.error("Error processing experiences:", error);
      throw new Error(
        `Error processing dose data: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    // Check if we have valid doses to import
    if (!doses.length) {
      const experiencesWithoutIngestions = experiences.filter(
        (exp) => !exp.ingestions || !Array.isArray(exp.ingestions),
      ).length;
      const totalExperiences = experiences.length;

      if (experiencesWithoutIngestions > 0) {
        throw new Error(
          `No valid doses found in PW Journal data. Found ${experiencesWithoutIngestions} out of ${totalExperiences} experiences without ingestions data. This issue has been fixed, please try importing again.`,
        );
      } else {
        throw new Error("No valid doses found in PW Journal data");
      }
    }

    // Sort by timestamp
    doses.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Add to database using transaction
    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    try {
      await Promise.all(doses.map((dose) => tx.store.add(dose)));
      await tx.done;

      return {
        success: true,
        count: doses.length,
        message: `Successfully imported ${doses.length} doses`,
      };
    } catch (error) {
      tx.abort();
      throw error;
    }
  } catch (err) {
    console.error("Error importing PW Journal data:", err);

    // Format a more helpful error message
    let errorMessage = "Failed to import PW Journal data";

    if (err instanceof Error) {
      if (err.message.includes("experience.ingestions")) {
        errorMessage =
          "Journal file contains experiences without ingestion data. This has been fixed, please try again.";
      } else if (err.message.includes("JSON")) {
        errorMessage = "Invalid JSON format in the journal file.";
      } else if (err.message.includes("array")) {
        errorMessage =
          "The file format is not recognized. Please ensure this is a PW Journal export file.";
      } else {
        errorMessage = err.message;
      }
    }

    console.error("Final error message:", errorMessage);
    throw new Error(errorMessage);
  }
}
