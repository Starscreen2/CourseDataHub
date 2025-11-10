"""Utilities for fuzzy string matching."""

from rapidfuzz import fuzz


def get_best_fuzzy_score(query: str, target: str) -> int:
    """
    Calculate the best fuzzy matching score between query and target.
    
    Uses multiple fuzzy matching algorithms and returns the highest score:
    - ratio: Standard ratio
    - partial_ratio: Partial ratio (handles substrings)
    - token_sort_ratio: Token-based sorting ratio
    - token_set_ratio: Token-based set ratio
    
    Args:
        query: The search query string
        target: The target string to match against
        
    Returns:
        The highest fuzzy matching score (0-100)
    """
    score_exact = fuzz.ratio(query, target)
    score_partial = fuzz.partial_ratio(query, target)
    score_token_sort = fuzz.token_sort_ratio(query, target)
    score_token_set = fuzz.token_set_ratio(query, target)
    
    return max(score_exact, score_partial, score_token_sort, score_token_set)

