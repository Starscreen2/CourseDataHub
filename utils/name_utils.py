"""Utilities for normalizing and processing instructor names."""

from typing import Set


def normalize_instructor_name_variants(name: str) -> Set[str]:
    """
    Generate all normalized variants of an instructor name.
    
    Handles formats like:
    - "LAST, FIRST" -> generates "first last" and "last first"
    - "First Last" -> generates "first last" and "last first"
    
    Args:
        name: The instructor name in any format
        
    Returns:
        A set of lowercase normalized name variants
    """
    variants = set()
    
    if not name:
        return variants
    
    raw_name = name.strip()
    if not raw_name:
        return variants
    
    lower_raw = raw_name.lower()
    variants.add(lower_raw)
    
    # Normalize common formats: "LAST, FIRST" -> "first last" and "last first"
    if "," in raw_name:
        parts = [p.strip() for p in raw_name.split(",", 1)]
        if len(parts) == 2:
            last, first = parts[0], parts[1]
            first_last = f"{first} {last}".lower()
            last_first = f"{last} {first}".lower()
            variants.add(first_last)
            variants.add(last_first)
    else:
        # Also add swapped order for two-token names like "Jane Doe"
        tokens = raw_name.split()
        if len(tokens) == 2:
            swapped = f"{tokens[1]} {tokens[0]}".lower()
            variants.add(swapped)
    
    return variants


def normalize_text(text: str) -> str:
    """
    Normalize text by converting to lowercase and stripping whitespace.
    
    Args:
        text: The text to normalize
        
    Returns:
        Normalized text
    """
    return text.lower().strip()


def convert_last_first_to_first_last(name: str) -> str:
    """
    Convert "LAST, FIRST" format to "First Last" format.
    
    Args:
        name: Name in "LAST, FIRST" format
        
    Returns:
        Name in "First Last" format, or original if not in expected format
    """
    parts = name.split(", ")
    return f"{parts[1]} {parts[0]}" if len(parts) == 2 else name


def extract_name_components(name: str) -> list:
    """
    Extract name components from various formats.
    
    Handles:
    - "LAST, FIRST MIDDLE" -> [last, first, middle, ...]
    - "First Last" -> [first, last]
    
    Args:
        name: Name in any format
        
    Returns:
        List of name components (words)
    """
    components = []
    # Handle lastname, firstname format
    if ", " in name:
        parts = name.split(", ", 1)
        last_name = parts[0].strip()
        components.append(last_name)
        
        if len(parts) > 1:
            first_parts = parts[1].split()
            components.extend(first_parts)
    else:
        # Handle space-separated name
        components = name.split()
        
    return [comp.strip() for comp in components if comp.strip()]

