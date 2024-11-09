import { ROUTE_ALIASES, UNITS, type DoseEntry } from "./constants";

export class DoseParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DoseParsingError";
  }
}

export function parseDoseString(doseString: string): Omit<DoseEntry, "id" | "timestamp"> {
  const standardPattern = /^(\d+\.?\d*)(mg|ug|g|ml)\s+([a-zA-Z-]+)\s+([a-zA-Z-]+)$/;
  const verbPattern = /^(@\w+)\s+(\d+\.?\d*)(mg|ug|g|ml)\s+([a-zA-Z-]+)$/;

  const cleanString = doseString.trim();
  let match = standardPattern.exec(cleanString);
  
  let amount: number;
  let unit: typeof UNITS[number];
  let substance: string;
  let route: string;

  if (match) {
    [, amount, unit, substance, route] = match;
    if (!ROUTE_ALIASES[route]) {
      throw new DoseParsingError(`Unknown route of administration: ${route}`);
    }
  } else {
    match = verbPattern.exec(cleanString);
    if (!match) {
      throw new DoseParsingError(
        "Invalid dose string format. Expected format: 'amount[unit] substance route' or '@verb amount[unit] substance'"
      );
    }
    const [, verb, amt, u, subst] = match;
    amount = parseFloat(amt);
    unit = u as typeof UNITS[number];
    substance = subst;
    route = verb;
    
    if (!ROUTE_ALIASES[verb]) {
      throw new DoseParsingError(`Unknown verb command: ${verb}`);
    }
  }

  // Convert all measurements to mg
  amount = parseFloat(amount as unknown as string);
  if (unit === "ug") amount /= 1000;
  else if (unit === "g") amount *= 1000;

  return {
    substance: substance.toLowerCase(),
    amount,
    route: ROUTE_ALIASES[route],
    unit: "mg"
  };
}
