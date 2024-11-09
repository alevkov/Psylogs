import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { DoseEntry } from './constants';

interface DoseLogDB extends DBSchema {
  doses: {
    key: number;
    value: DoseEntry;
    indexes: { 'by-date': Date };
  };
}

let db: IDBPDatabase<DoseLogDB>;

export async function getDB() {
  if (!db) {
    db = await openDB<DoseLogDB>('dose-log', 1, {
      upgrade(db) {
        const store = db.createObjectStore('doses', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-date', 'timestamp');
      },
    });
  }
  return db;
}

export async function addDose(dose: Omit<DoseEntry, 'id'>) {
  const db = await getDB();
  return db.add('doses', { ...dose, timestamp: new Date() });
}

export async function getDoses() {
  const db = await getDB();
  return db.getAllFromIndex('doses', 'by-date');
}

export async function clearDoses() {
  const db = await getDB();
  return db.clear('doses');
}

export async function exportData() {
  const doses = await getDoses();
  const blob = new Blob([JSON.stringify(doses, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dose-log-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importData(file: File) {
  const text = await file.text();
  const doses: DoseEntry[] = JSON.parse(text);
  const db = await getDB();
  await clearDoses();
  await Promise.all(doses.map(dose => db.add('doses', dose)));
}
