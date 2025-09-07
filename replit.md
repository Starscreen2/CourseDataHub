# Rutgers Course Search

## Overview

Rutgers Course Search is a Flask-based web application that provides real-time access to Rutgers University course information, room schedules, and instructor salary data. The application serves as a comprehensive search tool for students and faculty to explore course offerings, check room availability, and access public salary information. It features a REST API backend with automatic data updates and a responsive Bootstrap frontend with multiple search interfaces.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Framework**: Flask web framework with Python 3.11
- **API Design**: RESTful API endpoints for courses, rooms, and salary data
- **Data Fetching**: Dedicated service classes (`CourseFetcher`, `RoomFetcher`, `SalaryData`) for external data integration
- **Caching Strategy**: Flask-Caching with SimpleCache for performance optimization
- **Rate Limiting**: Flask-Limiter with memory storage for API protection
- **Background Processing**: APScheduler for automatic course data updates every 15 minutes
- **Session Management**: Flask sessions with configurable secret keys

### Frontend Architecture
- **UI Framework**: Bootstrap 5.3 for responsive design
- **Styling**: Custom CSS with Rutgers branding (scarlet red color scheme)
- **JavaScript**: Vanilla JavaScript for API interactions and dynamic content
- **Template Engine**: Jinja2 templates for server-side rendering
- **Icons**: Bootstrap Icons for consistent iconography

### Data Processing
- **Web Scraping**: BeautifulSoup for parsing Rutgers course pages
- **HTTP Requests**: Requests library with retry strategies and session management
- **Fuzzy Matching**: RapidFuzz for intelligent search and name matching
- **Data Validation**: Input sanitization and error handling throughout the pipeline

### Application Structure
- **Entry Point**: `main.py` for development server startup
- **Core Application**: `app.py` with route definitions and middleware configuration
- **Service Layer**: Separate classes for course fetching, room management, and salary data
- **Static Assets**: CSS, JavaScript, and JSON files served from `/static`
- **Templates**: HTML templates for different search interfaces and documentation

### Security Features
- **CORS Configuration**: Proper cross-origin resource sharing setup
- **Rate Limiting**: Multiple tiers (daily, hourly, per-minute) to prevent abuse
- **Input Validation**: Sanitization of user inputs and API parameters
- **Error Handling**: Comprehensive exception handling with logging

## External Dependencies

### Third-Party Services
- **Rutgers Course API**: `https://classes.rutgers.edu/soc/api/courses.json` for real-time course data
- **Rutgers SAS Website**: Web scraping for major/minor requirements and advising information

### Python Libraries
- **Flask Ecosystem**: Flask, Flask-Limiter, Flask-Caching for web framework functionality
- **Web Scraping**: BeautifulSoup4, Requests for data extraction from external websites
- **Data Processing**: RapidFuzz for fuzzy string matching, JSON/CSV for data handling
- **Scheduling**: APScheduler for background task management
- **HTTP Handling**: urllib3 with retry strategies for robust API calls

### Frontend Dependencies
- **Bootstrap 5.3**: CSS framework from CDN for responsive UI components
- **Bootstrap Icons**: Icon library for consistent visual elements
- **Google Fonts**: Inter and IBM Plex Mono fonts for typography

### Development Tools
- **Static Assets**: Local CSS and JavaScript files for custom functionality
- **Data Storage**: JSON and CSV files for salary data and course information caching
- **Configuration**: Environment-based configuration for secrets and deployment settings