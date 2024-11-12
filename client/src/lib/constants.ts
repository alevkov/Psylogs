export const ADMINISTRATION_METHODS = {
  oral: ["oral", "swallowed", "chewed", "@ate", "@drank"],
  insufflation: ["insufflation", "snorted", "intranasal", "nasal", "@sniffed"],
  inhalation: ["inhalation", "inhaled", "smoked", "vaporized"],
  intravenous: ["intravenous-injection", "intra-arterial", "injected", "@injected"],
  intramuscular: ["intramuscular-injection"],
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

export interface DoseEntry {
  id?: number;
  substance: string;
  amount: number;
  route: string;
  timestamp: Date;
  unit: typeof UNITS[number];
}
