import { ROUTE_ALIASES, UNITS, type DoseEntry } from "./constants";

export class DoseParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DoseParsingError";
  }
}

const UNIT_CONVERSIONS = {
  ug: (amount: number) => amount / 1000, // Convert to mg
  g: (amount: number) => amount * 1000,  // Convert to mg
  mg: (amount: number) => amount,        // Keep as is
  ml: (amount: number) => amount,        // Volume unit, keep as is
};

export function parseDoseString(doseString: string): Omit<DoseEntry, "id" | "timestamp"> {
  // Define regex patterns matching Python implementation
  const standardPattern = /^(\d+\.?\d*)(mg|ug|g|ml)\s+([a-zA-Z-]+)\s+([a-zA-Z-]+)$/;
  const verbPattern = /^(@\w+)\s+(\d+\.?\d*)(mg|ug|g|ml)\s+([a-zA-Z-]+)$/;

  const cleanString = doseString.trim().toLowerCase();
  let match = standardPattern.exec(cleanString);
  
  let amount: number;
  let unit: typeof UNITS[number];
  let substance: string;
  let route: string;

  if (match) {
    [, amount, unit, substance, route] = match;
    if (!ROUTE_ALIASES[route]) {
      throw new DoseParsingError(
        `Unknown route of administration: ${route}\n` +
        `Valid routes are: ${Object.keys(ROUTE_ALIASES).join(", ")}`
      );
    }
  } else {
    match = verbPattern.exec(cleanString);
    if (!match) {
      throw new DoseParsingError(
        "Invalid dose string format.\n" +
        "Expected formats:\n" +
        "1. 'amount[unit] substance route' (e.g., '20mg methamphetamine oral')\n" +
        "2. '@verb amount[unit] substance' (e.g., '@ate 30mg adderall')"
      );
    }
    const [, verb, amt, u, subst] = match;
    amount = parseFloat(amt);
    unit = u as typeof UNITS[number];
    substance = subst;
    route = verb;
    
    if (!ROUTE_ALIASES[verb]) {
      throw new DoseParsingError(
        `Unknown verb command: ${verb}\n` +
        `Valid verbs are: ${Object.keys(ROUTE_ALIASES)
          .filter(r => r.startsWith("@"))
          .join(", ")}`
      );
    }
  }

  // Convert amount to number and apply unit conversion
  amount = parseFloat(amount as unknown as string);
  const convertedAmount = UNIT_CONVERSIONS[unit as keyof typeof UNIT_CONVERSIONS](amount);

  // Validate the converted amount
  if (isNaN(convertedAmount) || convertedAmount <= 0) {
    throw new DoseParsingError("Amount must be a positive number");
  }

  return {
    substance: substance.toLowerCase(),
    amount: convertedAmount,
    route: ROUTE_ALIASES[route],
    unit: "mg" // Store everything in mg internally
  };
}

// Export utility functions for filtering and calculations
export function filterBySubstance(entries: DoseEntry[], substances: string[]): DoseEntry[] {
  return entries.filter(entry => substances.includes(entry.substance));
}

export function filterByRoute(entries: DoseEntry[], routes: string[]): DoseEntry[] {
  return entries.filter(entry => routes.includes(entry.route));
}

export function filterByDateRange(
  entries: DoseEntry[],
  startDate: Date,
  endDate: Date
): DoseEntry[] {
  return entries.filter(
    entry => entry.timestamp >= startDate && entry.timestamp <= endDate
  );
}

export function calculateAverageDose(entries: DoseEntry[]): number {
  if (entries.length === 0) return 0;
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  return total / entries.length;
}

export function calculateMedianDose(entries: DoseEntry[]): number {
  if (entries.length === 0) return 0;
  const sorted = [...entries].sort((a, b) => a.amount - b.amount);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1].amount + sorted[mid].amount) / 2
    : sorted[mid].amount;
}

export function calculateTotalDose(entries: DoseEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}
