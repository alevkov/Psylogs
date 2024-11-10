from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Union
from collections import defaultdict
import re

ADMINISTRATION_METHODS = {
    "oral": ["oral", "swallowed", "chewed", "@ate"],
    "insufflation": ["insufflation", "snorted", "intranasal", "nasal", "@sniffed"],
    "inhalation": ["inhalation", "inhaled", "smoked", "vaporized"],
    "intravenous": ["intravenous-injection", "intra-arterial", "injected", "@injected"],
    "intramuscular": ["intramuscular-injection"],
    "subcutaneous": ["subcutaneous-injection", "intradermal"],
    "rectal": ["rectal", "intrarectal", "plugged", "@boofed"],
    "transdermal": ["transdermal", "dermal", "applied", "topical"],
    "sublingual": ["sublingual", "dissolved"],
    "buccal": ["buccal"],
    "other": [
        "intravaginal", "intrathecal", "intraperitoneal", "intraosseous",
        "intravitreal", "intrapleural", "intrapericardial", "intravesical",
        "intralesional", "ocular", "otic", "epidural", "absorbed",
        "administered"
    ]
}

# Reverse mapping for looking up standardized routes
ROUTE_ALIASES = {
    alias: standard
    for standard, aliases in ADMINISTRATION_METHODS.items()
    for alias in aliases
}

@dataclass
class DoseEntry:
    substance: str
    amount: float
    route: str
    timestamp: datetime = field(default_factory=datetime.now)
    unit: str = "mg"  # Default unit is mg but can be ml

class DoseParsingError(Exception):
    """Raised when a dose string cannot be parsed correctly."""
    pass

@dataclass
class User:
    name: str
    entries: List[DoseEntry] = field(default_factory=list)
    filtered_entries: List[DoseEntry] = field(default_factory=list)

    def parse_dose_string(self, dose_string: str) -> tuple[float, str, str, str]:
        """
        Parse a dose string into amount, unit, substance, and route.
        
        Valid formats:
        - "20mg methamphetamine oral"
        - "0.4ug lsd sublingual"
        - "5ml morphine oral"
        - "@ate 30mg adderall"
        - "@sniffed 30mg adderall"
        """
        # Define regex patterns
        standard_pattern = r"^(\d+\.?\d*)(mg|ug|g|ml)\s+([a-zA-Z-]+)\s+([a-zA-Z-]+)$"
        verb_pattern = r"^(@\w+)\s+(\d+\.?\d*)(mg|ug|g|ml)\s+([a-zA-Z-]+)$"
        
        # Try standard pattern first
        match = re.match(standard_pattern, dose_string.strip())
        if match:
            amount, unit, substance, route = match.groups()
            if route not in ROUTE_ALIASES:
                raise DoseParsingError(f"Unknown route of administration: {route}")
            return float(amount), unit, substance.lower(), route

        # Try verb pattern
        match = re.match(verb_pattern, dose_string.strip())
        if match:
            verb, amount, unit, substance = match.groups()
            if verb not in ROUTE_ALIASES:
                raise DoseParsingError(f"Unknown verb command: {verb}")
            return float(amount), unit, substance.lower(), verb

        raise DoseParsingError(
            "Invalid dose string format. Expected format: "
            "'amount[unit] substance route' or '@verb amount[unit] substance'"
        )

    def log_dose_string(self, dose_string: str) -> 'User':
        """Log a dose using a freeform string."""
        try:
            amount, unit, substance, route_or_verb = self.parse_dose_string(dose_string)
            
            # Convert route alias to standard route
            standard_route = ROUTE_ALIASES.get(route_or_verb)
            if not standard_route:
                raise DoseParsingError(f"Unknown route or verb: {route_or_verb}")

            # Only convert between mg/g/ug if the unit is not ml
            if unit != "ml":
                if unit == "ug":
                    amount = amount / 1000
                    unit = "mg"
                elif unit == "g":
                    amount = amount * 1000
                    unit = "mg"
            
            # Create and store the entry
            entry = DoseEntry(
                substance=substance,
                amount=amount,
                route=standard_route,
                unit=unit  # Preserve the unit (mg or ml)
            )
            self.entries.append(entry)
            return self
            
        except DoseParsingError as e:
            print(f"Error parsing dose string: {e}")
            return self
        except Exception as e:
            print(f"Unexpected error logging dose: {e}")
            return self

    def log_dose(self, substance: str, amount: float, route: str, unit: str = "mg") -> 'User':
        """Log a new dose entry with explicit parameters."""
        if route not in ROUTE_ALIASES:
            print(f"Warning: Unknown route '{route}', defaulting to 'other'")
            route = "other"
        
        standard_route = ROUTE_ALIASES.get(route, "other")
        self.entries.append(DoseEntry(substance, amount, standard_route, unit=unit))
        return self

    def only(self, *substances: str) -> 'User':
        """Filter entries by substance(s)."""
        self.filtered_entries = [
            entry for entry in self.entries 
            if entry.substance in substances
        ]
        return self

    def via(self, *routes: str) -> 'User':
        """Filter entries by route(s)."""
        self.filtered_entries = [
            entry for entry in self.filtered_entries 
            if entry.route in routes
        ]
        return self

    def last(self, n: int) -> 'User':
        """Get the last n entries."""
        self.filtered_entries = self.filtered_entries[-n:]
        return self

    def from_year(self, year: int) -> 'User':
        """Filter entries from specific year."""
        self.filtered_entries = [
            entry for entry in self.entries 
            if entry.timestamp.year == year
        ]
        return self

    def from_date_range(self, start_date: datetime, end_date: datetime) -> 'User':
        """Filter entries within date range."""
        self.filtered_entries = [
            entry for entry in self.entries 
            if start_date <= entry.timestamp <= end_date
        ]
        return self

    def tally_each(self) -> Dict[str, Dict[str, Dict[str, float]]]:
        """Calculate total amounts per substance, route and unit."""
        tally: Dict[str, Dict[str, Dict[str, float]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
        for entry in self.filtered_entries:
            tally[entry.substance][entry.route][entry.unit] += entry.amount
        return dict(tally)

    def print_tally(self) -> None:
        """Print detailed tally of doses."""
        tally = self.tally_each()
        for substance, routes in tally.items():
            print(f"\n{substance}")
            for route, units in routes.items():
                for unit, amount in units.items():
                    print(f"  {route.capitalize()}: {amount:.1f}{unit}")
            last_time = self.last_dose_time()
            if last_time:
                hours = last_time.total_seconds() / 3600
                print(f"  Last dose {hours:.1f} hours ago")

    def average_dose(self) -> Dict[str, float]:
        """Calculate average dose amount per unit."""
        if not self.filtered_entries:
            return {}
        totals: Dict[str, float] = defaultdict(float)
        counts: Dict[str, int] = defaultdict(int)
        for entry in self.filtered_entries:
            totals[entry.unit] += entry.amount
            counts[entry.unit] += 1
        return {unit: total/counts[unit] for unit, total in totals.items()}

    def last_dose_time(self) -> Optional[timedelta]:
        """Get time since last dose."""
        if not self.filtered_entries:
            return None
        last_dose = max(self.filtered_entries, key=lambda x: x.timestamp)
        return datetime.now() - last_dose.timestamp

    def median_dose(self) -> Dict[str, float]:
        """Calculate median dose amount per unit."""
        if not self.filtered_entries:
            return {}
        doses_by_unit: Dict[str, List[float]] = defaultdict(list)
        for entry in self.filtered_entries:
            doses_by_unit[entry.unit].append(entry.amount)
        
        result = {}
        for unit, doses in doses_by_unit.items():
            sorted_doses = sorted(doses)
            n = len(sorted_doses)
            mid = n // 2
            result[unit] = sorted_doses[mid] if n % 2 else (sorted_doses[mid-1] + sorted_doses[mid]) / 2
        return result

    def total_dose(self) -> Dict[str, float]:
        """Calculate total dose amount per unit."""
        totals: Dict[str, float] = defaultdict(float)
        for entry in self.filtered_entries:
            totals[entry.unit] += entry.amount
        return dict(totals)
