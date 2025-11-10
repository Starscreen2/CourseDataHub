import os
import json
import csv
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
        self.json_path = os.path.join(base_dir, "rutgers_salaries.json")
        self.salaries = self._load_salaries()

    def _load_salaries(self):
        """Loads salary data from CSV or JSON."""
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

        elif os.path.exists(self.json_path):
            try:
                with open(self.json_path, "r", encoding="utf-8") as jsonfile:
                    salaries = json.load(jsonfile)
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
        
        print(f"🔎 Searching for: {normalized_name} OR {converted_name}")

        # First: Exact match search
        results = [
            entry for entry in self.salaries
            if normalize_text(entry.get("Name", "")) in [normalized_name, converted_name]
        ]

        if results:
            print(f"✅ Found exact match: {results[0]}")
            return results  # Return immediately if a match is found

        print("No exact match found! Performing component search...")  
        
        # Second: Search by name components (both first name and last name)
        if len(name_components) >= 1:
            print(f"👓 Searching by components: {name_components}")
            all_matches = []
            
            for component in name_components:
                if len(component) >= 3:  # Only use components with at least 3 characters
                    component = normalize_text(component)
                    matches = [
                        entry for entry in self.salaries
                        if component in normalize_text(entry.get("Name", "")).split()
                    ]
                    all_matches.extend(matches)
            
            # Remove duplicates by converting to a dict and back to a list
            unique_matches = list({entry.get("Name", ""): entry for entry in all_matches}.values())
            
            if unique_matches:
                if len(unique_matches) == 1:
                    print(f"✅ Found unique component match: {unique_matches[0]}")
                    return unique_matches
                else:
                    # If multiple matches, try to find the closest one
                    print(f"⚠️ Found multiple matches ({len(unique_matches)}), using first match")
                    return [unique_matches[0]]
        
        # Third: As a last resort, try a single-word search
        if " " not in normalized_name:
            results = [
                entry for entry in self.salaries
                if normalized_name in normalize_text(entry.get("Name", "")).split()
            ]

            if results:
                print(f"✅ Found single-word match: {results[0]}")
                return results

        print("⚠️ No match found!")
        return None



