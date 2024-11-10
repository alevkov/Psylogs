import { ROUTE_ALIASES, UNITS, type DoseEntry } from "./constants";

export class DoseParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DoseParsingError";
  }
}

const UNIT_CONVERSIONS = {
  ug: (amount: number) => ({ amount: amount / 1000, unit: "mg" as const }), // Convert to mg
  g: (amount: number) => ({ amount: amount * 1000, unit: "mg" as const }), // Convert to mg
  mg: (amount: number) => ({ amount, unit: "mg" as const }), // Keep as is
  ml: (amount: number) => ({ amount, unit: "ml" as const }), // Keep ml as is
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
        "1. 'amount[unit] substance route' (e.g., '20mg methamphetamine oral' or '5ml morphine oral')\n" +
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

  // Convert amount to number and apply unit conversion if needed
  amount = parseFloat(amount as unknown as string);
  if (isNaN(amount) || amount <= 0) {
    throw new DoseParsingError("Amount must be a positive number");
  }

  const conversion = UNIT_CONVERSIONS[unit as keyof typeof UNIT_CONVERSIONS](amount);

  return {
    substance: substance.toLowerCase(),
    amount: conversion.amount,
    route: ROUTE_ALIASES[route],
    unit: conversion.unit
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

export function calculateAverageDoseByUnit(entries: DoseEntry[]): Record<string, number> {
  const totals: Record<string, { sum: number; count: number }> = {};
  
  entries.forEach(entry => {
    if (!totals[entry.unit]) {
      totals[entry.unit] = { sum: 0, count: 0 };
    }
    totals[entry.unit].sum += entry.amount;
    totals[entry.unit].count += 1;
  });

  return Object.entries(totals).reduce((acc, [unit, { sum, count }]) => {
    acc[unit] = count > 0 ? sum / count : 0;
    return acc;
  }, {} as Record<string, number>);
}

export function calculateMedianDoseByUnit(entries: DoseEntry[]): Record<string, number> {
  const valuesByUnit: Record<string, number[]> = {};
  
  entries.forEach(entry => {
    if (!valuesByUnit[entry.unit]) {
      valuesByUnit[entry.unit] = [];
    }
    valuesByUnit[entry.unit].push(entry.amount);
  });

  return Object.entries(valuesByUnit).reduce((acc, [unit, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    acc[unit] = sorted.length === 0 ? 0 : 
                sorted.length % 2 === 0 ? 
                (sorted[mid - 1] + sorted[mid]) / 2 : 
                sorted[mid];
    return acc;
  }, {} as Record<string, number>);
}

export function calculateTotalDoseByUnit(entries: DoseEntry[]): Record<string, number> {
  return entries.reduce((acc, entry) => {
    acc[entry.unit] = (acc[entry.unit] || 0) + entry.amount;
    return acc;
  }, {} as Record<string, number>);
}
