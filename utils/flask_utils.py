"""Utilities for Flask request handling."""

from flask import request
from typing import Dict


def get_request_params(default_year: str = "2026", 
                      default_term: str = "1", 
                      default_campus: str = "NB") -> Dict[str, str]:
    """
    Extract common request parameters (year, term, campus) from Flask request.
    
    Args:
        default_year: Default year value if not provided
        default_term: Default term value if not provided
        default_campus: Default campus value if not provided
        
    Returns:
        Dictionary with 'year', 'term', and 'campus' keys
    """
    return {
        'year': request.args.get('year', default_year),
        'term': request.args.get('term', default_term),
        'campus': request.args.get('campus', default_campus)
    }

