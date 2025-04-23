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

  // Define regex patterns - allow more complex substance names with abbreviated names, numbers, dashes, commas, periods
  // Improved patterns with more strict checking for amount+unit and more flexible substance names
  const standardPattern = /^(\d+\.?\d*)\s*(mg|ug|g|ml)\s+([\w\d\-\,\.\s\/\(\)]+?)\s+([\w\-]+)$/i;
  const verbPattern = /^(@\w+)\s+(\d+\.?\d*)\s*(mg|ug|g|ml)\s+([\w\d\-\,\.\s\/\(\)]+?)$/i;

  const cleanString = doseString.trim().toLowerCase();
  let match = standardPattern.exec(cleanString);

  let amount: number;
  let unit: (typeof UNITS)[number];
  let substance: string;
  let route: string;

  if (match) {
    let amountStr;
    let unitStr;
    [, amountStr, unitStr, substance, route] = match;
    amount = parseFloat(amountStr);
    unit = unitStr as (typeof UNITS)[number];
    substance = substance.trim(); // Trim any extra spaces

    // Validate and normalize route
    route = route.toLowerCase().trim();
    
    // If route is not found, try to find a close match
    if (!ROUTE_ALIASES[route]) {
      // Try to find the closest route by checking if any valid route contains this string
      const closestRoute = Object.keys(ROUTE_ALIASES).find(r => 
        r.toLowerCase().includes(route) || route.includes(r.toLowerCase())
      );
      
      if (closestRoute) {
        // Use the closest match
        route = closestRoute;
      } else {
        // Provide helpful error message with common routes
        const commonRoutes = ["oral", "nasal", "smoked", "IV", "IM", "rectal", "sublingual"];
        throw new DoseParsingError(
          `Unknown route of administration: ${route}\n` +
          `Common routes are: ${commonRoutes.join(", ")}\n` +
          `Full list: ${Object.keys(ROUTE_ALIASES).slice(0, 15).join(", ")}...`,
        );
      }
    }
  } else {
    match = verbPattern.exec(cleanString);
    if (!match) {
      throw new DoseParsingError(
        "Invalid dose format. Examples:\n" +
          "• 20mg diazepam oral\n" +
          "• 5ml 2m2b oral\n" + 
          "• 150mg 4-mph nasal\n" + 
          "• @ate 30mg 3-meo-pcp",
      );
    }

    const [, rawVerb, amt, u, subst] = match;
    amount = parseFloat(amt);
    unit = u as (typeof UNITS)[number];
    substance = subst.trim(); // Trim any extra spaces
    
    // Normalize and validate verb
    let normalizedVerb = rawVerb.toLowerCase().trim();
    
    if (!ROUTE_ALIASES[normalizedVerb]) {
      // Check if it's a malformed @ command
      if (normalizedVerb.startsWith('@')) {
        // Try to find a close match among @ commands
        const verbCommands = Object.keys(ROUTE_ALIASES).filter(r => r.startsWith('@'));
        const closestVerb = verbCommands.find(v => 
          v.slice(1).includes(normalizedVerb.slice(1)) || normalizedVerb.slice(1).includes(v.slice(1))
        );
        
        if (closestVerb) {
          // Use the closest match
          normalizedVerb = closestVerb;
        } else {
          throw new DoseParsingError(
            `Unknown verb command: ${normalizedVerb}\n` +
            `Valid verbs: ${Object.keys(ROUTE_ALIASES)
              .filter((r) => r.startsWith("@"))
              .join(", ")}`,
          );
        }
      } else {
        throw new DoseParsingError(
          `Unknown verb command: ${normalizedVerb}\n` +
          `Valid verbs: ${Object.keys(ROUTE_ALIASES)
            .filter((r) => r.startsWith("@"))
            .join(", ")}`,
        );
      }
    }
    
    // Set the route to the normalized verb
    route = normalizedVerb;
  }

  // Validate amount with more thorough checks
  amount = parseFloat(amount as unknown as string);
  if (isNaN(amount)) {
    throw new DoseParsingError("Amount must be a number");
  }
  if (amount <= 0) {
    throw new DoseParsingError("Amount must be greater than 0");
  }
  
  // Prevent unreasonably large values right away before unit conversion
  if (amount > 1000000) {
    throw new DoseParsingError(`Dose amount is unreasonably high (${amount}). Please check your input.`);
  }

  // Make sure the unit is valid before attempting conversion
  unit = unit.toLowerCase() as (typeof UNITS)[number];
  if (!UNITS.includes(unit as any)) {
    throw new DoseParsingError(
      `Invalid unit: ${unit}. Valid units are: ${UNITS.join(', ')}`
    );
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
