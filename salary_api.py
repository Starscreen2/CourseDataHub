import os
import csv
from collections import defaultdict
from utils.name_utils import (
    normalize_text,
    convert_last_first_to_first_last,
    extract_name_components
)

class SalaryData:
    """Handles loading and retrieving Rutgers instructor salaries."""

    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.csv_path = os.path.join(base_dir, "rutgers_salaries.csv")
        self.salaries = self._load_salaries()
        self._exact_index = {}
        self._component_index = defaultdict(dict)
        self._entries_by_name = {}
        self._build_indexes()

    def _build_indexes(self):
        """Build lookup indexes once instead of scanning the CSV per request."""
        for entry in self.salaries:
            name = entry.get("Name", "")
            normalized = normalize_text(name)
            if not normalized:
                continue
            self._entries_by_name[name] = entry
            variants = {normalized, normalize_text(convert_last_first_to_first_last(name))}
            for variant in variants:
                if variant:
                    self._exact_index.setdefault(variant, entry)
            for component in normalized.split():
                if len(component) >= 3:
                    self._component_index[component].setdefault(name, entry)

    def _load_salaries(self):
        """Load the canonical salary CSV once at process startup."""
        salaries = []

        if os.path.exists(self.csv_path):
            try:
                with open(self.csv_path, newline='', encoding='utf-8') as csvfile:
                    reader = csv.DictReader(csvfile)
                    for row in reader:
                        cleaned_row = {key.strip(): value.strip() for key, value in row.items()}
                        salaries.append(cleaned_row)
                return salaries
            except Exception:
                pass

        return []

    def get_all_salaries(self):
        """Returns all salaries."""
        return self.salaries

    def get_salary_by_instructor(self, name):
        """Search for an instructor's salary by name, handling different name formats, including partial matches."""

        normalized_name = normalize_text(name)
        converted_name = normalize_text(convert_last_first_to_first_last(name))
        name_components = extract_name_components(name)

        # First: Exact match search
        exact = self._exact_index.get(normalized_name) or self._exact_index.get(converted_name)
        if exact:
            return [exact]
        
        # Second: Search by name components (both first name and last name)
        if len(name_components) >= 1:
            match_scores = defaultdict(int)
            for component in name_components:
                if len(component) >= 3:  # Only use components with at least 3 characters
                    component = normalize_text(component)
                    for display_name in self._component_index.get(component, {}):
                        match_scores[display_name] += 1

            if match_scores:
                best_name = max(
                    match_scores,
                    key=lambda candidate: (match_scores[candidate], candidate),
                )
                return [self._entries_by_name[best_name]]
        
        # Third: As a last resort, try a single-word search
        if " " not in normalized_name:
            matches = self._component_index.get(normalized_name, {})
            if matches:
                return [next(iter(matches.values()))]

        return None
