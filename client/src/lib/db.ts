import { openDB, DBSchema, IDBPDatabase } from "idb";

// Define the stored dose entry type
interface DoseEntry {
  id?: number;
  substance: string;
  amount: number;
  route: string;
  timestamp: string; // ISO string format
  unit: 'mg' | 'ug' | 'ml';
}

interface DoseLogDB extends DBSchema {
  doses: {
    key: number;
    value: DoseEntry;
    indexes: {
      "by-date": string;  // ISO string format for timestamp
      "by-substance": string;
      "by-route": string;
    };
  };
}

let db: IDBPDatabase<DoseLogDB> | undefined;

export async function getDB() {
  if (!db) {
    db = await openDB<DoseLogDB>("dose-log", 1, {
      upgrade(db) {
        const store = db.createObjectStore("doses", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by-date", "timestamp");
        store.createIndex("by-substance", "substance");
        store.createIndex("by-route", "route");
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
      timestamp: new Date().toISOString()
    });

    await tx.done;

    // Register for background sync if supported
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if ("sync" in registration) {
          await registration.sync.register("sync-doses");
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

export async function getDoses(): Promise<DoseEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("doses", "by-date");
}

export async function getDosesBySubstance(substance: string): Promise<DoseEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("doses", "by-substance", substance);
}

export async function getDosesByRoute(route: string): Promise<DoseEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("doses", "by-route", route);
}

export async function getDosesByDateRange(startDate: Date, endDate: Date): Promise<DoseEntry[]> {
  const db = await getDB();
  const doses = await db.getAllFromIndex("doses", "by-date");
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  return doses.filter(dose =>
    dose.timestamp >= startIso && dose.timestamp <= endIso
  );
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

export async function updateDose(id: number, updates: Partial<Omit<DoseEntry, "id">>): Promise<void> {
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

export async function exportData(): Promise<void> {
  try {
    const doses = await getDoses();
    const blob = new Blob([JSON.stringify(doses, null, 2)], {
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
      if (!['mg', 'ug', 'ml'].includes(dose.unit)) {
        throw new Error(`Invalid unit at index ${index}: ${dose.unit}`);
      }
    });

    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    await tx.store.clear();
    await Promise.all(doses.map(dose => tx.store.add(dose)));
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
    const lines = text.split("\n").filter(line => line.trim());

    const doses: DoseEntry[] = lines.map((line, index) => {
      try {
        const obj = JSON.parse(line);
        const { drug, dose, units, created } = obj;

        if (!drug || !dose || !units || !created) {
          throw new Error(`Missing fields at line ${index + 1}`);
        }

        const amount = units === 'g' ? parseFloat(dose) * 1000 : parseFloat(dose);
        const unit = units === 'g' ? 'mg' : units.toLowerCase() as 'mg' | 'ug' | 'ml';
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
          timestamp
        };
      } catch (error) {
        throw new Error(`Error parsing line ${index + 1}: ${error.message}`);
      }
    });

    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    await Promise.all(doses.map(dose => tx.store.add(dose)));
    await tx.done;
  } catch (error) {
    console.error("Failed to import data from text file:", error);
    throw error;
  }
}

// Map PW Journal route names to our format
const routeMap: Record<string, string> = {
  'ORAL': 'oral',
  'INSUFFLATED': 'nasal',
  'SUBLINGUAL': 'sublingual',
  'INTRAVENOUS': 'intravenous-injection',
  'INTRAMUSCULAR': 'intramuscular-injection',
  'RECTAL': 'rectal',
  'TRANSDERMAL': 'transdermal',
  'BUCCAL': 'buccal',
  'SMOKED': 'inhaled',
  'VAPORIZED': 'inhaled',
};

interface PWJournalData {
  experiences: Array<{
    ingestions: Array<{
      substanceName: string;
      dose: number;
      units: string;
      administrationRoute: string;
      time: number;
    }>;
  }>;
}

export async function importPWJournalData(file: File) {
  try {
    const text = await file.text();
    const data: PWJournalData = JSON.parse(text);

    if (!data?.experiences?.length) {
      throw new Error("Invalid PW Journal data format");
    }

    const doses = data.experiences.flatMap(experience =>
      experience.ingestions
        .filter(ing => ing && ing.dose > 0 && ing.substanceName && ing.time)
        .map(ingestion => ({
          substance: ingestion.substanceName.toLowerCase(),
          amount: ingestion.units === 'g' ? ingestion.dose * 1000 : ingestion.dose,
          unit: ingestion.units === 'g' ? 'mg' : ingestion.units as 'mg' | 'ug' | 'ml',
          route: routeMap[ingestion.administrationRoute] || 'oral',
          timestamp: new Date(ingestion.time).toISOString()
        }))
    ).filter(dose =>
      dose.substance &&
      dose.amount > 0 &&
      ['mg', 'ug', 'ml'].includes(dose.unit)
    );

    if (!doses.length) {
      throw new Error("No valid doses found in PW Journal data");
    }

    // Sort by timestamp
    doses.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Add to database using transaction
    const db = await getDB();
    const tx = db.transaction("doses", "readwrite");

    try {
      await Promise.all(doses.map(dose => tx.store.add(dose)));
      await tx.done;

      return {
        success: true,
        count: doses.length,
        message: `Successfully imported ${doses.length} doses`
      };
    } catch (error) {
      tx.abort();
      throw error;
    }

  } catch (error) {
    console.error('Error importing PW Journal data:', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Failed to import PW Journal data'
    );
  }
}