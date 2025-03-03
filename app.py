import os
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
from apscheduler.schedulers.background import BackgroundScheduler
from course_fetcher import CourseFetcher
import logging
import json
from rapidfuzz import process

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key")

# Configure CORS
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET')
    return response

# Configure rate limiting
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["10 per minute"],
    storage_uri="memory://"
)

# Configure caching
cache = Cache(app, config={'CACHE_TYPE': 'SimpleCache'})

# Initialize course fetcher
course_fetcher = CourseFetcher()

# Initialize scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(func=lambda: course_fetcher.update_courses("2025", "1", "NB"), trigger="interval", minutes=15)
scheduler.start()

@app.route('/')
def select_parameters():
    return render_template('select.html')

@app.route('/search')
def search():
    year = request.args.get('year', '2025')
    term = request.args.get('term', '1')
    campus = request.args.get('campus', 'NB')
    return render_template('search.html', year=year, term=term, campus=campus)

@app.route('/api/health')
@limiter.exempt
def health_check():
    return jsonify({
        "status": "healthy",
        "last_update": course_fetcher.last_update
    })

@app.route('/api/courses')
@limiter.limit("100 per minute")
def get_courses():
    try:
        year = request.args.get('year', '2025')
        term = request.args.get('term', '1')
        campus = request.args.get('campus', 'NB')
        search = request.args.get('search', '')

        courses = course_fetcher.get_courses(search=search, year=year, term=term, campus=campus)
        return jsonify({
            "status": "success",
            "data": courses,
            "last_update": course_fetcher.last_update
        })
    except Exception as e:
        logger.error(f"Error fetching courses: {str(e)}")
        return jsonify({
            "status": "error",
            "message": "Failed to fetch course data"
        }), 500

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.errorhandler(429)
def ratelimit_handler(e):
    retry_seconds = int(e.description.split('in')[1].split('seconds')[0].strip())
    return jsonify({
        "status": "error",
        "message": "Please slow down! You can only make 10 requests per minute.",
        "retry_after": retry_seconds,
        "wait_message": f"Please wait {retry_seconds} seconds before trying again."
    }), 429



# Load salary data from JSON file at startup
SALARY_FILE_PATH = "rutgers_salaries.json"
if os.path.exists(SALARY_FILE_PATH):
    with open(SALARY_FILE_PATH, "r", encoding="utf-8") as file:
        salary_data = json.load(file)
else:
    salary_data = []





from rapidfuzz import process

@app.route('/api/salary', methods=['GET'])
@limiter.limit("50 per minute")
def get_salary():
    instructor_name = request.args.get('name', '').strip()

    if not instructor_name:
        return jsonify({"error": "Missing instructor name"}), 400

    # Normalize function (case insensitive, removes extra spaces)
    def normalize_name(name):
        return name.lower().strip().replace(",", "")

    # Convert "Last, First" to "First Last"
    def convert_last_first(name):
        parts = name.split(", ")
        return f"{parts[1]} {parts[0]}" if len(parts) == 2 else name

    # Generate normalized names for comparison
    normalized_input = normalize_name(instructor_name)
    converted_input = normalize_name(convert_last_first(instructor_name))

    # Try exact matching (case insensitive)
    for person in salary_data:
        normalized_salary_name = normalize_name(person["Name"])

        if normalized_salary_name == normalized_input or normalized_salary_name == converted_input:
            return jsonify({
                "name": person["Name"],
                "title": person["Title"],
                "department": person["Department"],
                "campus": person["Campus"],
                "base_pay": person["Base Pay"],
                "gross_pay": person["Gross Pay"],
                "hire_date": person["Hire Date"]
            })

    # If no match, return closest matches (case insensitive search)
    all_names = [person["Name"].lower() for person in salary_data]
    closest_matches = process.extract(normalized_input, all_names, limit=5)

    return jsonify({
        "error": "No salary data found",
        "closest_matches": closest_matches
    }), 404





if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)