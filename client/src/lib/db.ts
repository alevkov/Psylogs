import { openDB, DBSchema, IDBPDatabase } from "idb";

// Define the stored dose entry type
import { UNITS, DoseEntry, Note, GeneralNote } from "./constants";

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
  generalNotes: {
    key: string;
    value: GeneralNote;
    indexes: {
      "by-date": string; // ISO string format for timestamp
    };
  };
}

let db: IDBPDatabase<DoseLogDB> | undefined;

// Flag to track if we need to migrate notes
let needsNotesMigration = false;

export async function getDB() {
  if (!db) {
    // Upgrade to version 2 to include general notes
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

        // Add general notes store (version 2)
        if (oldVersion < 2) {
          console.log("Adding general notes store (version 2)");
          const generalNotesStore = db.createObjectStore("generalNotes", {
            keyPath: "id",
          });
          generalNotesStore.createIndex("by-date", "timestamp");
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

    // Make sure to always include an empty notes array with new doses
    const id = await tx.store.add({
      ...dose,
      timestamp: new Date().toISOString(),
      notes: dose.notes || [],
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

// Helper function to ensure a dose has a notes array
function ensureNotesArray(dose: DoseEntry): DoseEntry {
  if (!dose.notes) {
    return { ...dose, notes: [] };
  }
  return dose;
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

  // Extract the requested slice and ensure notes array exists
  const doses = allDoses.slice(offset, offset + limit).map(ensureNotesArray);

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

    // Ensure notes array exists for all doses
    const dosesWithNotes = allDoses.map(ensureNotesArray);

    console.log(`Loaded ${dosesWithNotes.length} doses for statistics`);
    return dosesWithNotes;
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

  // Get the requested page and ensure notes array exists
  const doses = allDoses.slice(offset, offset + limit).map(ensureNotesArray);

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

  // Get the requested page and ensure notes array exists
  const doses = allDoses.slice(offset, offset + limit).map(ensureNotesArray);

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

  // Get the requested page and ensure notes array exists
  const doses = filteredDoses
    .slice(offset, offset + limit)
    .map(ensureNotesArray);

  return { doses, total };
}

export async function clearAllData(): Promise<void> {
  try {
    const db = await getDB();

    // Clear doses store
    const dosesTx = db.transaction("doses", "readwrite");
    await dosesTx.store.clear();
    await dosesTx.done;

    // Clear general notes store
    const notesTx = db.transaction("generalNotes", "readwrite");
    await notesTx.store.clear();
    await notesTx.done;

    console.log("All data cleared successfully");
  } catch (error) {
    console.error("Failed to clear all data:", error);
    throw error;
  }
}

// Keep the old function for backward compatibility
export async function clearDoses(): Promise<void> {
  return clearAllData();
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

    // Ensure the existing dose has a notes array
    const doseWithNotes = ensureNotesArray(existingDose);

    // Update dose
    const updatedDose = {
      ...doseWithNotes,
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

// General Notes CRUD Operations
export async function addGeneralNote(
  note: Omit<GeneralNote, "id">,
): Promise<string> {
  try {
    const db = await getDB();
    const tx = db.transaction("generalNotes", "readwrite");

    // Generate a unique ID for the note
    const id = crypto.randomUUID();

    // Add the note with the generated ID
    await tx.store.add({
      ...note,
      id,
    });

    await tx.done;
    return id;
  } catch (error) {
    console.error("Failed to add general note:", error);
    throw error;
  }
}

export async function getGeneralNotes(
  limit: number = 50,
  offset: number = 0,
): Promise<{ notes: GeneralNote[]; total: number }> {
  try {
    const db = await getDB();
    const tx = db.transaction("generalNotes", "readonly");

    // Get total count
    const total = await tx.store.count();

    // Get all notes
    const allNotes = await db.getAllFromIndex("generalNotes", "by-date");

    // Sort by timestamp, newest first
    allNotes.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Apply pagination
    const notes = allNotes.slice(offset, offset + limit);

    return { notes, total };
  } catch (error) {
    console.error("Failed to get general notes:", error);
    return { notes: [], total: 0 };
  }
}

export async function getGeneralNotesByDateRange(
  startDate: Date,
  endDate: Date,
  limit: number = 50,
  offset: number = 0,
): Promise<{ notes: GeneralNote[]; total: number }> {
  try {
    const db = await getDB();
    const allNotes = await db.getAllFromIndex("generalNotes", "by-date");
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // Filter notes in the date range
    const filteredNotes = allNotes.filter(
      (note) => note.timestamp >= startIso && note.timestamp <= endIso,
    );

    // Sort the notes by timestamp (newest first)
    filteredNotes.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Get the total count
    const total = filteredNotes.length;

    // Apply pagination
    const notes = filteredNotes.slice(offset, offset + limit);

    return { notes, total };
  } catch (error) {
    console.error("Failed to get general notes by date range:", error);
    return { notes: [], total: 0 };
  }
}

export async function updateGeneralNote(
  id: string,
  updates: Partial<Omit<GeneralNote, "id">>,
): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("generalNotes", "readwrite");

    // Get existing note
    const existingNote = await tx.store.get(id);
    if (!existingNote) {
      throw new Error("General note not found");
    }

    // Update note
    const updatedNote = {
      ...existingNote,
      ...updates,
    };

    await tx.store.put(updatedNote);
    await tx.done;
  } catch (error) {
    console.error("Failed to update general note:", error);
    throw error;
  }
}

export async function deleteGeneralNote(id: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("generalNotes", "readwrite");
    await tx.store.delete(id);
    await tx.done;
  } catch (error) {
    console.error("Failed to delete general note:", error);
    throw error;
  }
}

export async function clearGeneralNotes(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction("generalNotes", "readwrite");
    await tx.store.clear();
    await tx.done;
  } catch (error) {
    console.error("Failed to clear general notes:", error);
    throw error;
  }
}

export async function exportData(): Promise<void> {
  try {
    // For export, we need all doses and general notes with no pagination
    const db = await getDB();
    const allDoses = await db.getAll("doses");
    const allGeneralNotes = await db.getAll("generalNotes");

    const exportData = {
      doses: allDoses,
      generalNotes: allGeneralNotes,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
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
    let parsedData = JSON.parse(text);
    let doses: DoseEntry[] = [];
    let generalNotes: GeneralNote[] = [];

    // Check if this is the new format with both doses and general notes
    if (
      parsedData &&
      typeof parsedData === "object" &&
      !Array.isArray(parsedData)
    ) {
      // New format: { doses: [...], generalNotes: [...] }
      if (Array.isArray(parsedData.doses)) {
        doses = parsedData.doses;
      } else {
        throw new Error("Invalid data format - expected doses array");
      }

      // General notes are optional for backward compatibility
      if (parsedData.generalNotes && Array.isArray(parsedData.generalNotes)) {
        generalNotes = parsedData.generalNotes;
      }
    } else if (Array.isArray(parsedData)) {
      // Old format: just an array of doses
      doses = parsedData;
    } else {
      throw new Error("Invalid data format");
    }

    // Validate dose data
    if (doses.length > 0) {
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
    }

    // Validate general notes if present
    if (generalNotes.length > 0) {
      generalNotes.forEach((note, index) => {
        if (!note.text || !note.timestamp) {
          throw new Error(`Invalid general note data at index ${index}`);
        }
        // Validate timestamp format
        if (isNaN(Date.parse(note.timestamp))) {
          throw new Error(
            `Invalid timestamp format in general note at index ${index}`,
          );
        }
        // Ensure each note has an ID
        if (!note.id) {
          note.id = crypto.randomUUID();
        }
        // Ensure title field exists (backward compatibility)
        if (note.title === undefined) {
          note.title = "";
        }
      });
    }

    const db = await getDB();

    // Clear and import doses
    if (doses.length > 0) {
      const dosesTx = db.transaction("doses", "readwrite");
      await dosesTx.store.clear();
      await Promise.all(doses.map((dose) => dosesTx.store.add(dose)));
      await dosesTx.done;
    }

    // Clear and import general notes if present
    if (generalNotes.length > 0) {
      const notesTx = db.transaction("generalNotes", "readwrite");
      await notesTx.store.clear();
      await Promise.all(generalNotes.map((note) => notesTx.store.add(note)));
      await notesTx.done;
    }

    console.log(
      `Import complete: ${doses.length} doses and ${generalNotes.length} general notes imported`,
    );
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
    // Array to store general notes extracted from experiences
    let generalNotes: GeneralNote[] = [];

    try {
      doses = experiences
        .flatMap((experience) => {
          // Extract general notes from experience timedNotes
          if (
            experience.timedNotes &&
            Array.isArray(experience.timedNotes) &&
            experience.timedNotes.length > 0
          ) {
            // Create a unique ID for this experience
            const experienceId = crypto.randomUUID();

            // Get the experience title or use empty string if no title
            const experienceTitle = experience.title || "";

            // Process each timed note
            experience.timedNotes.forEach((timedNote) => {
              if (timedNote.note && timedNote.time) {
                generalNotes.push({
                  id: crypto.randomUUID(),
                  timestamp: new Date(timedNote.time).toISOString(),
                  text: timedNote.note,
                  title: experienceTitle,
                  experienceId,
                });
              }
            });
          }

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

              // Extract notes from ingestion if they exist
              const notes: Note[] = [];
              if (ingestion.notes && ingestion.notes.trim() !== "") {
                notes.push({
                  id: crypto.randomUUID(),
                  timestamp: new Date(
                    ingestion.creationDate || ingestion.time,
                  ).toISOString(),
                  text: ingestion.notes,
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

    // Sort doses and general notes by timestamp
    doses.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    generalNotes.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Add to database using transactions
    const db = await getDB();
    let importSuccess = false;
    let generalNotesCount = 0;

    try {
      // First, import the doses
      const dosesTx = db.transaction("doses", "readwrite");
      await Promise.all(doses.map((dose) => dosesTx.store.add(dose)));
      await dosesTx.done;

      // Then, import the general notes if there are any
      if (generalNotes.length > 0) {
        const notesTx = db.transaction("generalNotes", "readwrite");
        await Promise.all(generalNotes.map((note) => notesTx.store.add(note)));
        await notesTx.done;
        generalNotesCount = generalNotes.length;
      }

      importSuccess = true;

      return {
        success: true,
        count: doses.length,
        generalNotesCount,
        message: `Successfully imported ${doses.length} doses and ${generalNotesCount} general notes`,
      };
    } catch (error) {
      console.error("Error during import transaction:", error);
      throw error;
    } finally {
      if (!importSuccess) {
        // If an error occurred, we should log it
        console.error("Import failed, no changes were committed");
      }
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
