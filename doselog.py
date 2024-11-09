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
    unit: str = "mg"  # Added unit field

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

            # Convert units to mg if necessary
            if unit == "ug":
                amount = amount / 1000
            elif unit == "g":
                amount = amount * 1000
            
            # Create and store the entry
            entry = DoseEntry(
                substance=substance,
                amount=amount,
                route=standard_route,
                unit="mg"  # Store everything in mg internally
            )
            self.entries.append(entry)
            return self
            
        except DoseParsingError as e:
            print(f"Error parsing dose string: {e}")
            return self
        except Exception as e:
            print(f"Unexpected error logging dose: {e}")
            return self

    def log_dose(self, substance: str, amount: float, route: str) -> 'User':
        """Log a new dose entry with explicit parameters."""
        if route not in ROUTE_ALIASES:
            print(f"Warning: Unknown route '{route}', defaulting to 'other'")
            route = "other"
        
        standard_route = ROUTE_ALIASES.get(route, "other")
        self.entries.append(DoseEntry(substance, amount, standard_route))
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

    def tally_each(self) -> Dict[str, Dict[str, float]]:
        """Calculate total amounts per substance and route."""
        tally: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for entry in self.filtered_entries:
            tally[entry.substance][entry.route] += entry.amount
        return dict(tally)

    def average_dose(self) -> float:
        """Calculate average dose amount."""
        if not self.filtered_entries:
            return 0.0
        return sum(entry.amount for entry in self.filtered_entries) / len(self.filtered_entries)

    def last_dose_time(self) -> Optional[timedelta]:
        """Get time since last dose."""
        if not self.filtered_entries:
            return None
        last_dose = max(self.filtered_entries, key=lambda x: x.timestamp)
        return datetime.now() - last_dose.timestamp

    def median_dose(self) -> float:
        """Calculate median dose amount."""
        if not self.filtered_entries:
            return 0.0
        doses = sorted(entry.amount for entry in self.filtered_entries)
        n = len(doses)
        mid = n // 2
        return doses[mid] if n % 2 else (doses[mid-1] + doses[mid]) / 2

    def total_dose(self) -> float:
        """Calculate total dose amount."""
        return sum(entry.amount for entry in self.filtered_entries)

    def print_tally(self) -> None:
        """Print detailed tally of doses."""
        tally = self.tally_each()
        for substance, routes in tally.items():
            total = sum(routes.values())
            print(f"{substance} (Total {total:.1f}mg)")
            for route, amount in routes.items():
                print(f"  {route.capitalize()} {amount:.1f}mg")
            last_time = self.last_dose_time()
            if last_time:
                hours = last_time.total_seconds() / 3600
                print(f"  Last dose {hours:.1f} hours ago")
        print(f"Total: {self.total_dose():.1f}mg")

def main():
    # Example usage with string parsing
    sernyl = User("sernyl")
    
    # Test various dose string formats
    test_strings = [
        "20mg methamphetamine oral",
        "0.4ug lsd sublingual",
        "@ate 30mg adderall",
        "@sniffed 25mg ketamine",
        "@boofed 100mg mdma",
        "@injected 50mg morphine"
    ]
    
    for dose_string in test_strings:
        print(f"\nLogging dose: {dose_string}")
        sernyl.log_dose_string(dose_string)

    # Print results
    print("\nAll doses:")
    sernyl.print_tally()
    
    # Test specific substance
    print("\nJust methamphetamine:")
    sernyl.only("methamphetamine").print_tally()

if __name__ == "__main__":
    main()