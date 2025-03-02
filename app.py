import os
import csv
import re
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
from apscheduler.schedulers.background import BackgroundScheduler
from course_fetcher import CourseFetcher
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key")

# Load instructor data from CSV
instructor_data = {}
try:
    with open('attached_assets/rutgers_salaries.csv', 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        for row in reader:
            name = row['Name'].strip().upper() if row['Name'] else ""
            if name:
                instructor_data[name] = {
                    'name': row['Name'],
                    'campus': row['Campus'],
                    'department': row['Department'],
                    'title': row['Title'],
                    'hire_date': row['Hire Date'],
                    'base_pay': row['Base Pay'],
                    'gross_pay': row['Gross Pay']
                }
    logger.info(f"Loaded information for {len(instructor_data)} instructors")
except Exception as e:
    logger.error(f"Error loading instructor data: {str(e)}")
    instructor_data = {}

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

@app.route('/api/instructor/<name>')
@limiter.limit("100 per minute")
def get_instructor_info(name):
    try:
        # Try to find exact match first
        instructor_info = instructor_data.get(name.upper())
        
        # If no exact match, try to find a partial match
        if not instructor_info:
            # Convert last, first format to LAST, FIRST for matching
            name_parts = name.split(',')
            if len(name_parts) == 2:
                search_name = f"{name_parts[0].strip().upper()}, {name_parts[1].strip().upper()}"
                for instructor_name, info in instructor_data.items():
                    if search_name in instructor_name:
                        instructor_info = info
                        break
            else:
                # Try matching just the last name
                search_last_name = name.strip().upper()
                for instructor_name, info in instructor_data.items():
                    if instructor_name.startswith(search_last_name + ",") or instructor_name.startswith(search_last_name + " "):
                        instructor_info = info
                        break
        
        if instructor_info:
            return jsonify({
                "status": "success",
                "data": instructor_info
            })
        else:
            return jsonify({
                "status": "not_found",
                "message": "Instructor information not found"
            }), 404
    except Exception as e:
        logger.error(f"Error fetching instructor information: {str(e)}")
        return jsonify({
            "status": "error",
            "message": "Failed to fetch instructor information"
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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)