# Architecture

## Overview

This repository contains a Flask-based web application for searching and retrieving Rutgers University course information. The application serves both a web interface and provides an API for programmatic access to course data. It also includes a Discord bot component for integration with Discord.

The system fetches real-time course data from Rutgers' official API, processes and caches it, and provides various search interfaces for users to find courses by title, subject, course number, etc. Additional features include classroom/room search functionality and instructor salary information.

## System Architecture

The application follows a layered architecture pattern with the following components:

1. **Web Application Layer** - A Flask application serving both HTML templates for web users and JSON responses for API consumers
2. **Data Service Layer** - Classes responsible for fetching, processing, and caching data from external sources
3. **External API Integration** - Integration with Rutgers' course data API
4. **Discord Bot** - A separate service providing Discord integration

### Architectural Diagram

```
┌─────────────────────────────────────────────┐
│                  Client                      │
│ (Web Browser / API Consumer / Discord User)  │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│              Flask Application               │
│                                             │
│  ┌─────────────┐        ┌─────────────┐     │
│  │  Web Routes  │        │ API Routes  │     │
│  └─────────────┘        └─────────────┘     │
└───────────────┬─────────────────┬───────────┘
                │                 │
                ▼                 ▼
┌─────────────────────┐  ┌─────────────────────┐
│  Data Services      │  │  Discord Bot        │
│                     │  │                     │
│  - CourseFetcher    │  │  - Command Handling │
│  - RoomFetcher      │  │  - Event Listeners  │
│  - SalaryData       │  │                     │
└─────────────┬───────┘  └─────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│           External Data Sources              │
│                                             │
│  - Rutgers Course API                       │
│  - Salary Data Files                        │
└─────────────────────────────────────────────┘
```

## Key Components

### 1. Flask Web Application (`app.py`, `main.py`)

The main web application built with Flask that handles:
- Web page rendering using templates
- RESTful API endpoints
- Rate limiting (using `flask-limiter`)
- Caching (using `flask-caching`)
- CORS configuration
- Background tasks (using `apscheduler`)

This component is the central orchestrator that ties together all other components and serves as the primary interface for users.

### 2. Data Services

#### Course Fetcher (`course_fetcher.py`)
- Responsible for retrieving course data from Rutgers' API
- Implements data transformation and normalization
- Provides caching and periodic updates
- Includes retry logic for resilient API calls
- Uses fuzzy matching for improved search capabilities

#### Room Fetcher (`room_fetcher.py`)
- Extracts and manages room information from course data
- Provides room search and availability checking functionality
- Depends on CourseFetcher for underlying data

#### Salary Data (`salary_api.py`)
- Manages faculty/instructor salary information
- Loads data from CSV/JSON files
- Provides lookup capabilities for salary information

### 3. Discord Bot (`discord_bot.py`)

Although the full implementation is not visible in the repository contents provided, the configuration indicates the presence of a Discord bot component that likely:
- Provides Discord chat interface for accessing course information
- Handles Discord-specific commands and events
- Integrates with the main application's data services

### 4. Web UI Templates

The application uses HTML templates with Bootstrap for the frontend:
- `templates/search.html` - Main course search interface
- `templates/select.html` - Parameter selection interface
- `templates/room_search.html` & `templates/room_details.html` - Room search interfaces
- `templates/docs.html` - API documentation

## Data Flow

1. **Data Acquisition**:
   - `CourseFetcher` periodically fetches course data from Rutgers API
   - `SalaryData` loads salary information from local files
   - Both implement caching to improve performance

2. **Web User Flow**:
   - User visits the site and enters search parameters
   - Flask handles the request and queries the data services
   - Results are formatted using HTML templates and returned to the user

3. **API Consumer Flow**:
   - Consumer sends a request to an API endpoint
   - Flask validates the request and applies rate limiting
   - Data services are queried for relevant information
   - Results are returned as JSON responses

4. **Discord User Flow**:
   - User sends a command to the Discord bot
   - Bot processes the command and queries the data services
   - Results are formatted for Discord and sent as a message

## External Dependencies

### Core Dependencies
- **Flask**: Web framework
- **Flask-Limiter**: Rate limiting for API endpoints
- **Flask-Caching**: Response caching
- **APScheduler**: Background scheduled tasks
- **Requests**: HTTP client for external API calls
- **Discord.py**: Discord bot integration
- **RapidFuzz**: Fuzzy text matching for improved search

### Frontend Dependencies
- **Bootstrap**: CSS framework for responsive design
- **Custom CSS/JS**: Additional styling and interactive features

## Deployment Strategy

The application is configured for deployment on Replit with cloud runtime capabilities:

1. **Development Environment**:
   - Local development using Python 3.11
   - Dependencies managed via `pyproject.toml`

2. **Deployment Target**:
   - Primary deployment to Cloud Run (as specified in `.replit`)
   - The application exposes port 5000 for HTTP traffic

3. **Runtime Configuration**:
   - Multiple workflow configurations in `.replit` file:
     - "Project" workflow: Runs Flask server and Discord bot in parallel
     - "Flask Server" workflow: Runs only the web application
     - "Discord Bot" workflow: Runs only the Discord bot

4. **Scaling Considerations**:
   - Rate limiting to prevent abuse
   - Caching to reduce load on both the application and external APIs
   - Background job scheduling for data updates

## Security Considerations

1. **Rate Limiting**:
   - Implemented using Flask-Limiter to prevent abuse
   - Default limit of "10 per minute" with endpoint-specific configurations

2. **Data Validation**:
   - Input validation for API parameters
   - Error handling for malformed requests

3. **CORS Configuration**:
   - Configured to allow cross-origin requests for API endpoints
   - Headers configured for GET methods only

4. **Sensitive Information**:
   - Session secret handled via environment variables with fallback

## Future Considerations

Based on the current architecture, potential areas for enhancement include:

1. **Database Integration**:
   - Adding a persistent database for storing historical data
   - The presence of Flask-SQLAlchemy in dependencies suggests this may be planned

2. **Authentication**:
   - Implementing user authentication for personalized features
   - Adding authorization for API access

3. **Caching Improvements**:
   - Moving from SimpleCache to a distributed cache solution for better scaling

4. **Monitoring and Logging**:
   - Implementing more comprehensive logging
   - Adding monitoring for service health and performance