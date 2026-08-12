# Rutgers Course Search

Flask app for searching Rutgers courses, classroom schedules, and public instructor salary data.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Open <http://localhost:5000>.

## Deploy to Vercel

This repository is configured for Vercel's zero-configuration Flask deployment. The top-level `app.py` exports the Flask instance, `requirements.txt` declares the runtime dependencies, and `vercel.json` adds safe static-asset caching.

```bash
npx vercel
npx vercel --prod
```

Recommended environment variables:

- `SESSION_SECRET`: a long random value for Flask sessions
- `COURSE_CACHE_TTL_SECONDS`: optional in-process course cache lifetime (default: `900`)
- `CORS_ORIGIN`: optional origin if a separate frontend calls the API
- `LOG_LEVEL`: optional logging level (default: `INFO`)

Course data is fetched lazily from the Rutgers API on the first request for each year/term/campus combination. This keeps cold starts fast and avoids background scheduler threads, which are not reliable in serverless functions.

## Routes

- `/` — term/campus selection
- `/search` — course search
- `/room-search` — room search
- `/room-details` — room schedule
- `/docs` — API documentation
- `/api/courses` — course search API
- `/api/rooms` — room search API
- `/api/room-schedule` — room schedule API
- `/api/salary` — instructor salary lookup
- `/api/health` — health check
