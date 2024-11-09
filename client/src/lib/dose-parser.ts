import { ROUTE_ALIASES, UNITS, type DoseEntry } from "./constants";

export class DoseParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DoseParsingError";
  }
}

const UNIT_CONVERSIONS = {
  ug: (amount: number) => ({ amount: amount / 1000, unit: "mg" as const }),
  g: (amount: number) => ({ amount: amount * 1000, unit: "mg" as const }),
  mg: (amount: number) => ({ amount, unit: "mg" as const }),
  ml: (amount: number) => ({ amount, unit: "ml" as const }),
};

const MAX_REASONABLE_DOSE = 100000; // 10g in mg
const MIN_REASONABLE_DOSE = 0.001; // 1ug in mg

export function parseDoseString(
  doseString: string,
): Omit<DoseEntry, "id" | "timestamp"> {
  if (!doseString?.trim()) {
    throw new DoseParsingError("Dose string cannot be empty");
  }

  // Define regex patterns
  const standardPattern = /^(\d+\.?\d*)(mg|ug|g|ml)\s+([\w-]+)\s+([\w-]+)$/;
  const verbPattern = /^(@\w+)\s+(\d+\.?\d*)(mg|ug|g|ml)\s+([\w-]+)$/;

  const cleanString = doseString.trim().toLowerCase();
  let match = standardPattern.exec(cleanString);

  let amount: number;
  let unit: (typeof UNITS)[number];
  let substance: string;
  let route: string;

  if (match) {
    [, amount, unit, substance, route] = match;

    // Validate route
    if (!ROUTE_ALIASES[route]) {
      throw new DoseParsingError(
        `Unknown route of administration: ${route}\n` +
          `Valid routes are: ${Object.keys(ROUTE_ALIASES).join(", ")}`,
      );
    }
  } else {
    match = verbPattern.exec(cleanString);
    if (!match) {
      throw new DoseParsingError(
        "Invalid dose format. Examples:\n" +
          "• 20mg substance oral\n" +
          "• 5ml substance oral\n" +
          "• @ate 30mg substance",
      );
    }

    const [, verb, amt, u, subst] = match;
    amount = parseFloat(amt);
    unit = u as (typeof UNITS)[number];
    substance = subst;
    route = verb;

    if (!ROUTE_ALIASES[verb]) {
      throw new DoseParsingError(
        `Unknown verb command: ${verb}\n` +
          `Valid verbs: ${Object.keys(ROUTE_ALIASES)
            .filter((r) => r.startsWith("@"))
            .join(", ")}`,
      );
    }
  }

  // Validate amount
  amount = parseFloat(amount as unknown as string);
  if (isNaN(amount)) {
    throw new DoseParsingError("Amount must be a number");
  }
  if (amount <= 0) {
    throw new DoseParsingError("Amount must be greater than 0");
  }

  // Convert units and validate reasonable ranges
  const conversion =
    UNIT_CONVERSIONS[unit as keyof typeof UNIT_CONVERSIONS]?.(amount);
  if (!conversion) {
    throw new DoseParsingError(`Invalid unit: ${unit}`);
  }

  // Validate converted amount is within reasonable range
  if (conversion.unit === "mg" && conversion.amount > MAX_REASONABLE_DOSE) {
    throw new DoseParsingError(
      `Dose seems unusually high (${conversion.amount}mg). ` +
        `Please verify the amount and units.`,
    );
  }
  if (conversion.unit === "mg" && conversion.amount < MIN_REASONABLE_DOSE) {
    throw new DoseParsingError(
      `Dose seems unusually low (${conversion.amount}mg). ` +
        `Please verify the amount and units.`,
    );
  }

  // Validate substance name
  if (substance.length < 2) {
    throw new DoseParsingError("Substance name is too short");
  }
  if (substance.length > 50) {
    throw new DoseParsingError("Substance name is too long");
  }

  return {
    substance: substance.toLowerCase(),
    amount: conversion.amount,
    route: ROUTE_ALIASES[route],
    unit: conversion.unit,
  };
}
