# Rutgers Course Search

## Overview

Rutgers Course Search is a Flask app for finding course offerings, classroom schedules, room availability, and public instructor salary data.

## Architecture

- `app.py` defines the page and API routes.
- `course_fetcher.py` fetches Rutgers course data on demand and keeps it in an in-process cache with a configurable time to live.
- `room_fetcher.py` derives room inventories and schedules from the course data.
- `salary_api.py` searches the bundled `rutgers_salaries.csv` data.
- Jinja templates, Bootstrap, and vanilla JavaScript provide the interface.
- The planner stores selected courses in browser `localStorage`; the app does not need an account or database.
- API limits use Flask-Limiter's in-memory storage by default.

## Data sources

- Rutgers course offerings: `https://classes.rutgers.edu/soc/api/courses.json`
- Instructor salaries: bundled `rutgers_salaries.csv`
- `Degree_Scrapper.py` is a manual maintenance script for refreshing `majors_minors_requirements.csv`; the web app does not import it.

## Runtime

The project requires Python 3.12. Replit starts the Flask development server with `python main.py` on port 5000.

## Deployment

Vercel serves the Flask app from the top-level `app.py`. Course data loads on the first request for a year, term, and campus; the app does not use a background scheduler.
