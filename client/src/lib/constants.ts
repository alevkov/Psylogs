export const ADMINISTRATION_METHODS = {
  oral: ["oral", "swallowed", "chewed", "@ate", "@drank"],
  intranasal: ["insufflation", "snorted", "intranasal", "nasal", "@sniffed"],
  inhaled: ["inhalation", "inhaled", "smoked", "vaporized", "@smoked", "@vaped"],
  intravenous: ["intravenous-injection", "intra-arterial", "injected", "@injected", "IV"],
  intramuscular: ["intramuscular-injection", "IM"],
  subcutaneous: ["subcutaneous-injection", "intradermal"],
  rectal: ["rectal", "intrarectal", "plugged", "@boofed"],
  transdermal: ["transdermal", "dermal", "applied", "topical"],
  sublingual: ["sublingual", "dissolved"],
  buccal: ["buccal"],
  other: [
    "intravaginal", "intrathecal", "intraperitoneal", "intraosseous",
    "intravitreal", "intrapleural", "intrapericardial", "intravesical",
    "intralesional", "ocular", "otic", "epidural", "absorbed",
    "administered"
  ]
} as const;

export const ROUTE_ALIASES = Object.entries(ADMINISTRATION_METHODS).reduce(
  (acc, [standard, aliases]) => {
    aliases.forEach(alias => { acc[alias] = standard; });
    return acc;
  },
  {} as Record<string, string>
);

export const UNITS = ["mg", "g", "ug", "ml"] as const;

export interface Note {
  id?: string;
  timestamp: string;
  text: string;
}

export interface DoseEntry {
  id?: number;
  substance: string;
  amount: number;
  route: string;
  timestamp: string;
  unit: typeof UNITS[number];
  onsetAt?: string;
  peakAt?: string;
  offsetAt?: string;
  notes?: Note[];
}

export interface GeneralNote {
  id?: string;
  timestamp: string;
  text: string;
  title: string;
  experienceId?: string; // Optional reference to the source experience
}
